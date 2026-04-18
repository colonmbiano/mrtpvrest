import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchMyLocations, login, LocationDto } from '../lib/api';
import { saveLocationId, saveLoginPayload } from '../lib/storage';
import type { RootStackParamList } from '../navigation/types';

type Stage = 'login' | 'selectLocation';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

export default function SetupScreen({ navigation }: Props) {
  const [stage, setStage] = useState<Stage>('login');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Location state
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  async function handleAuthenticate() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Campos requeridos', 'Por favor ingresa tu email y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const data = await login(email.trim(), password);
      console.log('[SetupScreen] Login OK for', data.user?.email);

      await saveLoginPayload({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        restaurantId: data.user.restaurantId,
        restaurantSlug: data.user.restaurantSlug,
      });

      // Switch UI to location selector and immediately load locations.
      setStage('selectLocation');
      await loadLocations();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ?? error?.message ?? 'Error desconocido';
      console.error('[SetupScreen] Login error:', message);
      Alert.alert('Error de autenticación', message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLocations() {
    setLoadingLocations(true);
    try {
      const list = await fetchMyLocations();
      setLocations(list);
      if (list.length === 0) {
        Alert.alert(
          'Sin sucursales',
          'Tu cuenta no tiene sucursales asignadas todavía.',
        );
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ?? error?.message ?? 'Error desconocido';
      console.error('[SetupScreen] my-locations error:', message);
      Alert.alert('Error cargando sucursales', message);
    } finally {
      setLoadingLocations(false);
    }
  }

  async function handleSelectLocation(loc: LocationDto) {
    if (selectingId) return;
    setSelectingId(loc.id);
    try {
      await saveLocationId(loc.id);
      console.log('[SetupScreen] locationId saved:', loc.id);
      // Replace so the user can't go back into the pairing flow
      navigation.replace('Pin');
    } catch (error: any) {
      console.error('[SetupScreen] saveLocationId error:', error);
      Alert.alert(
        'Error',
        'No se pudo guardar la sucursal seleccionada. Intenta de nuevo.',
      );
      setSelectingId(null);
    }
  }

  // ---------- Render helpers ----------

  if (stage === 'selectLocation') {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.locationsHeader}>
          <Text style={styles.title}>Selecciona tu sucursal</Text>
          <Text style={styles.subtitle}>
            Este dispositivo quedará vinculado a la sucursal elegida.
          </Text>
        </View>

        {loadingLocations ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Cargando sucursales…</Text>
          </View>
        ) : (
          <FlatList
            data={locations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.locationsList}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            renderItem={({ item }) => {
              const isSelecting = selectingId === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.locationButton,
                    isSelecting && styles.locationButtonActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => handleSelectLocation(item)}
                  disabled={!!selectingId}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationName}>{item.name}</Text>
                    {(item.address || item.city) && (
                      <Text style={styles.locationMeta} numberOfLines={1}>
                        {[item.address, item.city].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                  {isSelecting ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.locationArrow}>›</Text>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No hay sucursales disponibles.</Text>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={loadLocations}
                >
                  <Text style={styles.secondaryButtonText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    );
  }

  // ---------- Login stage ----------
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />

      <View style={styles.card}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>🍽</Text>
        </View>

        <Text style={styles.title}>Vincular Caja Registradora</Text>
        <Text style={styles.subtitle}>
          Ingresa tus credenciales de administrador para vincular este dispositivo.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleAuthenticate}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAuthenticate}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Autenticar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const ACCENT = '#F5C842';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  // Login card
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
    backgroundColor: '#141414',
    borderRadius: 20,
    padding: 36,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoBox: { alignSelf: 'center', marginBottom: 20 },
  logoText: { fontSize: 48 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.5,
  },

  // Location picker
  locationsHeader: {
    paddingTop: 80,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  locationsList: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 22,
    paddingHorizontal: 24,
    minHeight: 88,
  },
  locationButtonActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  locationName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  locationMeta: {
    fontSize: 14,
    color: '#888',
  },
  locationArrow: {
    fontSize: 32,
    color: '#555',
    marginLeft: 12,
    fontWeight: '300',
  },
  loadingText: {
    marginTop: 16,
    color: '#888',
    fontSize: 14,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
