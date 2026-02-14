import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { CameraService } from '@/src/services/CameraService';
import { CameraXNativeService } from '@/src/services/CameraXNativeService';
import { BackgroundService } from '@/src/services/BackgroundService';
import { PermissionService } from '@/src/services/PermissionService';
import { UploadService } from '@/src/services/UploadService';
import { SettingsService } from '@/src/services/SettingsService';
import { useAppState } from '@/src/hooks/useAppState';
import { CameraControls } from '@/src/components/CameraControls';
import { RecordingIndicator } from '@/src/components/RecordingIndicator';
import { RECORDINGS_DIR } from '@/src/constants/paths';

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
  const desiredRecordingRef = useRef(false);
  const restartScheduledRef = useRef(false);
  const recordingStartMsRef = useRef(0);
  const appState = useAppState();
  const useNativeAndroidRecorder = Platform.OS === 'android' && CameraXNativeService.isAvailable();

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
    if (Platform.OS !== 'android' || !isRecording || useNativeAndroidRecorder) return;

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

  useEffect(() => {
    if (Platform.OS !== 'android' || useNativeAndroidRecorder) {
      return;
    }

    if (appState === 'active') {
      void attemptResumeRecordingIfNeeded();
    }
  }, [appState, isCameraReady, permission?.granted]);

  const handleChunkComplete = (chunkPath: string) => {
    setLastChunkPath(chunkPath);
    console.log('Chunk completed and persisted locally:', chunkPath);
  };

  const handleRecordingError = (error: Error) => {
    console.error('Recording error callback:', error);
    if (appState === 'active') {
      Alert.alert('Recording Error', error.message);
    }
    setIsRecording(false);
    if (useNativeAndroidRecorder) {
      CameraXNativeService.stopRecording().catch(console.error);
    } else {
      CameraService.stopRecording().catch(console.error);
    }
    BackgroundService.stopForegroundService().catch(console.error);
  };

  const attemptResumeRecordingIfNeeded = async () => {
    if (!desiredRecordingRef.current || isRecording || restartScheduledRef.current) {
      return;
    }

    if (!permission?.granted) {
      return;
    }

    if (!useNativeAndroidRecorder && (!isCameraReady || !cameraRef.current)) {
      return;
    }

    restartScheduledRef.current = true;
    try {
      await startRecordingInternal();
      console.log('Recording resumed after interruption');
    } catch (error) {
      console.error('Failed to resume interrupted recording:', error);
    } finally {
      restartScheduledRef.current = false;
    }
  };

  const startRecordingInternal = async () => {
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

    if (!useNativeAndroidRecorder && (!cameraRef.current || !isCameraReady)) {
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
      recordingStartMsRef.current = Date.now();

      if (useNativeAndroidRecorder) {
        const settings = await SettingsService.getSettings();
        await CameraXNativeService.startRecording({
          quality: settings.videoQuality,
          recordAudio: settings.recordAudio,
        });
      } else {
        await CameraService.startRecording({
          camera: cameraRef.current!,
          facing,
          onChunkComplete: handleChunkComplete,
          onError: handleRecordingError,
        });
      }
    } catch (e) {
      setIsRecording(false);
      if (Platform.OS === 'android') {
        await BackgroundService.stopForegroundService();
      }
      throw e;
    } finally {
      startingRef.current = false;
    }
  };

  // ---------- RECORDING ----------
  const startRecording = async () => {
    desiredRecordingRef.current = true;
    try {
      await startRecordingInternal();
    } catch (e) {
      Alert.alert('Recording Error', 'Failed to start recording');
      desiredRecordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    desiredRecordingRef.current = false;

    if (stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;

    try {
      setIsRecording(false);

      if (useNativeAndroidRecorder) {
        let nativePath: string | null = null;
        try {
          nativePath = await CameraXNativeService.stopRecording();
        } catch (nativeStopError) {
          console.warn('Native stop failed, checking latest native status:', nativeStopError);
          const status = await CameraXNativeService.getStatus();
          nativePath = status.latestOutputPath || null;
        }

        if (!nativePath) {
          throw new Error('Native recorder stopped but no output path was returned');
        }

        await handleNativeRecordingComplete(nativePath);
      } else {
        await CameraService.stopRecording();
      }

      if (Platform.OS === 'android') {
        await BackgroundService.stopForegroundService();
      }
    } catch (e) {
      console.error('Stop recording failed', e);
    } finally {
      stoppingRef.current = false;
    }
  };

  const handleNativeRecordingComplete = async (nativePath: string) => {
    const sourcePath = nativePath.startsWith('file://')
      ? nativePath
      : `file://${nativePath.replace(/\\/g, '/')}`;

    const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
    if (!sourceInfo.exists || typeof (sourceInfo as any).size !== 'number') {
      throw new Error('Native recording output file not found');
    }

    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
    const fileName = sourcePath.split('/').pop() || `rec_native_${Date.now()}.mp4`;
    const destinationPath = `${RECORDINGS_DIR}${fileName}`;

    if (sourcePath !== destinationPath) {
      await FileSystem.copyAsync({
        from: sourcePath,
        to: destinationPath,
      });
    }

    const destinationInfo = await FileSystem.getInfoAsync(destinationPath);
    if (!destinationInfo.exists || typeof (destinationInfo as any).size !== 'number') {
      throw new Error('Failed to persist native recording to app storage');
    }

    setLastChunkPath(destinationPath);

    try {
      let mediaPermission = await MediaLibrary.getPermissionsAsync();
      if (!mediaPermission.granted) {
        mediaPermission = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      }
      if (mediaPermission.granted) {
        const asset = await MediaLibrary.createAssetAsync(destinationPath);
        try {
          await MediaLibrary.createAlbumAsync('Bg Camera', asset, false);
        } catch {
          // Album exists; ignore.
        }
      }
    } catch (e) {
      console.warn('Gallery save failed for native recording:', e);
    }

    const duration = Date.now() - recordingStartMsRef.current;
    await UploadService.addToQueue({
      path: destinationPath,
      duration: Math.max(duration, 0),
      size: (destinationInfo as any).size || 0,
      timestamp: Date.now(),
      chunkIndex: 0,
    });
  };

  const toggleCameraFacing = () => {
    if (useNativeAndroidRecorder) return;
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

      {!useNativeAndroidRecorder ? (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          onCameraReady={() => setIsCameraReady(true)}
        />
      ) : (
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.cameraPlaceholderText}>
            {isRecording ? 'CameraX background recorder active' : 'CameraX recorder ready'}
          </Text>
        </View>
      )}

      <CameraControls
        isRecording={isRecording}
        isCameraReady={useNativeAndroidRecorder ? true : isCameraReady}
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

      {Platform.OS === 'android' && !useNativeAndroidRecorder && (
        <View style={styles.androidNativeWarning}>
          <Ionicons name="alert-circle" size={16} color="#FF3B30" />
          <Text style={styles.androidNativeWarningText}>
            Native CameraX module not loaded. Rebuild and reinstall the Android app.
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
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  cameraPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 14,
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
  androidNativeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(255,59,48,0.12)',
  },
  androidNativeWarningText: {
    color: '#FF3B30',
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
