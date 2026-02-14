import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { CameraService } from '@/src/services/CameraService';
import { BackgroundService } from '@/src/services/BackgroundService';
import { PermissionService } from '@/src/services/PermissionService';
import { useAppState } from '@/src/hooks/useAppState';
import { CameraControls } from '@/src/components/CameraControls';

export default function RecordingScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const appState = useAppState();

  // ---------- INITIALIZATION ----------
  useEffect(() => {
    (async () => {
      try {
        await PermissionService.requestAllPermissions();
        await BackgroundService.initialize();
        await BackgroundService.registerBackgroundTasks();
      } catch (e) {
        Alert.alert('Error', 'Failed to initialize services');
      }
    })();

    return () => {
      stopRecording();
    };
  }, []);

  // ---------- APP STATE ----------
  useEffect(() => {
    if (!isRecording) return;

    if (appState === 'background' && Platform.OS === 'android') {
      BackgroundService.startForegroundService({
        title: 'Recording Active',
        message: 'Camera recording in background',
        isRecording: true,
      });
    }
  }, [appState, isRecording]);

  // ---------- RECORDING ----------
  const startRecording = async () => {
    if (!permission?.granted) {
      await requestPermission();
      return;
    }

    if (!cameraRef.current || !isCameraReady) {
      console.warn('Camera not ready');
      return;
    }

    try {
      if (Platform.OS === 'android') {
        await BackgroundService.startForegroundService({
          title: 'Recording Active',
          message: 'Camera recording in progress',
          isRecording: true,
        });
      }

      setIsRecording(true);

      await CameraService.startRecording({
        camera: cameraRef.current,
        facing,
        onChunkComplete: CameraService.handleChunkComplete,
        onError: CameraService.handleError,
      });
    } catch (e) {
      setIsRecording(false);
      Alert.alert('Recording Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      await CameraService.stopRecording();

      if (Platform.OS === 'android') {
        await BackgroundService.stopForegroundService();
      }
    } catch (e) {
      console.error('Stop recording failed', e);
    }
  };

  const toggleCameraFacing = () => {
    if (isRecording) return;
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        onCameraReady={() => setIsCameraReady(true)}
      />

      <CameraControls
        isRecording={isRecording}
        isCameraReady={isCameraReady}
        facing={facing}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onToggleFacing={toggleCameraFacing}
      />

      {Platform.OS === 'ios' && isRecording && (
        <View style={styles.iosWarning}>
          <Ionicons name="warning" size={16} color="#FF9500" />
          <Text style={styles.iosWarningText}>
            iOS pauses recording in background
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------- STYLES ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  iosWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(255,149,0,0.1)',
  },
  iosWarningText: {
    color: '#FF9500',
    fontSize: 12,
    marginLeft: 6,
  },
});
