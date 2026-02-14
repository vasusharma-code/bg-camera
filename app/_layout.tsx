import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { BackgroundService } from '@/src/services/BackgroundService';
import { AuthService } from '@/src/services/AuthService';
import { SettingsService } from '@/src/services/SettingsService';
import { StorageService } from '@/src/services/StorageService';
import { UploadService } from '@/src/services/UploadService';

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    // Ensure background service is initialized early
    Promise.all([
      SettingsService.initialize(),
      StorageService.initialize(),
      AuthService.initialize(),
    ])
      .then(() => UploadService.initialize())
      .then(() => BackgroundService.initialize())
      .catch(console.error);
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="index" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
