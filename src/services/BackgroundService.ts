import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Lazy import type for Notifications to use in function signatures/variables if needed, 
// but we will cast require() results to any to avoid complex type gymnastics with lazy loading.
// import * as Notifications from 'expo-notifications'; 

const BACKGROUND_RECORDING_TASK = 'background-recording';
const BACKGROUND_UPLOAD_TASK = 'background-upload';

// Define background tasks in global scope
TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
  try {
    console.log('Background upload task executed');
    // Process upload queue in background
    const { UploadService } = await import('./UploadService');
    await UploadService.processQueue();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background upload task failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export interface ForegroundServiceConfig {
  title: string;
  message: string;
  isRecording: boolean;
}

class BackgroundServiceClass {
  private backgroundTasksRegistered = false;
  private foregroundServiceActive = false;
  private notificationId = 'surveillance-recording';

  private isExpoGo(): boolean {
    return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  }

  async initialize(): Promise<void> {
    try {
      // Configure notifications only if NOT in Expo Go (or if safe)
      if (!this.isExpoGo()) {
        await this.setupNotifications();
      } else {
        console.log('Skipping notification setup in Expo Go');
      }

      // Register background tasks
      await this.registerBackgroundTasks();

      console.log('Background service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize background service:', error);
      // Don't throw in Expo Go, just log error so app can continue
      if (!this.isExpoGo()) {
        throw error;
      }
    }
  }

  private async setupNotifications(): Promise<void> {
    if (this.isExpoGo()) return;

    try {
      // Dynamically import expo-notifications
      const Notifications = require('expo-notifications');

      if (Platform.OS === 'android') {
        // Create notification channel for foreground service
        await Notifications.setNotificationChannelAsync('surveillance', {
          name: 'Surveillance Recording',
          importance: Notifications.AndroidImportance.HIGH,
          sound: false,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }

      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permission not granted');
      }
    } catch (error) {
      console.warn('Error setting up notifications:', error);
    }
  }

  async registerBackgroundTasks(): Promise<void> {
    try {
      if (this.backgroundTasksRegistered) {
        return;
      }

      const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_UPLOAD_TASK);
      if (!alreadyRegistered) {
      // Register background fetch task
        await BackgroundFetch.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }

      this.backgroundTasksRegistered = true;

      console.log('Background tasks registered');
    } catch (error) {
      console.error('Failed to register background tasks:', error);
      throw error;
    }
  }

  async startForegroundService(config: ForegroundServiceConfig): Promise<void> {
    if (Platform.OS !== 'android') {
      console.log('Foreground service only available on Android');
      return;
    }

    if (this.isExpoGo()) {
      console.log('Foreground service not supported in Expo Go');
      this.foregroundServiceActive = true; // Pretend it's active so UI updates
      return;
    }

    try {
      const Notifications = require('expo-notifications');

      if (this.foregroundServiceActive) {
        // Update existing notification
        await this.updateForegroundNotification(config);
        return;
      }

      // Create foreground service notification
      await Notifications.scheduleNotificationAsync({
        identifier: this.notificationId,
        content: {
          title: config.title,
          body: config.message,
          sound: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sticky: true,
          data: {
            persistent: true,
            isRecording: config.isRecording,
          },
        },
        trigger: null, // Show immediately
      });

      this.foregroundServiceActive = true;
      console.log('Foreground service started');
    } catch (error) {
      console.error('Failed to start foreground service:', error);
      // Don't throw in Expo Go if somehow we got here
      if (!this.isExpoGo()) throw error;
    }
  }

  async stopForegroundService(): Promise<void> {
    if (!this.foregroundServiceActive) {
      return;
    }

    this.foregroundServiceActive = false; // Always strict reset state

    if (this.isExpoGo()) {
      return;
    }

    try {
      const Notifications = require('expo-notifications');
      await Notifications.dismissNotificationAsync(this.notificationId);
      console.log('Foreground service stopped');
    } catch (error) {
      console.error('Failed to stop foreground service:', error);
      // throw error; // Suppress error on stop
    }
  }

  private async updateForegroundNotification(config: ForegroundServiceConfig): Promise<void> {
    if (this.isExpoGo()) {
      return;
    }

    try {
      const Notifications = require('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        identifier: this.notificationId,
        content: {
          title: config.title,
          body: config.message,
          sound: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sticky: true,
          data: {
            persistent: true,
            isRecording: config.isRecording,
          },
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to update foreground notification:', error);
    }
  }

  // Platform capability information
  static getPlatformCapabilities() {
    return {
      platform: Platform.OS,
      foregroundService: Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient,
      backgroundExecution: Constants.executionEnvironment !== ExecutionEnvironment.StoreClient,
      limitations: {
        android: 'Requires user to disable battery optimization. Foreground service notification must be shown.',
        ios: 'Background execution limited to 30 seconds to 10 minutes. Recording stops when time expires.',
      },
      batteryOptimization: Platform.OS === 'android' ? 'User must manually whitelist app' : 'System managed',
    };
  }

  // Check if background execution is available
  async isBackgroundExecutionAvailable(): Promise<boolean> {
    try {
      const status = await BackgroundFetch.getStatusAsync();
      return status === BackgroundFetch.BackgroundFetchStatus.Available;
    } catch {
      return false;
    }
  }

  // Get current background execution status
  async getBackgroundStatus(): Promise<string> {
    try {
      const status = await BackgroundFetch.getStatusAsync();
      switch (status) {
        case BackgroundFetch.BackgroundFetchStatus.Available:
          return 'Available';
        case BackgroundFetch.BackgroundFetchStatus.Denied:
          return 'Denied';
        case BackgroundFetch.BackgroundFetchStatus.Restricted:
          return 'Restricted';
        default:
          return 'Unknown';
      }
    } catch {
      return 'Error';
    }
  }

  cleanup(): void {
    if (this.foregroundServiceActive) {
      this.stopForegroundService();
    }
  }

  isForegroundServiceActive(): boolean {
    return this.foregroundServiceActive;
  }

  isBackgroundRecordingGuaranteed(): boolean {
    return Platform.OS === 'android' && !this.isExpoGo();
  }
}

export const BackgroundService = new BackgroundServiceClass();
