import { CameraView, CameraType } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { UploadService } from './UploadService';
import { SettingsService } from './SettingsService';
import { AuthService } from './AuthService';
import { RECORDINGS_DIR } from '@/src/constants/paths';

export interface RecordingConfig {
  camera: CameraView;
  facing: CameraType;
  onChunkComplete: (chunkPath: string) => void;
  onError: (error: Error) => void;
}

export interface VideoChunk {
  path: string;
  duration: number;
  size: number;
  timestamp: number;
  chunkIndex: number;
}

class CameraServiceClass {
  private isRecording = false;
  private currentRecordingPromise: Promise<{ uri: string } | undefined> | null = null;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private currentChunkIndex = 0;
  private currentChunkStartTime = 0;
  private currentChunkFileName: string | null = null;
  private stableDeviceId: string | null = null;
  private config: RecordingConfig | null = null;

  async startRecording(config: RecordingConfig): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    try {
      this.config = config;
      this.isRecording = true;
      this.currentChunkIndex = 0;
      this.currentChunkStartTime = Date.now();
      this.currentChunkFileName = null;

      await this.startNextChunk();

      console.log('Camera recording started successfully');
    } catch (error) {
      this.isRecording = false;
      this.config = null;
      throw new Error(`Failed to start recording: ${(error as Error).message}`);
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    try {
      this.isRecording = false;

      // Clear chunk timer
      if (this.chunkTimer) {
        clearTimeout(this.chunkTimer);
        this.chunkTimer = null;
      }

      // Stop current recording
      if (this.currentRecordingPromise) {
        await this.stopCurrentChunk();
      }

      this.config = null;
      this.currentChunkIndex = 0;
      this.currentChunkStartTime = 0;
      this.currentChunkFileName = null;

      console.log('Camera recording stopped successfully');
    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }

  private async startNextChunk(): Promise<void> {
    if (!this.isRecording || !this.config) {
      return;
    }

    try {
      const settings = await SettingsService.getSettings();
      const fileName = await this.generateChunkFileName();
      await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });

      // Configure recording options based on settings
      const recordingOptions = {
        quality: this.getVideoQualityConfig(settings.videoQuality),
        maxDuration: settings.chunkDurationMinutes * 60, // Convert to seconds
        mute: !settings.recordAudio,
      };

      this.currentChunkFileName = fileName;
      this.currentChunkStartTime = Date.now();
      this.currentRecordingPromise = this.config.camera.recordAsync({
        ...recordingOptions,
        outputFileType: Platform.OS === 'ios' ? 'mov' : 'mp4',
      } as any);

      console.log(`Started recording chunk: ${fileName}`);

      // Set timer for chunk duration
      this.chunkTimer = setTimeout(() => {
        this.completeCurrentChunk();
      }, settings.chunkDurationMinutes * 60 * 1000);

    } catch (error) {
      console.error('Failed to start chunk recording:', error);
      this.config?.onError(new Error(`Failed to start chunk: ${(error as Error).message}`));
    }
  }

  private async completeCurrentChunk(): Promise<void> {
    if (!this.isRecording || !this.config) {
      return;
    }

    try {
      await this.stopCurrentChunk();

      // Start next chunk if still recording
      if (this.isRecording) {
        this.currentChunkIndex++;
        await this.startNextChunk();
      }
    } catch (error) {
      console.error('Failed to complete chunk:', error);
      this.config.onError(new Error(`Failed to complete chunk: ${(error as Error).message}`));
    }
  }

  private async stopCurrentChunk(): Promise<void> {
    if (!this.currentRecordingPromise || !this.config) {
      return;
    }

    try {
      const currentRecordingPromise = this.currentRecordingPromise;
      const currentChunkFileName = this.currentChunkFileName;
      const chunkStartTime = this.currentChunkStartTime;

      this.currentRecordingPromise = null;
      this.currentChunkFileName = null;
      this.currentChunkStartTime = 0;

      this.config.camera.stopRecording();
      const result = await currentRecordingPromise;

      if (!result?.uri || !currentChunkFileName) {
        throw new Error('Recording finished without a valid output file');
      }

      const permanentUri = `${RECORDINGS_DIR}${currentChunkFileName}`;
      await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
      await FileSystem.moveAsync({
        from: result.uri,
        to: permanentUri,
      });

      console.log(`Moved recording to permanent storage: ${permanentUri}`);
      const fileInfo = await FileSystem.getInfoAsync(permanentUri);

      if (!fileInfo.exists || !fileInfo.size) {
        throw new Error('Recorded file was not persisted correctly');
      }

      try {
        if (await MediaLibrary.getPermissionsAsync().then((p) => p.granted)) {
          await MediaLibrary.createAssetAsync(permanentUri);
          console.log('Saved persistent chunk to gallery:', permanentUri);
        } else {
          console.warn('Media Library permission not granted, skipping gallery save');
        }
      } catch (saveError) {
        console.error('Failed to save to gallery:', saveError);
      }

      const chunk: VideoChunk = {
        path: permanentUri,
        duration: Date.now() - chunkStartTime,
        size: fileInfo.size || 0,
        timestamp: Date.now(),
        chunkIndex: this.currentChunkIndex,
      };

      await UploadService.addToQueue(chunk);
      this.config.onChunkComplete(permanentUri);

      console.log(`Chunk completed: ${permanentUri}, Size: ${chunk.size} bytes`);
    } catch (error) {
      console.error('Error stopping current chunk:', error);
      throw error;
    }
  }

  private async generateChunkFileName(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const deviceId = await this.getStableDeviceId();
    return `rec_${deviceId}_${timestamp}_${this.currentChunkIndex}.${Platform.OS === 'ios' ? 'mov' : 'mp4'}`;
  }

  private async getStableDeviceId(): Promise<string> {
    if (this.stableDeviceId) {
      return this.stableDeviceId;
    }

    try {
      const rawDeviceId = await AuthService.getDeviceId();
      this.stableDeviceId = rawDeviceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    } catch {
      this.stableDeviceId = Platform.OS;
    }

    return this.stableDeviceId;
  }

  private getVideoQualityConfig(quality: string) {
    switch (quality) {
      case '480p':
        return '480p';
      case '720p':
        return '720p';
      case '1080p':
        return '1080p';
      default:
        return '720p';
    }
  }

  // Public getters
  get recording(): boolean {
    return this.isRecording;
  }

  get currentChunk(): number {
    return this.currentChunkIndex;
  }

  // Platform-specific behavior information
  static getPlatformCapabilities() {
    return {
      platform: Platform.OS,
      backgroundRecording: Platform.OS === 'android',
      continuousRecording: Platform.OS === 'android',
      maxBackgroundTime: Platform.OS === 'ios' ? '30 seconds to 10 minutes' : 'Unlimited with foreground service',
      limitations: Platform.OS === 'ios'
        ? 'Recording stops when app is backgrounded. Resumes on foreground.'
        : 'Requires foreground service notification. May conflict with other camera apps.',
    };
  }
}

export const CameraService = new CameraServiceClass();
