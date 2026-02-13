import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: colorScheme === 'dark' ? '#8E8E93' : '#8E8E93',
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#000000' : '#FFFFFF',
          borderTopColor: colorScheme === 'dark' ? '#38383A' : '#C6C6C8',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Recording',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="videocam" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Upload Queue',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="cloud-upload" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}