'use client';

import { useEffect, useState } from 'react';
import type { CustomerOrder, CustomerOrderItem } from '../lib/customerAuth';

const TIMELINE_STATES = [
  { status: 'PENDING', label: 'Recibido', icon: '📋' },
  { status: 'PREPARING', label: 'En preparación', icon: '👨‍🍳' },
  { status: 'READY', label: 'Listo', icon: '✅' },
  { status: 'ON_THE_WAY', label: 'En camino', icon: '🚗' },
  { status: 'DELIVERED', label: 'Entregado', icon: '🎉' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  order: CustomerOrder;
  primary: string;
};

function generatePIN(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getStatusIndex(status: string): number {
  return Math.max(0, TIMELINE_STATES.findIndex((s) => s.status === status));
}

type DeliveryIncident = {
  id: string;
  type: 'CUSTOMER_UNREACHABLE' | 'LOCATION_CHANGED' | 'VEHICLE_ISSUE' | 'TRAFFIC' | 'OTHER';
  description: string;
  reportedAt: string;
  resolved: boolean;
};

function parseIncidents(order: CustomerOrder): DeliveryIncident[] {
  if (!order.orderType || order.orderType !== 'DELIVERY' || !['ON_THE_WAY', 'DELIVERED'].includes(order.status)) {
    return [];
  }
  const noteText = order.notes || '';
  if (noteText.includes('CUSTOMER_UNREACHABLE')) {
    return [
      {
        id: 'inc-1',
        type: 'CUSTOMER_UNREACHABLE',
        description: 'No fue posible contactar al cliente',
        reportedAt: new Date().toISOString(),
        resolved: order.status === 'DELIVERED',
      },
    ];
  }
  return [];
}

export default function OrderTrackingModal({ open, onClose, order, primary }: Props) {
  const [pin, setPin] = useState('');
  const [incidents, setIncidents] = useState<DeliveryIncident[]>([]);

  useEffect(() => {
    if (open && !pin) {
      setPin(generatePIN());
      const parsed = parseIncidents(order);
      setIncidents(parsed);
    }
  }, [open, pin, order]);

  const statusIndex = getStatusIndex(order.status);
  const isDelivery = order.orderType === 'DELIVERY';
  const currentState = TIMELINE_STATES[statusIndex];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] max-h-[90vh] flex flex-col overflow-hidden bg-white text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f0' }}>
          <h2 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            Pedido #{order.orderNumber}
          </h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#f3f4f6' }}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* PIN Card - only for delivery orders in certain states */}
          {isDelivery && ['READY', 'ON_THE_WAY', 'DELIVERED'].includes(order.status) && (
            <div className="p-6 rounded-2xl text-center" style={{ background: `${primary}15`, border: `2px solid ${primary}` }}>
              <p className="text-xs uppercase tracking-widest font-semibold text-gray-500 mb-3">PIN de entrega</p>
              <div className="text-5xl font-black tracking-widest mb-2" style={{ fontFamily: 'DM Mono, monospace', color: primary, letterSpacing: '0.25em' }}>
                {pin}
              </div>
              <p className="text-[11px] text-gray-400">Muéstrale este código al repartidor</p>
            </div>
          )}

          {/* Incident Alert */}
          {incidents.length > 0 &&
            incidents.map((inc) => (
              <div key={inc.id} className="p-4 rounded-xl border-l-4 bg-red-50" style={{ borderColor: '#ef4444' }}>
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-red-900">{inc.type === 'CUSTOMER_UNREACHABLE' && 'No fue posible contactar'}</p>
                    <p className="text-xs text-red-700 mt-1">{inc.description}</p>
                    {!inc.resolved && (
                      <p className="text-[10px] text-red-600 font-semibold mt-2 uppercase tracking-wide">Reportado · Pendiente de resolución</p>
                    )}
                  </div>
                </div>
              </div>
            ))}

          {/* Timeline */}
          <div className="space-y-4 py-2">
            <p className="text-xs uppercase font-semibold text-gray-500 tracking-wide">Estado del pedido</p>
            <div className="space-y-3">
              {TIMELINE_STATES.map((state, idx) => {
                const isActive = idx <= statusIndex;
                const isCurrent = idx === statusIndex;
                return (
                  <div key={state.status} className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{
                        background: isActive ? primary : '#e5e7eb',
                        color: isActive ? '#ffffff' : '#9ca3af',
                      }}
                    >
                      {state.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: isActive ? '#0f172a' : '#9ca3af' }}>
                        {state.label}
                      </p>
                      {isCurrent && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    {isCurrent && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: primary }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery Info (for delivery orders) */}
          {isDelivery && ['ON_THE_WAY', 'DELIVERED'].includes(order.status) && (
            <div className="p-4 rounded-2xl space-y-3" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <p className="text-xs uppercase font-semibold text-gray-500 tracking-wide">Información de entrega</p>
              <div className="space-y-2 text-sm">
                {order.deliveryAddress && (
                  <div className="flex gap-2">
                    <span className="text-lg shrink-0">📍</span>
                    <div className="min-w-0">
                      <p className="text-[12px] text-gray-500">Dirección</p>
                      <p className="text-sm font-medium text-gray-900 break-words">{order.deliveryAddress}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-lg shrink-0">⏱️</span>
                  <div>
                    <p className="text-[12px] text-gray-500">Tiempo estimado</p>
                    <p className="text-sm font-medium text-gray-900">15-20 minutos</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="p-4 rounded-2xl space-y-2" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <p className="text-xs uppercase font-semibold text-gray-500 tracking-wide mb-3">Resumen del pedido</p>
            {(order.items || []).map((item: CustomerOrderItem, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {item.quantity}× {item.name}
                </span>
                <span className="font-medium text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-gray-200 flex items-center justify-between font-bold">
              <span>Total</span>
              <span style={{ color: primary }}>${order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="p-4 shrink-0 flex gap-2" style={{ borderTop: '1px solid #f0f0f0' }}>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl font-bold text-sm uppercase tracking-widest active:scale-95 transition-all"
            style={{ background: '#f3f4f6', color: '#0f172a' }}
          >
            Cerrar
          </button>
          {isDelivery && ['ON_THE_WAY', 'DELIVERED'].includes(order.status) && (
            <button
              className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white uppercase tracking-widest active:scale-95 transition-all"
              style={{ background: primary }}
            >
              📞 Contactar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
