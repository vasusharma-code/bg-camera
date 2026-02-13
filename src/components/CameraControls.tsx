import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraType } from 'expo-camera';

interface CameraControlsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onToggleFacing: () => void;
  facing: CameraType;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  isRecording,
  onStartRecording,
  onStopRecording,
  onToggleFacing,
  facing,
}) => {
  return (
    <View style={styles.container}>
      {/* Camera Flip Button */}
      <TouchableOpacity
        style={styles.controlButton}
        onPress={onToggleFacing}
        disabled={isRecording}
      >
        <Ionicons 
          name="camera-reverse" 
          size={28} 
          color={isRecording ? '#8E8E93' : '#FFFFFF'} 
        />
      </TouchableOpacity>

      {/* Record Button */}
      <TouchableOpacity
        style={[
          styles.recordButton,
          isRecording && styles.recordButtonActive,
        ]}
        onPress={isRecording ? onStopRecording : onStartRecording}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.recordButtonInner,
            isRecording && styles.recordButtonInnerActive,
          ]}
        />
      </TouchableOpacity>

      {/* Settings/Info Button */}
      <TouchableOpacity
        style={styles.controlButton}
        disabled={isRecording}
      >
        <Ionicons 
          name="information-circle" 
          size={28} 
          color={isRecording ? '#8E8E93' : '#FFFFFF'} 
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 40,
    backgroundColor: 'transparent',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  recordButtonActive: {
    borderColor: '#FF3B30',
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF3B30',
  },
  recordButtonInnerActive: {
    borderRadius: 8,
    width: 30,
    height: 30,
  },
});