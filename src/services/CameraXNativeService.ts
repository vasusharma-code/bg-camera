import { NativeModules, Platform } from 'react-native';

type CameraXOptions = {
  quality: '480p' | '720p' | '1080p';
  recordAudio: boolean;
};

type CameraXStatus = {
  isRecording: boolean;
  latestOutputPath?: string | null;
  latestError?: string | null;
};

const nativeModule = NativeModules.CameraXRecorderModule as {
  startRecording: (options: CameraXOptions) => Promise<boolean>;
  stopRecording: () => Promise<string>;
  getStatus: () => Promise<CameraXStatus>;
} | null;

class CameraXNativeServiceClass {
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!nativeModule;
  }

  async startRecording(options: CameraXOptions): Promise<void> {
    if (!this.isAvailable() || !nativeModule) {
      throw new Error('CameraX native recorder is not available');
    }
    await nativeModule.startRecording(options);
  }

  async stopRecording(): Promise<string> {
    if (!this.isAvailable() || !nativeModule) {
      throw new Error('CameraX native recorder is not available');
    }
    return nativeModule.stopRecording();
  }

  async getStatus(): Promise<CameraXStatus> {
    if (!this.isAvailable() || !nativeModule) {
      return { isRecording: false };
    }
    return nativeModule.getStatus();
  }
}

export const CameraXNativeService = new CameraXNativeServiceClass();

