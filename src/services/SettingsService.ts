import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  // Recording settings
  videoQuality: '480p' | '720p' | '1080p';
  recordAudio: boolean;
  chunkDurationMinutes: number;
  autoRestart: boolean;

  // Upload settings
  wifiOnlyUpload: boolean;
  deleteAfterUpload: boolean;
  maxRetryAttempts: number;

  // Background settings
  backgroundNotifications: boolean;
  
  // Storage settings
  maxLocalStorageGB: number;
  autoDeleteOldFiles: boolean;
}

class SettingsServiceClass {
  private settings: AppSettings | null = null;
  private readonly SETTINGS_KEY = 'app_settings';

  // Default settings
  private readonly DEFAULT_SETTINGS: AppSettings = {
    videoQuality: '720p',
    recordAudio: true,
    chunkDurationMinutes: 5,
    autoRestart: true,
    wifiOnlyUpload: false,
    deleteAfterUpload: true,
    maxRetryAttempts: 3,
    backgroundNotifications: true,
    maxLocalStorageGB: 2,
    autoDeleteOldFiles: true,
  };

  async initialize(): Promise<void> {
    try {
      await this.loadSettings();
      console.log('Settings service initialized');
    } catch (error) {
      console.error('Failed to initialize settings service:', error);
      throw error;
    }
  }

  async getSettings(): Promise<AppSettings> {
    if (!this.settings) {
      await this.loadSettings();
    }
    return this.settings!;
  }

  async updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<AppSettings> {
    if (!this.settings) {
      await this.loadSettings();
    }

    this.settings![key] = value;
    await this.saveSettings();
    
    console.log(`Setting updated: ${key} = ${value}`);
    return this.settings!;
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    if (!this.settings) {
      await this.loadSettings();
    }

    this.settings = {
      ...this.settings!,
      ...updates,
    };

    await this.saveSettings();
    
    console.log('Multiple settings updated:', Object.keys(updates));
    return this.settings;
  }

  async resetToDefaults(): Promise<AppSettings> {
    this.settings = { ...this.DEFAULT_SETTINGS };
    await this.saveSettings();
    
    console.log('Settings reset to defaults');
    return this.settings;
  }

  private async loadSettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.SETTINGS_KEY);
      
      if (stored) {
        const parsedSettings = JSON.parse(stored);
        
        // Merge with defaults to handle new settings added in updates
        this.settings = {
          ...this.DEFAULT_SETTINGS,
          ...parsedSettings,
        };
      } else {
        this.settings = { ...this.DEFAULT_SETTINGS };
        await this.saveSettings(); // Save defaults for first time
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { ...this.DEFAULT_SETTINGS };
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      if (this.settings) {
        await AsyncStorage.setItem(this.SETTINGS_KEY, JSON.stringify(this.settings));
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  // Validate setting values
  validateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): boolean {
    switch (key) {
      case 'videoQuality':
        return ['480p', '720p', '1080p'].includes(value as string);
      
      case 'chunkDurationMinutes':
        return typeof value === 'number' && value >= 1 && value <= 30;
      
      case 'maxRetryAttempts':
        return typeof value === 'number' && value >= 0 && value <= 10;
      
      case 'maxLocalStorageGB':
        return typeof value === 'number' && value >= 0.5 && value <= 10;
      
      case 'recordAudio':
      case 'autoRestart':
      case 'wifiOnlyUpload':
      case 'deleteAfterUpload':
      case 'backgroundNotifications':
      case 'autoDeleteOldFiles':
        return typeof value === 'boolean';
      
      default:
        return true;
    }
  }

  // Get recording configuration for camera service
  getRecordingConfig() {
    if (!this.settings) {
      throw new Error('Settings not loaded');
    }

    return {
      quality: this.settings.videoQuality,
      recordAudio: this.settings.recordAudio,
      chunkDuration: this.settings.chunkDurationMinutes * 60 * 1000, // Convert to milliseconds
      autoRestart: this.settings.autoRestart,
    };
  }

  // Get upload configuration for upload service
  getUploadConfig() {
    if (!this.settings) {
      throw new Error('Settings not loaded');
    }

    return {
      wifiOnly: this.settings.wifiOnlyUpload,
      deleteAfterUpload: this.settings.deleteAfterUpload,
      maxRetries: this.settings.maxRetryAttempts,
    };
  }

  // Get storage configuration
  getStorageConfig() {
    if (!this.settings) {
      throw new Error('Settings not loaded');
    }

    return {
      maxStorageBytes: this.settings.maxLocalStorageGB * 1024 * 1024 * 1024,
      autoDeleteOld: this.settings.autoDeleteOldFiles,
    };
  }

  // Export settings for backup
  async exportSettings(): Promise<string> {
    const settings = await this.getSettings();
    return JSON.stringify(settings, null, 2);
  }

  // Import settings from backup
  async importSettings(settingsJson: string): Promise<void> {
    try {
      const importedSettings = JSON.parse(settingsJson);
      
      // Validate imported settings
      const validSettings: Partial<AppSettings> = {};
      
      Object.entries(importedSettings).forEach(([key, value]) => {
        if (key in this.DEFAULT_SETTINGS) {
          const settingKey = key as keyof AppSettings;
          if (this.validateSetting(settingKey, value as any)) {
            (validSettings as any)[settingKey] = value;
          }
        }
      });

      await this.updateSettings(validSettings);
      console.log('Settings imported successfully');
    } catch (error) {
      console.error('Failed to import settings:', error);
      throw new Error('Invalid settings format');
    }
  }
}

export const SettingsService = new SettingsServiceClass();