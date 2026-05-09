// Root component — restores auth session then renders the navigator or splash screen.

import React, { useEffect } from 'react';
import { StatusBar }    from 'expo-status-bar';
import AppNavigator     from './src/navigation/AppNavigator';
import Splash           from './src/screens/Splash';
import { useAuthStore } from './src/store/authStore';

export default function App() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const isLoading       = useAuthStore((s) => s.isLoading);

  // Restore any previous session from AsyncStorage before the navigator first renders.
  // AppNavigator normally handles this with an ActivityIndicator, but Splash gives
  // us a branded screen that matches the native splash configuration.
  useEffect(() => {
    loadFromStorage();
  }, []);

  // While the auth store is hydrating, show the branded splash screen.
  // Once isLoading flips to false, AppNavigator takes over.
  if (isLoading) {
    return (
      <>
        <StatusBar style="light" />
        <Splash />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}
