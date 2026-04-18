import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { clearEmployeeSession, getItem, StorageKeys } from '../lib/storage';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

/**
 * Placeholder "caja abierta" screen. Shown after an employee has
 * successfully PIN-logged in. The real POS UI (mesas, tickets, cobrar)
 * will replace this in the next cycle.
 */
export default function DashboardScreen({ navigation }: Props) {
  const [employeeName, setEmployeeName] = useState<string>('Empleado');

  useEffect(() => {
    getItem(StorageKeys.employee).then((raw) => {
      if (!raw) return;
      try {
        const emp = JSON.parse(raw) as { name?: string };
        if (emp?.name) setEmployeeName(emp.name);
      } catch {
        /* ignore malformed cache */
      }
    });
  }, []);

  async function handleEndShift() {
    Alert.alert('Cerrar turno', `¿Cerrar turno de ${employeeName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar turno',
        style: 'destructive',
        onPress: async () => {
          await clearEmployeeSession();
          navigation.replace('Pin');
        },
      },
    ]);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.greeting}>Bienvenido</Text>
      <Text style={styles.name}>{employeeName}</Text>
      <Text style={styles.placeholder}>Pantalla principal del TPV (próximamente)</Text>

      <TouchableOpacity
        style={styles.endShift}
        onPress={handleEndShift}
        activeOpacity={0.85}
      >
        <Text style={styles.endShiftText}>Cerrar turno</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  greeting: {
    color: '#888',
    fontSize: 18,
    marginBottom: 6,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 32,
    letterSpacing: -0.5,
  },
  placeholder: {
    color: '#666',
    fontSize: 14,
    marginBottom: 48,
  },
  endShift: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  endShiftText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
