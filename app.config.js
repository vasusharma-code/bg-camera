export default {
  expo: {
    name: 'SurveillanceApp',
    slug: 'surveillance-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/favicon.png',
    scheme: 'surveillanceapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.surveillance.app',
      backgroundModes: [
        'background-processing',
        'background-fetch'
      ],
      infoPlist: {
        NSCameraUsageDescription: 'This app requires camera access for surveillance recording',
        NSMicrophoneUsageDescription: 'This app requires microphone access for audio recording',
        UIBackgroundModes: ['background-processing', 'background-fetch']
      }
    },
    android: {
      package: 'com.surveillance.app',
      permissions: [
        'CAMERA',
        'RECORD_AUDIO',
        'WRITE_EXTERNAL_STORAGE',
        'READ_EXTERNAL_STORAGE',
        'READ_MEDIA_AUDIO',
        'READ_MEDIA_VIDEO',
        'READ_MEDIA_IMAGES',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_CAMERA',
        'FOREGROUND_SERVICE_MICROPHONE',
        'WAKE_LOCK',
        'RECEIVE_BOOT_COMPLETED',
        'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'
      ],
      adaptiveIcon: {
        foregroundImage: './assets/images/favicon.png',
        backgroundColor: '#ffffff'
      }
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/images/favicon.png'
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-camera',
      'expo-notifications',
      [
        'expo-task-manager',
        {
          backgroundModes: ['background-processing']
        }
      ],
      'expo-background-fetch'
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000',
      environment: process.env.EXPO_PUBLIC_ENVIRONMENT || 'development',
      eas: {
        projectId: 'your-eas-project-id'
      }
    }
  }
};
