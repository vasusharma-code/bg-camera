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

  const cameraRef = useRef<CameraView>(null);
  const recordingTimer = useRef<NodeJS.Timeout>();
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
    if (isRecording) {
      if (newState === 'background' || newState === 'inactive') {
        // App going to background - start background recording
        await handleBackgroundTransition();
      } else if (newState === 'active') {
        // App coming to foreground - resume foreground recording
        await handleForegroundTransition();
      }
    }
  };

  const handleBackgroundTransition = async () => {
    if (Platform.OS === 'android') {
      // Android: Continue recording with foreground service
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
      // On iOS, we need to restart recording when returning to foreground
      await startRecording();
    }
  };

  const startRecording = async () => {
    if (!permission?.granted) {
      Alert.alert('Permission Required', 'Camera permission is required');
      return;
    }

    try {
      setIsRecording(true);
      
      // Start foreground service immediately on Android
      if (Platform.OS === 'android') {
        await BackgroundService.startForegroundService({
          title: 'Surveillance Active',
          message: 'Recording in progress',
          isRecording: true,
        });
      }

      // Start camera recording
      await CameraService.startRecording({
        camera: cameraRef.current!,
        facing,
        onChunkComplete: handleChunkComplete,
        onError: handleRecordingError,
      });

      // Start recording timer
      startRecordingTimer();

      console.log('Recording started successfully');
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
      Alert.alert('Recording Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      
      // Stop camera recording
      await CameraService.stopRecording();
      
      // Stop background services
      await BackgroundService.stopForegroundService();
      await BackgroundService.stopBackgroundTask();

      // Stop timer
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = undefined;
      }
      
      setRecordingTime(0);
      console.log('Recording stopped successfully');
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to stop recording properly');
    }
  };

  const startRecordingTimer = () => {
    recordingTimer.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const handleChunkComplete = async (chunkPath: string) => {
    console.log('Chunk completed:', chunkPath);
    // Chunk will be automatically queued for upload by CameraService
  };

  const handleRecordingError = (error: Error) => {
    console.error('Recording error:', error);
    setIsRecording(false);
    Alert.alert('Recording Error', error.message);
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const cleanup = () => {
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
    }
    BackgroundService.cleanup();
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>Requesting camera permission...</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>Camera permission is required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <RecordingIndicator 
        isRecording={isRecording} 
        recordingTime={recordingTime}
        isBackgroundReady={isBackgroundReady}
      />

      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode="video"
        />
      </View>

      <CameraControls
        isRecording={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onToggleFacing={toggleCameraFacing}
        facing={facing}
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