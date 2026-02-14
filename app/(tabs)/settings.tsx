import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  AlertButton,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { SettingsService, AppSettings } from '@/src/services/SettingsService';
import { AuthService } from '@/src/services/AuthService';
import { StorageService } from '@/src/services/StorageService';
import { formatBytes } from '@/src/utils/formatters';

interface SettingsRowProps {
  icon: string;
  title: string;
  value?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  showArrow?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  title,
  value,
  children,
  onPress,
  showArrow = false,
}) => (
  <TouchableOpacity
    style={styles.settingsRow}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <View style={styles.settingsRowLeft}>
      <Ionicons name={icon as any} size={24} color="#007AFF" />
      <Text style={styles.settingsRowTitle}>{title}</Text>
    </View>
    <View style={styles.settingsRowRight}>
      {children}
      {value && <Text style={styles.settingsRowValue}>{value}</Text>}
      {showArrow && (
        <Ionicons name="chevron-forward" size={20} color="#C6C6C8" />
      )}
    </View>
  </TouchableOpacity>
);

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [storageInfo, setStorageInfo] = useState({
    localFiles: 0,
    localSize: 0,
    isCalculating: true,
  });
  const [deviceInfo, setDeviceInfo] = useState({
    id: '',
    isRegistered: false,
  });

  useEffect(() => {
    loadSettings();
    loadStorageInfo();
    loadDeviceInfo();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await SettingsService.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadStorageInfo = async () => {
    try {
      setStorageInfo(prev => ({ ...prev, isCalculating: true }));
      const info = await StorageService.getLocalStorageInfo();
      setStorageInfo({
        localFiles: info.fileCount,
        localSize: info.totalSize,
        isCalculating: false,
      });
    } catch (error) {
      console.error('Failed to load storage info:', error);
      setStorageInfo(prev => ({ ...prev, isCalculating: false }));
    }
  };

  const loadDeviceInfo = async () => {
    try {
      const info = await AuthService.getDeviceInfo();
      setDeviceInfo(info);
    } catch (error) {
      console.error('Failed to load device info:', error);
    }
  };

  const updateSetting = async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    if (!settings) return;

    try {
      const updatedSettings = await SettingsService.updateSetting(key, value);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to update setting:', error);
      Alert.alert('Error', 'Failed to update setting');
    }
  };

  const handleVideoQuality = () => {
    if (!settings) return;

    const qualities = [
      { label: 'Low (480p)', value: '480p' },
      { label: 'Medium (720p)', value: '720p' },
      { label: 'High (1080p)', value: '1080p' },
    ];
    const buttons: AlertButton[] = qualities.map((quality) => ({
      text: quality.label,
      onPress: () => {
        void updateSetting('videoQuality', quality.value as any);
      },
      style: settings.videoQuality === quality.value ? 'default' : undefined,
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(
      'Video Quality',
      'Choose recording quality',
      buttons
    );
  };

  const handleChunkDuration = () => {
    if (!settings) return;

    const durations = [
      { label: '2 minutes', value: 2 },
      { label: '5 minutes', value: 5 },
      { label: '10 minutes', value: 10 },
      { label: '15 minutes', value: 15 },
    ];
    const buttons: AlertButton[] = durations.map((duration) => ({
      text: duration.label,
      onPress: () => {
        void updateSetting('chunkDurationMinutes', duration.value);
      },
      style: settings.chunkDurationMinutes === duration.value ? 'default' : undefined,
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(
      'Chunk Duration',
      'Length of each video segment',
      buttons
    );
  };

  const handleClearLocalFiles = () => {
    Alert.alert(
      'Clear Local Files',
      `This will delete ${storageInfo.localFiles} local video files (${formatBytes(storageInfo.localSize)}). Are you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.clearLocalFiles();
              await loadStorageInfo();
              Alert.alert('Success', 'Local files cleared');
            } catch (error) {
              console.error('Failed to clear local files:', error);
              Alert.alert('Error', 'Failed to clear local files');
            }
          },
        },
      ]
    );
  };

  const handleRegisterDevice = async () => {
    try {
      await AuthService.registerDevice();
      await loadDeviceInfo();
      Alert.alert('Success', 'Device registered successfully');
    } catch (error) {
      console.error('Failed to register device:', error);
      Alert.alert('Error', 'Failed to register device');
    }
  };

  const handleUnregisterDevice = () => {
    Alert.alert(
      'Unregister Device',
      'This will remove this device from the surveillance system. You will need to re-authenticate.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unregister',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthService.unregisterDevice();
              await loadDeviceInfo();
              Alert.alert('Success', 'Device unregistered');
            } catch (error) {
              console.error('Failed to unregister device:', error);
              Alert.alert('Error', 'Failed to unregister device');
            }
          },
        },
      ]
    );
  };

  if (!settings) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        {/* Recording Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Recording</Text>
          
          <SettingsRow
            icon="videocam"
            title="Video Quality"
            value={settings.videoQuality}
            onPress={handleVideoQuality}
            showArrow
          />
          
          <SettingsRow
            icon="time"
            title="Chunk Duration"
            value={`${settings.chunkDurationMinutes} minutes`}
            onPress={handleChunkDuration}
            showArrow
          />
          
          <SettingsRow
            icon="mic"
            title="Record Audio"
          >
            <Switch
              value={settings.recordAudio}
              onValueChange={(value) => updateSetting('recordAudio', value)}
            />
          </SettingsRow>
          
          <SettingsRow
            icon="camera-reverse"
            title="Auto-restart Recording"
          >
            <Switch
              value={settings.autoRestart}
              onValueChange={(value) => updateSetting('autoRestart', value)}
            />
          </SettingsRow>
        </View>

        {/* Background Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Background</Text>
          
          <SettingsRow
            icon="notifications"
            title="Background Notifications"
          >
            <Switch
              value={settings.backgroundNotifications}
              onValueChange={(value) => updateSetting('backgroundNotifications', value)}
            />
          </SettingsRow>
          
          {Platform.OS === 'android' && (
            <SettingsRow
              icon="battery-charging"
              title="Request Battery Optimization Exemption"
              onPress={() => {
                Alert.alert(
                  'Battery Optimization',
                  'To ensure continuous recording, please disable battery optimization for this app in your device settings.',
                  [{ text: 'OK' }]
                );
              }}
              showArrow
            />
          )}
        </View>

        {/* Upload Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Upload</Text>
          
          <SettingsRow
            icon="wifi"
            title="Upload on WiFi Only"
          >
            <Switch
              value={settings.wifiOnlyUpload}
              onValueChange={(value) => updateSetting('wifiOnlyUpload', value)}
            />
          </SettingsRow>
          
          <SettingsRow
            icon="trash"
            title="Delete After Upload"
          >
            <Switch
              value={settings.deleteAfterUpload}
              onValueChange={(value) => updateSetting('deleteAfterUpload', value)}
            />
          </SettingsRow>
          
          <SettingsRow
            icon="sync"
            title="Max Retry Attempts"
            value={settings.maxRetryAttempts.toString()}
            onPress={() => {
              Alert.alert(
                'Max Retry Attempts',
                'Number of times to retry failed uploads',
                [
                  { text: '1', onPress: () => updateSetting('maxRetryAttempts', 1) },
                  { text: '3', onPress: () => updateSetting('maxRetryAttempts', 3) },
                  { text: '5', onPress: () => updateSetting('maxRetryAttempts', 5) },
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
            showArrow
          />
        </View>

        {/* Storage */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Storage</Text>
          
          <SettingsRow
            icon="folder"
            title="Local Files"
            value={storageInfo.isCalculating ? 'Calculating...' : `${storageInfo.localFiles} files`}
          />
          
          <SettingsRow
            icon="archive"
            title="Local Storage Used"
            value={storageInfo.isCalculating ? 'Calculating...' : formatBytes(storageInfo.localSize)}
          />
          
          <SettingsRow
            icon="trash-bin"
            title="Clear Local Files"
            onPress={handleClearLocalFiles}
            showArrow
          />
        </View>

        {/* Device */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Device</Text>
          
          <SettingsRow
            icon="phone-portrait"
            title="Device ID"
            value={deviceInfo.id.slice(-8)}
          />
          
          <SettingsRow
            icon="checkmark-circle"
            title="Registration Status"
            value={deviceInfo.isRegistered ? 'Registered' : 'Not Registered'}
          />
          
          {!deviceInfo.isRegistered ? (
            <SettingsRow
              icon="log-in"
              title="Register Device"
              onPress={handleRegisterDevice}
              showArrow
            />
          ) : (
            <SettingsRow
              icon="log-out"
              title="Unregister Device"
              onPress={handleUnregisterDevice}
              showArrow
            />
          )}
        </View>

        {/* Platform Information */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Platform Information</Text>
          
          <View style={styles.platformInfo}>
            <Text style={styles.platformInfoText}>
              {Platform.OS === 'android' 
                ? '✅ Android: Full background recording support with foreground service'
                : '⚠️ iOS: Limited background recording (30 seconds to 10 minutes)'}
            </Text>
            
            {Platform.OS === 'ios' && (
              <Text style={styles.platformWarning}>
                iOS automatically suspends apps to preserve battery. Recording will resume when the app returns to foreground.
              </Text>
            )}
          </View>
        </View>

        {/* Legal Disclaimer */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Legal Notice</Text>
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              This surveillance application is for legitimate security purposes only. 
              Users must comply with all applicable laws and obtain proper consent. 
              Unauthorized surveillance may be illegal.
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollView: {
    flex: 1,
  },
  loadingText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 50,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#C6C6C8',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
    textTransform: 'uppercase',
    marginLeft: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  settingsRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsRowTitle: {
    fontSize: 16,
    color: '#000000',
    marginLeft: 12,
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsRowValue: {
    fontSize: 16,
    color: '#8E8E93',
    marginRight: 8,
  },
  platformInfo: {
    padding: 20,
  },
  platformInfoText: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
  },
  platformWarning: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 8,
    fontStyle: 'italic',
  },
  disclaimer: {
    padding: 20,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#FF3B30',
    lineHeight: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
