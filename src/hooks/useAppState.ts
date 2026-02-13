import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export const useAppState = (): AppStateStatus => {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log('App state changed:', appState, '->', nextAppState);
      setAppState(nextAppState);
    });

    return () => subscription?.remove();
  }, [appState]);

  return appState;
};