import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RecordingIndicatorProps {
  isRecording: boolean;
  recordingTime: number;
  isBackgroundReady: boolean;
}

export const RecordingIndicator: React.FC<RecordingIndicatorProps> = ({
  isRecording,
  recordingTime,
  isBackgroundReady,
}) => {
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        {/* Recording Status */}
        <View style={styles.statusItem}>
          <View
            style={[
              styles.recordingDot,
              { backgroundColor: isRecording ? '#FF3B30' : '#8E8E93' },
            ]}
          />
          <Text style={[styles.statusText, { color: isRecording ? '#FF3B30' : '#8E8E93' }]}>
            {isRecording ? 'RECORDING' : 'STOPPED'}
          </Text>
        </View>

        {/* Recording Time */}
        {isRecording && (
          <Text style={styles.timeText}>{formatTime(recordingTime)}</Text>
        )}
      </View>

      {/* Platform Status */}
      <View style={styles.platformRow}>
        <View style={styles.platformItem}>
          <Ionicons 
            name={Platform.OS === 'ios' ? 'phone-portrait' : 'logo-android'} 
            size={16} 
            color="#007AFF" 
          />
          <Text style={styles.platformText}>
            {Platform.OS === 'android' ? 'Android' : 'iOS'}
          </Text>
        </View>

        <View style={styles.platformItem}>
          <Ionicons 
            name={isBackgroundReady ? 'checkmark-circle' : 'alert-circle'} 
            size={16} 
            color={isBackgroundReady ? '#34C759' : '#FF9500'} 
          />
          <Text style={styles.platformText}>
            {isBackgroundReady ? 'Background Ready' : 'Background Setup'}
          </Text>
        </View>

        {Platform.OS === 'android' && isRecording && (
          <View style={styles.platformItem}>
            <Ionicons name="shield-checkmark" size={16} color="#34C759" />
            <Text style={styles.platformText}>Foreground Service</Text>
          </View>
        )}
      </View>

      {/* Platform-specific warning */}
      {Platform.OS === 'ios' && (
        <View style={styles.warningRow}>
          <Ionicons name="information-circle" size={14} color="#FF9500" />
          <Text style={styles.warningText}>
            iOS: Background recording limited to 30s-10min
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  timeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  platformRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 4,
  },
  platformItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  platformText: {
    fontSize: 12,
    color: '#FFFFFF',
    marginLeft: 4,
    fontWeight: '500',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  warningText: {
    fontSize: 10,
    color: '#FF9500',
    marginLeft: 4,
    textAlign: 'center',
  },
});