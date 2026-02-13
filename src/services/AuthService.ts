import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { APIService } from './APIService';

export interface DeviceInfo {
  id: string;
  isRegistered: boolean;
  token?: string;
  registeredAt?: number;
}

export interface AuthConfig {
  deviceName?: string;
  metadata?: Record<string, any>;
}

class AuthServiceClass {
  private deviceInfo: DeviceInfo | null = null;
  private readonly DEVICE_INFO_KEY = 'device_info';
  private readonly JWT_TOKEN_KEY = 'jwt_token';

  async initialize(): Promise<void> {
    try {
      await this.loadDeviceInfo();
      
      // Generate device ID if not exists
      if (!this.deviceInfo?.id) {
        await this.generateDeviceId();
      }

      console.log('Auth service initialized, Device ID:', this.deviceInfo?.id);
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
      throw error;
    }
  }

  async registerDevice(config?: AuthConfig): Promise<void> {
    try {
      if (!this.deviceInfo?.id) {
        throw new Error('Device ID not available');
      }

      const deviceData = {
        deviceId: this.deviceInfo.id,
        platform: Platform.OS,
        deviceName: config?.deviceName || await this.generateDeviceName(),
        metadata: {
          ...config?.metadata,
          appVersion: '1.0.0', // Get from app config
          platformVersion: Platform.Version,
          registrationTime: Date.now(),
        },
      };

      const response = await APIService.registerDevice(deviceData);
      
      this.deviceInfo = {
        id: this.deviceInfo.id,
        isRegistered: true,
        token: response.token,
        registeredAt: Date.now(),
      };

      await this.saveDeviceInfo();
      await this.saveJWTToken(response.token);

      console.log('Device registered successfully');
    } catch (error) {
      console.error('Failed to register device:', error);
      throw error;
    }
  }

  async unregisterDevice(): Promise<void> {
    try {
      if (!this.deviceInfo?.isRegistered || !this.deviceInfo.token) {
        return;
      }

      await APIService.unregisterDevice(this.deviceInfo.id);

      this.deviceInfo = {
        id: this.deviceInfo.id,
        isRegistered: false,
      };

      await this.saveDeviceInfo();
      await AsyncStorage.removeItem(this.JWT_TOKEN_KEY);

      console.log('Device unregistered successfully');
    } catch (error) {
      console.error('Failed to unregister device:', error);
      throw error;
    }
  }

  async refreshToken(): Promise<string> {
    try {
      if (!this.deviceInfo?.token || !this.deviceInfo.isRegistered) {
        throw new Error('Device not registered');
      }

      const response = await APIService.refreshToken(this.deviceInfo.token);
      
      this.deviceInfo.token = response.token;
      await this.saveDeviceInfo();
      await this.saveJWTToken(response.token);

      return response.token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw error;
    }
  }

  async getAuthToken(): Promise<string> {
    if (!this.deviceInfo?.isRegistered || !this.deviceInfo.token) {
      throw new Error('Device not registered');
    }

    // Check if token needs refresh (implement JWT parsing if needed)
    // For now, return current token
    return this.deviceInfo.token;
  }

  async getDeviceId(): Promise<string> {
    if (!this.deviceInfo?.id) {
      await this.generateDeviceId();
    }
    return this.deviceInfo!.id;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    if (!this.deviceInfo) {
      await this.loadDeviceInfo();
    }
    return this.deviceInfo || { id: '', isRegistered: false };
  }

  private async generateDeviceId(): Promise<void> {
    try {
      // Create a unique device ID based on random bytes
      const randomBytes = await Crypto.getRandomBytesAsync(16);
      const deviceId = Array.from(randomBytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

      this.deviceInfo = {
        id: `${Platform.OS}_${deviceId}`,
        isRegistered: false,
      };

      await this.saveDeviceInfo();
    } catch (error) {
      console.error('Failed to generate device ID:', error);
      throw error;
    }
  }

  private async generateDeviceName(): Promise<string> {
    const platform = Platform.OS === 'ios' ? 'iPhone' : 'Android';
    const timestamp = new Date().toISOString().substring(0, 10);
    return `${platform} Surveillance Device ${timestamp}`;
  }

  private async loadDeviceInfo(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.DEVICE_INFO_KEY);
      if (stored) {
        this.deviceInfo = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load device info:', error);
      this.deviceInfo = null;
    }
  }

  private async saveDeviceInfo(): Promise<void> {
    try {
      if (this.deviceInfo) {
        await AsyncStorage.setItem(this.DEVICE_INFO_KEY, JSON.stringify(this.deviceInfo));
      }
    } catch (error) {
      console.error('Failed to save device info:', error);
      throw error;
    }
  }

  private async saveJWTToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(this.JWT_TOKEN_KEY, token);
    } catch (error) {
      console.error('Failed to save JWT token:', error);
      throw error;
    }
  }

  // Check if device is authenticated and token is valid
  async isAuthenticated(): Promise<boolean> {
    try {
      if (!this.deviceInfo?.isRegistered || !this.deviceInfo.token) {
        return false;
      }

      // Validate token with server
      const isValid = await APIService.validateToken(this.deviceInfo.token);
      return isValid;
    } catch (error) {
      console.error('Failed to check authentication status:', error);
      return false;
    }
  }

  // Clear all authentication data
  async clearAuth(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([this.DEVICE_INFO_KEY, this.JWT_TOKEN_KEY]);
      this.deviceInfo = null;
      console.log('Authentication data cleared');
    } catch (error) {
      console.error('Failed to clear auth data:', error);
      throw error;
    }
  }
}

export const AuthService = new AuthServiceClass();