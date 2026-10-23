'use client';

import React, { useState, useEffect } from 'react';
import { C } from '@/lib/tokens';
import {
  MarketplaceOffer,
  getMarketplaceOffers,
  acceptMarketplaceOffer,
} from '@/lib/marketplaceDispatch';

interface MarketplaceOffersProps {
  courierId: string;
  isSharedCourier: boolean;
  onOfferAccepted: (result: { taskId: string; orderId: string }) => void;
  onToggleShared?: (enabled: boolean) => void;
}

export function MarketplaceOffers({
  courierId,
  isSharedCourier,
  onOfferAccepted,
  onToggleShared,
}: MarketplaceOffersProps) {
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const fetchOffers = async () => {
    if (!courierId) return;
    try {
      setLoading(true);
      const data = await getMarketplaceOffers(courierId);
      // Filtrar ofertas que no hayan expirado
      const now = Date.now();
      const valid = data.filter((o) => o.expiresAt > now);
      setOffers(valid);
    } catch {
      // Best-effort en modo offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers();
    const interval = setInterval(fetchOffers, 8000); // Polling cada 8 segundos
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierId]);

  const handleAccept = async (offer: MarketplaceOffer) => {
    if (acceptingId) return;
    setAcceptingId(offer.offerId);
    setConflictMsg(null);

    const result = await acceptMarketplaceOffer(courierId, offer.offerId);
    setAcceptingId(null);

    if (result.success && result.data) {
      onOfferAccepted({
        taskId: result.data.taskId,
        orderId: result.data.orderId,
      });
    } else if (result.isConflict) {
      setConflictMsg(`¡La orden #${offer.orderNumber} fue tomada por otro repartidor!`);
      // Remover oferta del listado de inmediato
      setOffers((prev) => prev.filter((o) => o.offerId !== offer.offerId));
      setTimeout(() => setConflictMsg(null), 4000);
    } else {
      setConflictMsg(result.error || 'No se pudo aceptar la orden.');
      setTimeout(() => setConflictMsg(null), 4000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Banner de Red de Repartidores Compartida */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 20,
          padding: '14px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🌐 Red Marketplace</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 10,
                background: isSharedCourier ? 'rgba(136, 214, 108, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                color: isSharedCourier ? C.green : 'rgba(255, 255, 255, 0.5)',
                letterSpacing: '0.05em',
              }}
            >
              {isSharedCourier ? 'ACTIVO' : 'PAUSADO'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2 }}>
            Recibe pedidos de cualquier tienda cercana
          </div>
        </div>

        {onToggleShared && (
          <button
            onClick={() => onToggleShared(!isSharedCourier)}
            style={{
              background: isSharedCourier ? 'rgba(136, 214, 108, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              border: `1px solid ${isSharedCourier ? C.green : 'rgba(255, 255, 255, 0.12)'}`,
              color: isSharedCourier ? C.green : '#fff',
              borderRadius: 12,
              padding: '8px 14px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isSharedCourier ? 'Desconectar' : 'Conectar'}
          </button>
        )}
      </div>

      {conflictMsg && (
        <div
          style={{
            background: 'rgba(255, 92, 51, 0.15)',
            border: `1px solid ${C.coral}`,
            borderRadius: 16,
            padding: '12px 14px',
            color: C.coral,
            fontSize: 12,
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          ⚡ {conflictMsg}
        </div>
      )}

      {/* Lista de Ofertas */}
      {offers.length === 0 ? (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.08)',
            borderRadius: 20,
            padding: '32px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            Buscando ofertas en tu zona...
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)', maxWidth: 280, margin: '0 auto' }}>
            Cuando un comercio solicite reparto en la red compartida, aparecerá aquí al instante.
          </div>
        </div>
      ) : (
        offers.map((offer) => {
          const isAccepting = acceptingId === offer.offerId;
          const timeLeftSecs = Math.max(0, Math.floor((offer.expiresAt - Date.now()) / 1000));

          return (
            <div
              key={offer.offerId}
              style={{
                background: C.surf1,
                border: '1px solid rgba(255, 184, 77, 0.25)',
                borderRadius: 20,
                padding: '16px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Barra lateral ámbar */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  background: C.amber,
                }}
              />

              <div style={{ paddingLeft: 6 }}>
                {/* Header de la tarjeta */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.amber, letterSpacing: '0.06em' }}>
                        #{offer.orderNumber}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 6,
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: 'rgba(255, 255, 255, 0.7)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {offer.store.businessType || 'TIENDA'}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)' }}>
                        · {offer.distanceKm.toFixed(1)} km
                      </span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                      {offer.store.name}
                    </div>
                  </div>

                  {/* Pago y contador */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase' }}>
                      Ganancia
                    </div>
                    <div
                      style={{
                        fontFamily: C.fontDisplay,
                        fontSize: 20,
                        fontWeight: 800,
                        color: C.green,
                      }}
                    >
                      ${offer.totalPayout.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 9, color: timeLeftSecs <= 10 ? C.coral : C.amber, fontWeight: 700 }}>
                      ⏱ {timeLeftSecs}s restantes
                    </div>
                  </div>
                </div>

                {/* Ruta: Recolección -> Entrega */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    margin: '10px 0 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ color: C.amber }}>📦</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Recoger en: <strong>{offer.pickupAddress}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ color: C.green }}>🏠</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Entregar a: <strong>{offer.customerName}</strong> ({offer.deliveryAddress})
                    </span>
                  </div>
                </div>

                {/* Botón Tomar Pedido */}
                <button
                  onClick={() => handleAccept(offer)}
                  disabled={isAccepting}
                  style={{
                    width: '100%',
                    height: 54,
                    borderRadius: 16,
                    background: C.amber,
                    border: 'none',
                    color: '#090909',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: isAccepting ? 'wait' : 'pointer',
                    boxShadow: '0 8px 24px rgba(255, 184, 77, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {isAccepting ? (
                    'RESERVANDO PEDIDO...'
                  ) : (
                    <>
                      <span>TOMAR PEDIDO</span>
                      <span style={{ fontSize: 10, opacity: 0.8 }}>(${offer.totalPayout.toFixed(2)})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
