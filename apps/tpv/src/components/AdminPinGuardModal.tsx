'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import useOfflineStore from '@/store/useOfflineStore';
import NumpadPIN from './NumpadPIN';
import { hashPin } from '@/lib/hash';
import { ShieldCheck } from 'lucide-react';

interface AdminPinGuardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

/**
 * Guard de PIN para acceder al Panel Central (/admin) desde sesiones que NO
 * son ADMIN ni OWNER. Cajeros, meseros y managers deben demostrar que tienen
 * un PIN administrativo válido del mismo restaurante antes de entrar.
 *
 * Reutiliza el mismo motor offline-friendly que ManagerOverrideModal:
 *   - hash SHA256 del PIN tecleado
 *   - lookup en useAuthStore.employees (cache offline)
 *   - log del override en useOfflineStore para auditoría
 */
export default function AdminPinGuardModal({
  isOpen,
  onClose,
  onSuccess,
}: AdminPinGuardModalProps) {
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const employees = useAuthStore((s) => s.employees);
  const addToQueue = useOfflineStore((s) => s.addToQueue);

  if (!isOpen) return null;

  const handlePinSubmit = async (pin: string) => {
    if (pin.length !== 4) return;

    setValidating(true);
    setError('');

    try {
      const hash = await hashPin(pin);
      const admin = employees.find(
        (emp) =>
          emp.pin === hash &&
          emp.isActive !== false &&
          (emp.role === 'ADMIN' || emp.role === 'OWNER')
      );

      if (!admin) {
        setError('PIN inválido o sin permiso de administrador');
        setValidating(false);
        return;
      }

      addToQueue({
        id: `admin-access-${Date.now()}`,
        type: 'override',
        data: { permission: 'access_admin_panel' as const },
        timestamp: Date.now(),
        synced: false,
        supervisor: admin.id,
      });

      setValidating(false);
      onClose();
      await onSuccess();
    } catch (err) {
      console.error('Admin PIN guard error:', err);
      setError('Error al validar');
      setValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass rounded-3xl p-8 w-full max-w-sm border border-border shadow-lg glow-orange">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,184,77,0.12)', color: 'var(--brand)' }}
          >
            <ShieldCheck size={20} strokeWidth={2.5} />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            Acceso al Panel Central
          </h2>
        </div>
        <p className="text-muted text-sm mb-6">
          Ingresa el PIN de un administrador para continuar
        </p>

        <NumpadPIN
          onSubmit={handlePinSubmit}
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
