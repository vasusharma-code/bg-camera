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
import { RecordingIndicator } from '@/src/components/RecordingIndicator';

export default function RecordingScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [recordingTimeSeconds, setRecordingTimeSeconds] = useState(0);
  const [lastChunkPath, setLastChunkPath] = useState<string | null>(null);
  const [isBackgroundReady, setIsBackgroundReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const appState = useAppState();

  // ---------- INITIALIZATION ----------
  useEffect(() => {
    (async () => {
      try {
        await PermissionService.requestAllPermissions();
        await BackgroundService.initialize();
        setIsBackgroundReady(await BackgroundService.isBackgroundExecutionAvailable());
      } catch (e) {
        Alert.alert('Error', 'Failed to initialize services');
      }
    })();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stopRecording().catch(console.error);
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTimeSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTimeSeconds(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  // ---------- APP STATE ----------
  useEffect(() => {
    if (Platform.OS !== 'android' || !isRecording) return;

    if (appState === 'background') {
      BackgroundService.startForegroundService({
        title: 'Recording Active',
        message: 'Camera recording in background',
        isRecording: true,
      }).catch(console.error);
    } else if (appState === 'active') {
      BackgroundService.startForegroundService({
        title: 'Recording Active',
        message: 'Camera recording in progress',
        isRecording: true,
      }).catch(console.error);
    }
  }, [appState, isRecording]);

  const handleChunkComplete = (chunkPath: string) => {
    setLastChunkPath(chunkPath);
    console.log('Chunk completed and persisted locally:', chunkPath);
  };

  const handleRecordingError = (error: Error) => {
    console.error('Recording error callback:', error);
    Alert.alert('Recording Error', error.message);
    setIsRecording(false);
    CameraService.stopRecording().catch(console.error);
    BackgroundService.stopForegroundService().catch(console.error);
  };

  // ---------- RECORDING ----------
  const startRecording = async () => {
    if (startingRef.current || isRecording) {
      return;
    }
    startingRef.current = true;

    if (!permission?.granted) {
      const permissionResult = await requestPermission();
      if (!permissionResult.granted) {
        startingRef.current = false;
        return;
      }
    }

    if (!cameraRef.current || !isCameraReady) {
      console.warn('Camera not ready');
      startingRef.current = false;
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
      setRecordingTimeSeconds(0);

      await CameraService.startRecording({
        camera: cameraRef.current,
        facing,
        onChunkComplete: handleChunkComplete,
        onError: handleRecordingError,
      });
    } catch (e) {
      setIsRecording(false);
      Alert.alert('Recording Error', 'Failed to start recording');
      if (Platform.OS === 'android') {
        await BackgroundService.stopForegroundService();
      }
    } finally {
      startingRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;

    try {
      setIsRecording(false);
      await CameraService.stopRecording();

      if (Platform.OS === 'android') {
        await BackgroundService.stopForegroundService();
      }
    } catch (e) {
      console.error('Stop recording failed', e);
    } finally {
      stoppingRef.current = false;
    }
  };

  const toggleCameraFacing = () => {
    if (isRecording) return;
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.container}>
      <RecordingIndicator
        isRecording={isRecording}
        recordingTime={recordingTimeSeconds}
        isBackgroundReady={isBackgroundReady}
      />

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

      {Platform.OS === 'android' && !BackgroundService.isBackgroundRecordingGuaranteed() && (
        <View style={styles.androidWarning}>
          <Ionicons name="warning" size={16} color="#FF9500" />
          <Text style={styles.androidWarningText}>
            Expo Go runtime: background recording is not guaranteed
          </Text>
        </View>
      )}

      {!!lastChunkPath && (
        <View style={styles.chunkInfo}>
          <Text style={styles.chunkInfoText} numberOfLines={1}>
            Last saved: {lastChunkPath.split('/').pop()}
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
  androidWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(255,149,0,0.1)',
  },
  androidWarningText: {
    color: '#FF9500',
    fontSize: 12,
    marginLeft: 6,
  },
  chunkInfo: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chunkInfoText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
});
