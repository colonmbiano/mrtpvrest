import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

/**
 * Placeholder PIN lock screen.
 *
 * Once a device is paired (token + restaurantId + locationId all present
 * in SecureStore), the app lands here. The real numpad + PIN verification
 * logic will live here in the next iteration.
 */
export default function PinScreen() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.heading}>Pantalla de PIN</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
});
