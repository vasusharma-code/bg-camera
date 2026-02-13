import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { BackgroundService } from '@/src/services/BackgroundService';

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    // Ensure background service is initialized early
    BackgroundService.initialize().catch(console.error);
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
