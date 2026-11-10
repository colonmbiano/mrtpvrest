'use client';
// Tablero de despacho del repartidor INDEPENDIENTE (red del marketplace). Usa el
// Bearer de courier (inyectado por lib/api cuando deliveryMode==='courier'):
//   1. Perfil (/couriers/me/profile) → courierId + estado de verificación.
//   2. Presencia + GPS → updateCourierPresence (conectarse a la red).
//   3. Ofertas de varias tiendas → MarketplaceOffers (reusado del modo tienda).
//   4. Tarea aceptada → PIN de recolección y de entrega.
//   5. Mis ganancias (C8) → CourierWallet: 100% del envío y el saldo diario con cada comercio.
import React, { useCallback, useEffect, useState } from 'react';
import { Bike, LogOut, MapPin, ShieldAlert, ShieldCheck } from 'lucide-react';
import { C, S } from '@/lib/tokens';
import { getCourierProfile, type CourierProfile } from '@/lib/courierSession';
import { updateCourierPresence, confirmPickupPin, confirmDeliveryPin } from '@/lib/marketplaceDispatch';
import { MarketplaceOffers } from '@/components/delivery/MarketplaceOffers';
import { CourierWallet } from '@/components/delivery/CourierWallet';

interface CourierHomeScreenProps {
  onLogout: () => void;
}

