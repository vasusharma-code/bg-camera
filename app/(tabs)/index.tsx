import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { CameraService } from '@/src/services/CameraService';
import { BackgroundService } from '@/src/services/BackgroundService';
import { PermissionService } from '@/src/services/PermissionService';
import { useAppState } from '@/src/hooks/useAppState';
import { RecordingIndicator } from '@/src/components/RecordingIndicator';
import { CameraControls } from '@/src/components/CameraControls';

export default function RecordingScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isBackgroundReady, setIsBackgroundReady] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false); // Track camera readiness

  const cameraRef = useRef<CameraView>(null);
  const recordingTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const appState = useAppState();

  useEffect(() => {
    initializeServices();
    return cleanup;
  }, []);

  useEffect(() => {
    handleAppStateChange(appState);
  }, [appState]);

  const initializeServices = async () => {
    try {
      // Initialize background service
      await BackgroundService.initialize();
      setIsBackgroundReady(true);

      // Request all necessary permissions
      await PermissionService.requestAllPermissions();

      // Register background tasks
      await BackgroundService.registerBackgroundTasks();
    } catch (error) {
      console.error('Failed to initialize services:', error);
      Alert.alert('Initialization Error', 'Failed to setup background services');
    }
  };

  const handleAppStateChange = async (newState: AppStateStatus) => {
    // Only handle transitions if we are recording
    if (isRecording) {
      if (newState === 'background' || newState === 'inactive') {
        // App going to background - Ensure background service is active
        await handleBackgroundTransition();
      } else if (newState === 'active') {
        // App coming to foreground
        await handleForegroundTransition();
      }
    }
  };

  const handleBackgroundTransition = async () => {
    if (Platform.OS === 'android') {
      // Android: Ensure foreground service is running to keep process alive
      // It should have been started when recording began, but we double-check here
      console.log('App in background, ensuring foreground service is active...');
      await BackgroundService.startForegroundService({
        title: 'Surveillance Active',
        message: 'Recording in background',
        isRecording: true,
      });
    } else {
      // iOS: Limited background time
      await BackgroundService.startBackgroundTask();
      console.log('iOS: Recording will stop when background time expires');
    }
  };

  const handleForegroundTransition = async () => {
    // Resume camera preview and sync with background recording
    if (Platform.OS === 'ios') {
      // On iOS, if we had to stop, we restart.
      console.log('App in foreground (iOS) - Resuming recording...');
      // Small delay to ensure camera is ready (though onCameraReady should handle button, 
      // auto-resume might need a check)
       if (cameraRef.current) {
          await startRecording();
       }
    }
  };

  const startRecording = async () => {
    if (!permission?.granted) {
      Alert.alert('Permission Required', 'Camera permission is required');
      return;
    }

    // Double check availability
    if (!isCameraReady || !cameraRef.current) {
       console.warn('Camera not ready, cannot start recording.');
       return;
    }

    try {
      // 1. Start Foreground Service FIRST (Android)
      if (Platform.OS === 'android') {
        await BackgroundService.startForegroundService({
          title: 'Surveillance Active',
          message: 'Recording in progress',
          isRecording: true,
        });
      }

      setIsRecording(true);
      
      // 2. Start Camera Recording
      await CameraService.startRecording({
        camera: cameraRef.current!,
        facing,
        onChunkComplete: handleChunkComplete,
        onError: handleRecordingError,
      });

      // 3. Start Timer
      startRecordingTimer();

      console.log('Recording started successfully');
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
      // Stop foreground service if we failed to start
      if (Platform.OS === 'android') {
          await BackgroundService.stopForegroundService();
      }
      Alert.alert('Recording Error', 'Failed to start recording');
    }
  };
  
// ... (rest of file)

  const handleBackgroundTransition = async () => {
    if (Platform.OS === 'android') {
      // Android: Ensure foreground service is running
      console.log('App in background, ensuring foreground service is active...');
      await BackgroundService.startForegroundService({
        title: 'Surveillance Active',
        message: 'Recording in background',
        isRecording: true,
      });
    } else {
      // iOS: Must stop recording to save data before suspension
      console.log('iOS: App backgrounded, stopping recording to save chunk...');
      await stopRecording();
      // Logic to auto-resume on foreground is in handleForegroundTransition
    }
  };

// ... (rest of file)

      <CameraControls
        isRecording={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onToggleFacing={toggleCameraFacing}
        facing={facing}
        isCameraReady={isCameraReady}
      />

      {Platform.OS === 'ios' && isRecording && (
        <View style={styles.iosWarning}>
          <Ionicons name="warning" size={16} color="#FF9500" />
          <Text style={styles.iosWarningText}>
            iOS: Recording will pause when app is backgrounded
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    color: '#FFFFFF',
    fontSize: 16,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 20,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    marginTop: 10,
  },
  camera: {
    flex: 1,
  },
  iosWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 8,
  },
  iosWarningText: {
    color: '#FF9500',
    fontSize: 12,
    marginLeft: 6,
  },
});