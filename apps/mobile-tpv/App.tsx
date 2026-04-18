import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SetupScreen from './screens/SetupScreen';
import PinScreen from './screens/PinScreen';
import { getAuthSnapshot } from './lib/storage';
import type { RootStackParamList } from './navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Dark navigation theme so the background behind screens during transitions
 * also stays black — avoids the default white flash on Android.
 */
const DarkNavTheme: typeof DefaultTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: '#0A0A0A',
    card: '#0A0A0A',
    text: '#FFFFFF',
    border: '#1A1A1A',
    primary: '#F5C842',
  },
};

type InitialRoute = 'Setup' | 'Pin';

export default function App() {
  const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);

  useEffect(() => {
    // Bootstrap: decide whether this device is already paired.
    // A device is "fully paired" only when we have an accessToken AND a locationId.
    (async () => {
      try {
        const snap = await getAuthSnapshot();
        const paired = !!snap.accessToken && !!snap.locationId;
        setInitialRoute(paired ? 'Pin' : 'Setup');
      } catch (e) {
        console.warn('[App] bootstrap failed, falling back to Setup:', e);
        setInitialRoute('Setup');
      }
    })();
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#F5C842" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkNavTheme}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: '#0A0A0A' },
        }}
      >
        <Stack.Screen name="Setup" component={SetupScreen} />
        <Stack.Screen name="Pin" component={PinScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
