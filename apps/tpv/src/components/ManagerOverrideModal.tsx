'use client';

import { useState } from 'react';
import { Permission, useAuthStore } from '@/store/authStore';
import useOfflineStore from '@/store/useOfflineStore';
import NumpadPIN from './NumpadPIN';
import { hashPin } from '@/lib/hash';
import api from '@/lib/api';
import { setPendingOverride } from '@/lib/overrideTokens';

interface ManagerOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: Permission;
  onSuccess: () => void | Promise<void>;
}

export default function ManagerOverrideModal({
  isOpen,
  onClose,
  permission,
  onSuccess,
}: ManagerOverrideModalProps) {
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const employees = useAuthStore((state) => state.employees);
  const addToQueue = useOfflineStore((state) => state.addToQueue);

  if (!isOpen) return null;

  const handlePINSubmit = async (pin: string) => {
    if (pin.length < 4) return;

    setValidating(true);
    setError('');

    try {
      // 1) Validación REAL contra backend → emite override token que el
      //    interceptor de `api` adjunta a la acción reintentada. Esto
      //    reemplaza la validación client-side (cache offline spoofeable).
      try {
        const { data } = await api.post('/api/employees/verify-permission', {
          pin,
          permission,
        });
        if (data?.token) {
          setPendingOverride(
            permission,
            data.token,
            (data.expiresIn ?? 900) * 1000,
          );
          addToQueue({
            id: `override-${Date.now()}`,
            type: 'override',
            data: { permission },
            timestamp: Date.now(),
            synced: false,
            supervisor: data.supervisor?.id,
          });
          setValidating(false);
          onClose();
          await onSuccess();
          return;
        }
      } catch (apiErr: any) {
        // El backend respondió (401/403) → PIN o permiso inválido. No es
        // problema de red, así que no caemos al fallback offline.
        if (apiErr?.response) {
          setError(apiErr.response?.data?.error || 'PIN incorrecto o sin permiso');
          setValidating(false);
          return;
        }
        // Sin response → red caída → intentamos validación offline.
      }

      // 2) Fallback OFFLINE: validar contra el cache local. Sin token de
      //    backend; las acciones online-only no se ejecutarán offline de
      //    todos modos, pero descuentos/flujos locales sí pueden continuar.
      const hash = await hashPin(pin);
      const supervisor = employees.find(
        (emp) =>
          emp.pin === hash &&
          (emp.role === 'ADMIN' || emp.role === 'MANAGER' || emp.role === 'OWNER') &&
          Array.isArray(emp.permissions) &&
          emp.permissions.includes(permission)
      );

      if (!supervisor) {
        setError('PIN incorrecto o sin permiso');
        setValidating(false);
        return;
      }

      addToQueue({
        id: `override-${Date.now()}`,
        type: 'override',
        data: { permission },
        timestamp: Date.now(),
        synced: false,
        supervisor: supervisor.id,
      });

      setValidating(false);
      onClose();
      await onSuccess();
    } catch (err) {
      console.error('Override validation error:', err);
      setError('Error al validar');
      setValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="glass rounded-3xl p-8 w-full max-w-sm border border-border shadow-lg glow-orange">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Autorización de Supervisor
        </h2>
        <p className="text-muted text-sm mb-6">
          Ingresa el PIN de un supervisor
        </p>

        <NumpadPIN
          onSubmit={handlePINSubmit}
          disabled={validating}
          maxDigits={4}
        />

        {error && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger rounded-lg">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 py-2 bg-card hover:bg-card/80 border border-border rounded-lg text-foreground font-medium transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
