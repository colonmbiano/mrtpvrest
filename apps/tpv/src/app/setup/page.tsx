'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import LoginStep from './steps/LoginStep';
import LocationStep from './steps/LocationStep';
import DeviceStep from './steps/DeviceStep';
import { useAuthStore } from '@/store/authStore';

type SetupStep = 'login' | 'location' | 'device' | 'saving';

interface SetupState {
  email: string;
  password: string;
  selectedRestaurant: any;
  selectedLocation: any;
  deviceType: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('login');
  const [state, setState] = useState<SetupState>({
    email: '',
    password: '',
    selectedRestaurant: null,
    selectedLocation: null,
    deviceType: 'CAJA',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setRestaurants] = useState<any[]>([]);
  const [authToken, setAuthToken] = useState('');

  // Check if already linked
  useEffect(() => {
    const hasDevice = document.cookie.includes('tpv-device-linked=true');
    if (hasDevice) {
      router.replace('/locked');
    }
  }, [router]);

  // Check internet connection
  useEffect(() => {
    const checkConnection = () => {
      if (!navigator.onLine && step !== 'login') {
        setError('Conexión requerida para vincular dispositivo');
      }
    };

    window.addEventListener('offline', checkConnection);
    return () => window.removeEventListener('offline', checkConnection);
  }, [step]);

  const handleLogin = async (email: string, password: string) => {
    if (!navigator.onLine) {
      setError('Conexión requerida para vincular dispositivo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', { email, password });
      const token = response.data.accessToken;
      setAuthToken(token);

      // Fetch restaurants
      const restResponse = await axios.get('/api/admin/config', {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRestaurants([restResponse.data]);
      setState((s) => ({
        ...s,
        email,
        password,
        selectedRestaurant: restResponse.data,
      }));

      setStep('location');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = async (locationId: string) => {
    setLoading(true);
    try {
      const locResponse = await axios.get(`/api/admin/locations/${locationId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setState((s) => ({
        ...s,
        selectedLocation: locResponse.data,
      }));

      setStep('device');
    } catch (err: any) {
      setError('Error al cargar sucursal');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceSetup = async (deviceType: string) => {
    if (!navigator.onLine) {
      setError('Conexión requerida para vincular dispositivo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        '/api/devices/create',
        {
          locationId: state.selectedLocation.id,
          deviceType,
          restaurantId: state.selectedRestaurant.id,
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      const { deviceToken, deviceId } = response.data;

      // Save device info
      localStorage.setItem('deviceToken', deviceToken);
      localStorage.setItem('deviceId', deviceId);
      localStorage.setItem('locationId', state.selectedLocation.id);
      localStorage.setItem('restaurantId', state.selectedRestaurant.id);

      // Fetch and cache employees
      const empResponse = await axios.get('/api/employees/sync', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      
      // Use unified store to persist employees
      useAuthStore.getState().setEmployees(empResponse.data);

      // Set device cookie
      const expires = new Date();
      expires.setFullYear(expires.getFullYear() + 1);
      document.cookie = `tpv-device-linked=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

      setStep('saving');

      // Redirect after short delay
      setTimeout(() => {
        router.replace('/locked');
      }, 500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al vincular dispositivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: 'var(--background)' }}
    >
      {/* Glassmorphic Glows */}
      <div
        className="absolute pointer-events-none glow-orange"
        style={{ width: 800, height: 800, top: -200, left: -200 }}
      />
      <div
        className="absolute pointer-events-none glow-green"
        style={{ width: 900, height: 900, bottom: -150, right: -150 }}
      />

      <div className="w-full max-w-lg relative z-10">
        <div
          className="rounded-m p-12"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {step === 'login' && (
            <LoginStep onSubmit={handleLogin} loading={loading} error={error} />
          )}
          {step === 'location' && (
            <LocationStep
              locations={state.selectedRestaurant?.locations || []}
              onSelect={handleLocationSelect}
              loading={loading}
              error={error}
            />
          )}
          {step === 'device' && (
            <DeviceStep
              onSubmit={handleDeviceSetup}
              loading={loading}
              error={error}
            />
          )}
          {step === 'saving' && (
            <div className="text-center py-10">
              <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                Guardando configuración...
              </h1>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
