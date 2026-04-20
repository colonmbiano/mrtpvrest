import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { employeePinLogin } from '../lib/api';
import { clearAll, getItem, saveEmployeeSession, StorageKeys } from '../lib/storage';
import type { RootStackParamList } from '../navigation/types';

const PIN_LENGTH = 4;
const ACCENT = '#F5C842';
const ERROR = '#EF4444';

type Props = NativeStackScreenProps<RootStackParamList, 'Pin'>;

type KeyValue =
  | { kind: 'digit'; value: string }
  | { kind: 'clear' }
  | { kind: 'backspace' };

const KEYPAD: KeyValue[] = [
  { kind: 'digit', value: '1' },
  { kind: 'digit', value: '2' },
  { kind: 'digit', value: '3' },
  { kind: 'digit', value: '4' },
  { kind: 'digit', value: '5' },
  { kind: 'digit', value: '6' },
  { kind: 'digit', value: '7' },
  { kind: 'digit', value: '8' },
  { kind: 'digit', value: '9' },
  { kind: 'clear' },
  { kind: 'digit', value: '0' },
  { kind: 'backspace' },
];

export default function PinScreen({ navigation }: Props) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationSlug, setLocationSlug] = useState<string | null>(null);

  const shake = useRef(new Animated.Value(0)).current;

  // Show the paired restaurant slug as a small tag in the header.
  useEffect(() => {
    getItem(StorageKeys.restaurantSlug).then(setLocationSlug);
  }, []);

  // When PIN reaches the required length, auto-submit.
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !loading) {
      void verifyPin(pin);
    }
    // We intentionally depend only on `pin` — `loading` changes are driven
    // by verifyPin itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function pressKey(k: KeyValue) {
    if (loading) return;
    setError(null);
    if (k.kind === 'digit') {
      setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + k.value));
    } else if (k.kind === 'backspace') {
      setPin((prev) => prev.slice(0, -1));
    } else if (k.kind === 'clear') {
      setPin('');
    }
  }

  async function verifyPin(currentPin: string) {
    setLoading(true);
    try {
      const res = await employeePinLogin(currentPin);
      await saveEmployeeSession({ token: res.token, employee: res.employee });
      console.log('[PinScreen] Login OK for employee', res.employee.name);
      navigation.replace('Dashboard');
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        status === 401
          ? 'PIN incorrecto'
          : e?.response?.data?.error ?? e?.message ?? 'Error de red';
      console.warn('[PinScreen] PIN login failed:', msg);
      setError(msg);
      triggerShake();
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function triggerShake() {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function handleUnpair() {
    Alert.alert(
      'Desvincular dispositivo',
      'Se eliminarán las credenciales guardadas y tendrás que volver a autenticar esta caja. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            await clearAll();
            navigation.replace('Setup');
          },
        },
      ],
    );
  }

  const dots = useMemo(() => {
    return Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);
  }, [pin]);

  const shakeTranslate = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-12, 12],
  });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        {locationSlug ? (
          <View style={styles.slugTag}>
            <Text style={styles.slugText}>{locationSlug}</Text>
          </View>
        ) : (
          <View />
        )}
        <TouchableOpacity onPress={handleUnpair} hitSlop={12}>
          <Text style={styles.unpairText}>Desvincular</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Ingresa tu PIN</Text>
        <Text style={styles.subtitle}>
          Empleados autorizados: toca tu PIN de {PIN_LENGTH} dígitos para iniciar turno.
        </Text>
      </View>

      {/* PIN dots */}
      <Animated.View
        style={[styles.dotsRow, { transform: [{ translateX: shakeTranslate }] }]}
      >
        {dots.map((filled, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              filled && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>

      {/* Error / loading */}
      <View style={styles.feedback}>
        {loading ? (
          <ActivityIndicator color={ACCENT} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <Text style={styles.feedbackSpacer}> </Text>
        )}
      </View>

      {/* Numpad */}
      <View style={styles.keypad}>
        {KEYPAD.map((k, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.key,
              k.kind !== 'digit' && styles.keyMuted,
              loading && styles.keyDisabled,
            ]}
            activeOpacity={0.7}
            onPress={() => pressKey(k)}
            disabled={loading}
          >
            <Text style={styles.keyText}>
              {k.kind === 'digit' ? k.value : k.kind === 'backspace' ? '⌫' : 'C'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  slugTag: {
    backgroundColor: '#141414',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  slugText: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  unpairText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
  titleBlock: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 40,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 21,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
    marginBottom: 20,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
    borderWidth: 1.5,
    borderColor: '#2A2A2A',
  },
  dotFilled: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  dotError: {
    borderColor: ERROR,
  },
  feedback: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  feedbackSpacer: { opacity: 0 },
  errorText: {
    color: ERROR,
    fontSize: 14,
    fontWeight: '600',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    gap: 14,
    marginTop: 'auto',
  },
  key: {
    width: '30%',
    aspectRatio: 1.4,
    maxHeight: 96,
    backgroundColor: '#141414',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyMuted: {
    backgroundColor: '#0F0F0F',
  },
  keyDisabled: {
    opacity: 0.5,
  },
  keyText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '600',
  },
});