function getPosition(): Promise<{ lat: number; lng: number; accuracy?: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('NO_GPS'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error('GPS_DENIED')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export function CourierHomeScreen({ onLogout }: CourierHomeScreenProps) {
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [acceptingShared, setAcceptingShared] = useState(false);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [presenceError, setPresenceError] = useState('');

  const [task, setTask] = useState<{ taskId: string; orderId?: string } | null>(null);
  const [stage, setStage] = useState<'pickup' | 'deliver' | 'done'>('pickup');
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const [deliveries, setDeliveries] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      setProfile(await getCourierProfile());
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setLoadError(code === 'NETWORK'
        ? 'Sin conexión. No se pudo cargar tu perfil de repartidor.'
        : code === 'COURIER_NOT_FOUND'
          ? 'Tu cuenta aún no tiene un perfil de repartidor en la red.'
          : 'No se pudo cargar tu perfil de repartidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const verified = profile?.verificationStatus === 'VERIFIED' && profile?.status === 'ACTIVE';

  const toggleShared = useCallback(async (enabled: boolean) => {
    if (!profile || presenceBusy) return;
    setPresenceBusy(true); setPresenceError('');
    try {
      if (enabled) {
        const pos = await getPosition();
        await updateCourierPresence({ courierId: profile.courierId, isOnline: true,
          lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, acceptingShared: true });
        setAcceptingShared(true);
      } else {
        await updateCourierPresence({ courierId: profile.courierId, isOnline: false, acceptingShared: false });
        setAcceptingShared(false);
      }
    } catch (e) {
      const msg = e instanceof Error && (e.message === 'GPS_DENIED' || e.message === 'NO_GPS')
        ? 'Necesitamos tu ubicación (GPS) para conectarte a la red.'
        : 'No se pudo actualizar tu disponibilidad. Intenta de nuevo.';
      setPresenceError(msg);
    } finally {
      setPresenceBusy(false);
    }
  }, [profile, presenceBusy]);

  async function confirmPin() {
    if (!task || pinBusy || !/^\d{4,6}$/.test(pin.trim())) {
      setPinError('El PIN debe tener de 4 a 6 dígitos.');
      return;
    }
    setPinBusy(true); setPinError('');
    const courierId = profile!.courierId;
    const result = stage === 'pickup'
      ? await confirmPickupPin(courierId, task.taskId, pin.trim())
      : await confirmDeliveryPin(courierId, task.taskId, pin.trim());
    setPinBusy(false);
    if (result.success) {
      setPin('');
      if (stage === 'pickup') setStage('deliver');
      else { setStage('done'); setTask(null); setDeliveries(count => count + 1); }
    } else {
      setPinError(result.error || 'PIN incorrecto. Verifícalo e intenta de nuevo.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody, color: C.text }}>
      <div style={S.header}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: C.greenSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bike size={20} color={C.green} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: C.fontDisplay, fontSize: 15, fontWeight: 700 }}>Repartidor independiente</div>
          <div style={{ fontSize: 10, color: verified ? C.green : C.warn, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {loading ? 'Cargando…' : verified ? 'Verificado' : 'Sesión activa'}
          </div>
        </div>
        <button onClick={onLogout} style={S.iconBtn} aria-label="Cerrar sesión"><LogOut size={18} /></button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <div style={S.card}><p role="status" style={{ margin: 0, color: C.textDim }}>Cargando tu perfil…</p></div>}

        {!loading && loadError && (
          <div style={S.card}>
            <p role="alert" style={{ margin: 0, color: '#ef4444', fontSize: 13, lineHeight: 1.5 }}>{loadError}</p>
            <button onClick={() => void load()} style={{ ...S.btnSecondary, marginTop: 12, width: '100%', height: 48 }}>REINTENTAR</button>
          </div>
        )}

        {!loading && !loadError && !verified && (
          <div style={{ ...S.card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <ShieldAlert size={22} color={C.warn} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Cuenta en revisión</div>
              <p style={{ margin: 0, fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
                Tu perfil de repartidor aún no está verificado. Cuando la plataforma lo apruebe
                podrás conectarte a la red y recibir ofertas de entrega.
              </p>
            </div>
          </div>
        )}

        {!loading && !loadError && verified && (
          <>
            {presenceError && (
              <div role="alert" style={{ ...S.card, borderColor: 'rgba(239,68,68,0.3)' }}>
                <p style={{ margin: 0, color: '#ef4444', fontSize: 13 }}>{presenceError}</p>
              </div>
            )}

            {task ? (
              <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <MapPin size={18} color={C.amber} />
                  <strong style={{ fontSize: 15 }}>Entrega #{task.taskId.slice(0, 8)}</strong>
                </div>
                <div style={S.sectionLabel}>
                  {stage === 'pickup' ? 'PIN de recolección (lo da la tienda)' : 'PIN de entrega (lo da el cliente)'}
                </div>
                <input
                  value={pin} inputMode="numeric" maxLength={6} placeholder="••••"
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '100%', height: 52, background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: '0 14px', fontSize: 20, letterSpacing: '0.3em',
                    textAlign: 'center', color: C.text, fontFamily: C.fontBody, outline: 'none' }} />
                {pinError && <p role="alert" style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{pinError}</p>}
                <button onClick={() => void confirmPin()} disabled={pinBusy || pin.trim().length < 4}
                  style={{ ...(stage === 'pickup' ? S.btnPrimary : S.btnSuccess), marginTop: 12,
                    opacity: pinBusy || pin.trim().length < 4 ? 0.6 : 1 }}>
                  {pinBusy ? 'VALIDANDO…' : stage === 'pickup' ? 'CONFIRMAR RECOLECCIÓN' : 'CONFIRMAR ENTREGA'}
                </button>
              </div>
            ) : (
              <MarketplaceOffers
                courierId={profile!.courierId}
                isSharedCourier={acceptingShared}
                isOnline={typeof navigator === 'undefined' ? true : navigator.onLine}
                busy={presenceBusy}
                onToggleShared={toggleShared}
                onOfferAccepted={result => { setTask(result); setStage('pickup'); setPin(''); setPinError(''); }}
              />
            )}

            {stage === 'done' && !task && (
              <div style={{ ...S.card, borderColor: 'rgba(136,214,108,0.3)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <ShieldCheck size={20} color={C.green} />
                <span style={{ fontSize: 13, color: C.textDim }}>Entrega confirmada. ¡Buen trabajo!</span>
              </div>
            )}

            <CourierWallet refreshKey={deliveries} />
          </>
        )}
      </div>
    </div>
  );
}
