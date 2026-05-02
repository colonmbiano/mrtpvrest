'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NumpadPIN from '@/components/NumpadPIN';
import { useAuthStore } from '@/store/useAuthStore';
import { useOfflineStore } from '@/store/useOfflineStore';
import { initBackgroundSync } from '@/lib/offline';
import { hashPin } from '@/lib/hash';

export default function LockedPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const employees = useAuthStore((state) => state.employees);
  const setCurrentEmployee = useAuthStore((state) => state.setCurrentEmployee);

  // On mount: validate device is linked, check if already in session
  useEffect(() => {
    const checkDevice = () => {
      const deviceLinked = document.cookie.includes('tpv-device-linked=true');
      const sessionActive = document.cookie.includes('tpv-session-active=true');

      if (!deviceLinked) {
        router.replace('/setup');
        return;
      }

      if (sessionActive) {
        router.replace('/pos/order-type');
        return;
      }
    };

    checkDevice();
  }, [router]);

  // When PIN is entered (4 digits)
  const handlePINSubmit = async (pin: string) => {
    if (pin.length !== 4) return;

    setIsValidating(true);
    setError('');

    try {
      // Hash the entered PIN
      const enteredHash = await hashPin(pin);

      // Find employee with matching PIN hash
      const employee = employees.find((emp) => emp.pin === enteredHash && emp.isActive);

      if (!employee) {
        setError('PIN incorrecto o empleado inactivo');
        setIsValidating(false);
        return;
      }

      // Set current employee in auth store
      setCurrentEmployee(employee);

      // Set session cookie (session = expires when browser closes)
      document.cookie = 'tpv-session-active=true; path=/; SameSite=Lax';

      // Store employee data in localStorage for access on next page
      localStorage.setItem('currentEmployeeId', employee.id);
      localStorage.setItem('currentEmployeeName', employee.name);
      localStorage.setItem('currentEmployeeRole', employee.role);
      localStorage.setItem('currentEmployeePermissions', JSON.stringify(employee.permissions));

      // Initialize background sync
      initBackgroundSync();

      // Redirect to order type selector
      router.replace('/pos/order-type');
    } catch (err) {
      console.error('PIN validation error:', err);
      setError('Error al validar PIN');
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      {/* Glassmorphic container */}
      <div className="w-full max-w-sm glass rounded-3xl p-8 border border-border shadow-lg glow-orange">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 font-mono">
            Ingresa tu PIN
          </h1>
          <p className="text-muted text-sm">
            4 dígitos para acceder
          </p>
        </div>

        {/* NumpadPIN Component */}
        <div className="mb-6">
          <NumpadPIN
            onSubmit={handlePINSubmit}
            disabled={isValidating}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="text-center mb-4 p-3 bg-danger/10 border border-danger rounded-lg">
            <p className="text-danger text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isValidating && (
          <div className="text-center">
            <div className="inline-block animate-spin">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
            <p className="text-muted text-sm mt-2">Validando...</p>
          </div>
        )}

        {/* Offline indicator */}
        <div className="mt-6 text-center">
          <p className="text-muted text-xs">
            {typeof navigator !== 'undefined' && navigator.onLine ? '🟢 Conectado' : '🔴 Offline'}
          </p>
        </div>
      </div>
    </div>
  );
}
