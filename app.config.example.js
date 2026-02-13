export default {
  expo: {
    name: 'SurveillanceApp',
    slug: 'surveillance-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
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
        'FOREGROUND_SERVICE',
        'WAKE_LOCK',
        'RECEIVE_BOOT_COMPLETED',
        'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'
      ],
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
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
      apiUrl: 'http://YOUR_BACKEND_IP:3000', // Replace with your backend URL
      environment: 'development',
      eas: {
        projectId: 'your-eas-project-id' // Replace with your EAS project ID
      }
    }
  }
};