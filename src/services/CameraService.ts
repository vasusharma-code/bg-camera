import { CameraView, CameraType } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { UploadService } from './UploadService';
import { SettingsService } from './SettingsService';
import { StorageService } from './StorageService';

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
  private currentRecording: any = null;
  private chunkTimer: NodeJS.Timeout | null = null;
  private currentChunkIndex = 0;
  private recordingStartTime = 0;
  private config: RecordingConfig | null = null;

  async startRecording(config: RecordingConfig): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    try {
      this.config = config;
      this.isRecording = true;
      this.currentChunkIndex = 0;
      this.recordingStartTime = Date.now();

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
      if (this.currentRecording) {
        await this.stopCurrentChunk();
      }

      this.config = null;
      this.currentChunkIndex = 0;
      this.recordingStartTime = 0;

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
      const fileName = this.generateChunkFileName();
      const filePath = `${FileSystem.documentDirectory}surveillance_chunks/${fileName}`;

      // Ensure directory exists
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}surveillance_chunks/`,
        { intermediates: true }
      );

      // Configure recording options based on settings
      const recordingOptions = {
        quality: this.getVideoQualityConfig(settings.videoQuality),
        maxDuration: settings.chunkDurationMinutes * 60, // Convert to seconds
        mute: !settings.recordAudio,
      };

      // Start camera recording
      this.currentRecording = await this.config.camera.recordAsync({
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
    if (!this.currentRecording || !this.config) {
      return;
    }

    try {
      // Stop the recording
      this.config.camera.stopRecording();
      const result = await this.currentRecording;

      if (result && result.uri) {
        // Get file info
        const fileInfo = await FileSystem.getInfoAsync(result.uri);

        if (fileInfo.exists) {
          const chunk: VideoChunk = {
            path: result.uri,
            duration: Date.now() - this.recordingStartTime,
            size: fileInfo.size || 0,
            timestamp: Date.now(),
            chunkIndex: this.currentChunkIndex,
          };

          // Add to upload queue
          await UploadService.addToQueue(chunk);

          // Notify completion
          this.config.onChunkComplete(result.uri);

          console.log(`Chunk completed: ${result.uri}, Size: ${chunk.size} bytes`);
        }
      }

      this.currentRecording = null;
    } catch (error) {
      console.error('Error stopping current chunk:', error);
      throw error;
    }
  }

  private generateChunkFileName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const deviceId = this.getDeviceId();
    return `surveillance_${deviceId}_${timestamp}_chunk${this.currentChunkIndex}.${Platform.OS === 'ios' ? 'mov' : 'mp4'}`;
  }

  private getDeviceId(): string {
    // This should be implemented to get a consistent device ID
    // For now, use a simple random string
    return Math.random().toString(36).substring(2, 8);
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