import React from 'react';
import SetupScreen from './screens/SetupScreen';

/**
 * Entry point for apps/mobile-tpv.
 *
 * Currently shows the Device Pairing / Setup screen.
 * Navigation (React Navigation) will be wired up in the next iteration
 * once authentication is complete.
 */
export default function App() {
  return <SetupScreen />;
}
