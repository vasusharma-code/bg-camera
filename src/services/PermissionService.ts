import { Platform, Alert, Linking } from 'react-native';
import { Camera } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

export interface PermissionStatus {
  camera: boolean;
  microphone: boolean;
  mediaLibrary: boolean;
  notifications: boolean;
  backgroundApp?: boolean; // iOS only
}

class PermissionServiceClass {
  async requestAllPermissions(): Promise<PermissionStatus> {
    const status: PermissionStatus = {
      camera: false,
      microphone: false,
      mediaLibrary: false,
      notifications: false,
    };

    try {
      // Request camera permission
      const cameraResult = await Camera.requestCameraPermissionsAsync();
      status.camera = cameraResult.granted;

      // Request microphone permission
      const microphoneResult = await Camera.requestMicrophonePermissionsAsync();
      status.microphone = microphoneResult.granted;

      // Request media library permission
      const mediaLibraryResult = await MediaLibrary.requestPermissionsAsync();
      status.mediaLibrary = mediaLibraryResult.granted;

      // Request notification permission
      const notificationResult = await Notifications.requestPermissionsAsync();
      status.notifications = notificationResult.granted;

      // iOS specific: Background app refresh
      if (Platform.OS === 'ios') {
        status.backgroundApp = true; // Cannot programmatically check/request this
      }

      console.log('Permission status:', status);

      // Show permission guidance if any required permission is denied
      await this.handlePermissionResults(status);

      return status;
    } catch (error) {
      console.error('Failed to request permissions:', error);
      throw error;
    }
  }

  async checkPermissionStatus(): Promise<PermissionStatus> {
    const status: PermissionStatus = {
      camera: false,
      microphone: false,
      mediaLibrary: false,
      notifications: false,
    };

    try {
      // Check camera permission
      const cameraStatus = await Camera.getCameraPermissionsAsync();
      status.camera = cameraStatus.granted;

      // Check microphone permission
      const microphoneStatus = await Camera.getMicrophonePermissionsAsync();
      status.microphone = microphoneStatus.granted;

      // Check media library permission
      const mediaLibraryStatus = await MediaLibrary.getPermissionsAsync();
      status.mediaLibrary = mediaLibraryStatus.granted;

      // Check notification permission
      const notificationStatus = await Notifications.getPermissionsAsync();
      status.notifications = notificationStatus.granted;

      return status;
    } catch (error) {
      console.error('Failed to check permissions:', error);
      throw error;
    }
  }

  private async handlePermissionResults(status: PermissionStatus): Promise<void> {
    const deniedPermissions = [];

    if (!status.camera) {
      deniedPermissions.push('Camera');
    }
    if (!status.microphone) {
      deniedPermissions.push('Microphone');
    }
    if (!status.notifications) {
      deniedPermissions.push('Notifications');
    }

    if (deniedPermissions.length > 0) {
      await this.showPermissionDeniedAlert(deniedPermissions);
    }

    // Show platform-specific guidance
    if (Platform.OS === 'android') {
      await this.showAndroidGuidance(status);
    } else {
      await this.showIOSGuidance(status);
    }
  }

  private async showPermissionDeniedAlert(deniedPermissions: string[]): Promise<void> {
    return new Promise((resolve) => {
      Alert.alert(
        'Permissions Required',
        `This app needs the following permissions to work properly:\n\n${deniedPermissions.join(', ')}\n\nPlease grant these permissions in Settings.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve(),
          },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings();
              resolve();
            },
          },
        ]
      );
    });
  }

  private async showAndroidGuidance(status: PermissionStatus): Promise<void> {
    const guidanceItems = [
      '✅ Camera and Microphone permissions are required for recording',
      '✅ Notification permission enables foreground service for background recording',
      '⚠️ Disable battery optimization for this app in Settings > Battery > App optimization',
      '⚠️ Enable "Allow background activity" for continuous recording',
    ];

    if (!status.camera || !status.microphone || !status.notifications) {
      return new Promise((resolve) => {
        Alert.alert(
          'Android Setup Guide',
          guidanceItems.join('\n\n'),
          [
            {
              text: 'Battery Settings',
              onPress: () => {
                // This would open battery optimization settings if possible
                resolve();
              },
            },
            {
              text: 'OK',
              onPress: () => resolve(),
            },
          ]
        );
      });
    }
  }

  private async showIOSGuidance(status: PermissionStatus): Promise<void> {
    const guidanceItems = [
      '✅ Camera and Microphone permissions are required for recording',
      '⚠️ iOS limits background recording to preserve battery',
      '⚠️ Recording will pause when app is backgrounded',
      '⚠️ Enable "Background App Refresh" for this app in Settings',
      '✅ Recording will resume when app returns to foreground',
    ];

    if (!status.camera || !status.microphone) {
      return new Promise((resolve) => {
        Alert.alert(
          'iOS Limitations',
          guidanceItems.join('\n\n'),
          [
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
                resolve();
              },
            },
            {
              text: 'OK',
              onPress: () => resolve(),
            },
          ]
        );
      });
    }
  }

  // Check if all critical permissions are granted
  async hasCriticalPermissions(): Promise<boolean> {
    const status = await this.checkPermissionStatus();
    return status.camera && status.microphone && status.mediaLibrary;
  }

  // Request specific permission
  async requestCameraPermission(): Promise<boolean> {
    try {
      const result = await Camera.requestCameraPermissionsAsync();
      return result.granted;
    } catch (error) {
      console.error('Failed to request camera permission:', error);
      return false;
    }
  }

  async requestMicrophonePermission(): Promise<boolean> {
    try {
      const result = await Camera.requestMicrophonePermissionsAsync();
      return result.granted;
    } catch (error) {
      console.error('Failed to request microphone permission:', error);
      return false;
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    try {
      const result = await Notifications.requestPermissionsAsync();
      return result.granted;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  // Get platform-specific permission requirements
  static getPermissionRequirements() {
    return {
      platform: Platform.OS,
      required: ['camera', 'microphone'],
      recommended: ['notifications', 'mediaLibrary'],
      platformSpecific: {
        android: [
          'Disable battery optimization',
          'Allow background activity',
          'Foreground service notification',
        ],
        ios: [
          'Background App Refresh',
          'Limited background execution (30s-10min)',
          'Recording pauses when backgrounded',
        ],
      },
    };
  }
}

export const PermissionService = new PermissionServiceClass();
