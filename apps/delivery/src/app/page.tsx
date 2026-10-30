'use client';
// apps/delivery/src/app/page.tsx
// Reemplazado por el handoff v2 del design system MRTPV Delivery.
// Mantiene la lógica de negocio (API, socket, offline) y solo actualiza la capa visual.

import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import GPSTracker from '@/components/delivery/GPSTracker';
import { useOfflineStore } from '@/store/useOfflineStore';
import { initBackgroundSync } from '@/lib/offline';
import { ensureDriverPushSubscription } from '@/lib/push';
import { updateCourierPresence, presenceRefreshDelay } from '@/lib/marketplaceDispatch';
import { LoginScreen }     from '@/components/delivery/screens/LoginScreen';
import { CourierDashboard } from '@/components/delivery/screens/CourierDashboard';
import { DetailScreen }    from '@/components/delivery/screens/DetailScreen';
import { CobrarScreen }    from '@/components/delivery/screens/CobrarScreen';
import { CajaScreen }      from '@/components/delivery/screens/CajaScreen';
import { ChatScreen }      from '@/components/delivery/screens/ChatScreen';
import { GastoScreen }     from '@/components/delivery/screens/GastoScreen';
import { DesempenoScreen } from '@/components/delivery/screens/DesempenoScreen';
import { SetupScreen }     from '@/components/delivery/screens/SetupScreen';
import { MapScreen }       from '@/components/delivery/screens/MapScreen';
import { DispatchScreen }  from '@/components/delivery/screens/DispatchScreen';
import { AvisosScreen }    from '@/components/delivery/screens/AvisosScreen';
import { PinVerificationModal } from '@/components/delivery/PinVerificationModal';
import { needsStoreDeliveryPin, isDeliveryPinRejection, withDeliveryPin } from '@/lib/storeDeliveryPin';

type Screen =
  | 'setup' | 'login' | 'home' | 'detail'
  | 'chat'  | 'weekly'| 'cobrar' | 'caja'
  | 'gasto' | 'map'   | 'dispatch' | 'avisos';

// ── Accept Order Modal ─────────────────────────────────────────
const RING_R = 52;
const CIRC   = 2 * Math.PI * RING_R;

function AcceptOrderModal({ order, onAccept, onReject }: {
  order: any;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [secs, setSecs] = useState(30);

  useEffect(() => {
    const t = setInterval(() => setSecs(s => {
      if (s <= 1) { clearInterval(t); onReject(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filled    = ((30 - secs) / 30) * CIRC;
  const remaining = CIRC - filled;
  const urgent    = secs <= 10;
  const C_amber   = '#FFB84D', C_coral = '#FF5C33';
  const font      = "'Outfit', system-ui, sans-serif";
  const fontD     = "'Syne', system-ui, sans-serif";

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(9,9,11,0.94)', backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '28px 20px', fontFamily: font,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C_amber, letterSpacing: '0.24em', textTransform: 'uppercase', marginBottom: 6 }}>
        Nueva Orden Entrante
      </div>
      <div style={{ fontFamily: fontD, fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 24 }}>
        #{order?.orderNumber}
      </div>

      <div style={{ position: 'relative', width: 128, height: 128, marginBottom: 24 }}>
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={RING_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
          <circle cx="64" cy="64" r={RING_R} fill="none"
            stroke={urgent ? C_coral : C_amber}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${remaining} ${filled}`}
            transform="rotate(-90 64 64)"
            style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontFamily: fontD, fontSize: 36, fontWeight: 700, lineHeight: 1, color: urgent ? C_coral : C_amber, transition: 'color 0.3s' }}>
            {secs}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>seg</div>
        </div>
      </div>

      <div style={{ width: '100%', background: '#141416', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{order?.customerName}</div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 14 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={C_amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.58)', lineHeight: 1.5 }}>{order?.deliveryAddress}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', gap: 20 }}>
            {[['ETA', `${order?.etaMinutes || '—'} min`], ['Items', order?.items?.reduce((s: number, i: any) => s + (i.quantity || 1), 0) || '—']].map(([l, v]) => (
              <div key={l as string}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                <div style={{ fontFamily: fontD, fontSize: 17, fontWeight: 700, color: '#fff' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Total</div>
            <div style={{ fontFamily: fontD, fontSize: 26, fontWeight: 700, color: C_amber }}>${order?.total?.toFixed(2) || '0.00'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <button onClick={onReject} style={{
          flex: 1, height: 64, borderRadius: 18, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: font,
        }}>RECHAZAR</button>
        <button onClick={onAccept} style={{
          flex: 1.4, height: 64, borderRadius: 18, cursor: 'pointer',
          background: C_amber, border: 'none', color: '#090909',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
          fontFamily: font, boxShadow: '0 14px 44px rgba(255,184,77,0.38)',
        }}>ACEPTAR</button>
      </div>
    </div>
  );
}

export default function DeliveryApp() {
  const [mounted, setMounted]           = useState(false);
  const [screen, setScreen]             = useState<Screen>('login');
  const [driver, setDriver]             = useState<any>(null);
  const [orders, setOrders]             = useState<any[]>([]);
  const [history, setHistory]           = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  // Pedido propio cuyo código de entrega se está pidiendo, y códigos ya
  // capturados por pedido (solo en memoria: nunca se guardan ni se registran).
  const [pinOrder, setPinOrder]         = useState<any>(null);
  const deliveryPinsRef                 = useRef<Record<string, string>>({});
  const [messages, setMessages]         = useState<any[]>([]);
  const [cashSummary, setCashSummary]   = useState<any>(null);
  const [movements, setMovements]       = useState<any[]>([]);
  const [orderDetail, setOrderDetail]   = useState<any>(null);
  const [prevOrderCount, setPrevOrderCount] = useState(0);
  const [incomingOrder, setIncomingOrder]   = useState<any>(null);
  // Pool de pedidos DELIVERY sin repartidor: cualquier repartidor puede tomarlos.
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [claimingId, setClaimingId]           = useState<string | null>(null);
  const [avisos, setAvisos]                 = useState<any[]>([]);
  const [unreadNotices, setUnreadNotices]   = useState(0);

  const [locations, setLocations] = useState<any[]>([]);
  const [setupStep, setSetupStep] = useState<'auth' | 'location'>('auth');

  const [isOnline, setIsOnline] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSharedCourier, setIsSharedCourier] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [networkError, setNetworkError] = useState('');
  const lastPresenceRef = useRef<{ lat: number; lng: number; accuracy: number; at: number } | null>(null);
  const presenceGenerationRef = useRef(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => {
      setIsOnline(false);
      ++presenceGenerationRef.current;
      setIsSharedCourier(false); // No prometer disponibilidad con GPS vencido.
      setNetworkBusy(false);
      lastPresenceRef.current = null;
      setNetworkError('Sin conexión: se pausó la red compartida. Reconéctala al volver a tener Internet.');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const removeNetworkListeners = () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
    audioRef.current = new Audio('/notification.mp3');
    initBackgroundSync();

    // Deep-link de vinculación (?rid=&lid=&ln=) — fallback si el QR se abre en
    // Safari/navegador en vez de escanearse dentro de la app.
    const params = new URLSearchParams(window.location.search);
    const qrRid = params.get('rid');
    const qrLid = params.get('lid');
    if (qrRid && qrLid) {
      localStorage.setItem('restaurantId', qrRid);
      localStorage.setItem('locationId', qrLid);
      const qrLn = params.get('ln');
      if (qrLn) localStorage.setItem('locationName', qrLn);
      window.history.replaceState({}, '', window.location.pathname); // limpia la URL
      return removeNetworkListeners; // ya hay IDs → queda en 'login' (PIN)
    }

    const restId = localStorage.getItem('restaurantId');
    const locId  = localStorage.getItem('locationId');
    if (!restId || !locId) setScreen('setup');
    return removeNetworkListeners;
  }, []);

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrder?.id || null;
  }, [selectedOrder]);

  const fetchOrders = useCallback(async (d?: any) => {
    const id = (d || driver)?.id;
    if (!id) return;
    try {
      const { data } = await api.get(`/api/delivery/${id}/orders`);
      if (data.length > prevOrderCount && prevOrderCount > 0) {
        audioRef.current?.play().catch(() => {});
      }
      setPrevOrderCount(data.length);
      setOrders(data);
    } catch {}
  }, [driver, prevOrderCount]);

  const fetchAvailable = useCallback(async () => {
    try {
      const { data } = await api.get('/api/delivery/available-orders');
      setAvailableOrders(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  // Pedido del bot sin GPS: nace con envío $0 y la marca "ENVÍO POR ASIGNAR".
  // El backend NO lo deja salir a reparto hasta capturar el costo de envío.
  const shippingPending = (order: any) =>
    order?.orderType === 'DELIVERY' &&
    !(Number(order?.deliveryFee) > 0) &&
    /ENV[IÍ]O POR ASIGNAR/i.test(order?.notes || '');

  const promptShippingFee = (order: any): number | null => {
    const raw = window.prompt(
      `El pedido #${order.orderNumber} tiene el ENVÍO POR ASIGNAR.\n¿Cuánto se cobra de envío? ($)`,
      ''
    );
    if (raw == null) return null; // canceló
    const fee = Math.round(Number(String(raw).replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(fee) || fee <= 0 || fee > 1000) {
      alert('Monto de envío inválido.');
      return null;
    }
    return fee;
  };

  // Tomar un pedido del pool. El backend es atómico: si otro repartidor ganó,
  // responde 409 ALREADY_CLAIMED y solo refrescamos la lista. Si el pedido
  // trae "ENVÍO POR ASIGNAR", se captura el costo ANTES de tomarlo (viaja en
  // el mismo claim, así el pedido nunca sale con envío $0).
  const claimOrder = useCallback(async (order: any) => {
    if (!driver || claimingId) return;
    let deliveryFee: number | undefined;
    if (shippingPending(order)) {
      const fee = promptShippingFee(order);
      if (fee == null) return;
      deliveryFee = fee;
    }
    setClaimingId(order.id);
    try {
      await api.post(`/api/delivery/${driver.id}/claim/${order.id}`, deliveryFee ? { deliveryFee } : {});
      setAvailableOrders(prev => prev.filter(o => o.id !== order.id));
      await fetchOrders();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'SHIPPING_FEE_PENDING') {
        alert('Este pedido necesita costo de envío. Tócalo de nuevo y captúralo.');
      } else if (err?.response?.status === 409) {
        alert('Otro repartidor ya tomó ese pedido 🏃');
      } else {
        alert(err?.response?.data?.error || 'No se pudo tomar el pedido');
      }
      fetchAvailable();
    } finally { setClaimingId(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, claimingId]);

  const fetchHistory = useCallback(async () => {
    if (!driver) return;
    try {
      const { data } = await api.get(`/api/delivery/${driver.id}/history`);
      setHistory(data);
    } catch {}
  }, [driver]);

  const fetchCash = useCallback(async () => {
    if (!driver) return;
    try {
      const { data } = await api.get(`/api/driver-cash/${driver.id}/movements`);
      setMovements(data.movements || []);
      setCashSummary(data.summary || {});
    } catch {}
  }, [driver]);

  const fetchMessages = useCallback(async (orderId: string) => {
    try {
      const { data } = await api.get(`/api/delivery/orders/${orderId}/messages`);
      setMessages(data);
    } catch {}
  }, []);

  const fetchAvisos = useCallback(async (d?: any) => {
    const id = (d || driver)?.id;
    if (!id) return;
    try {
      const { data } = await api.get(`/api/delivery/${id}/notices`);
      setAvisos(data.notices || []);
      setUnreadNotices(data.unread || 0);
    } catch {}
  }, [driver]);

  const markNoticeRead = useCallback(async (noticeId: string) => {
    setAvisos(prev => prev.map(n => n.id === noticeId ? { ...n, read: true } : n));
    setUnreadNotices(prev => Math.max(0, prev - 1));
    try { await api.post(`/api/delivery/notices/${noticeId}/read`); } catch {}
  }, []);

  const fetchOrderDetail = useCallback(async (orderId: string) => {
    try {
      const { data } = await api.get(`/api/orders/${orderId}`);
      setOrderDetail(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (!driver) return;
    fetchOrders();
    fetchHistory();
    fetchAvisos();
    fetchAvailable();
    // Notificaciones push al celular (PWA): registrar/actualizar la suscripción
    // de ESTE repartidor. Best-effort; si niega el permiso, la app sigue igual.
    ensureDriverPushSubscription(driver.id).catch(() => {});

    const socket = io(getApiUrl(), {
      // El token identifica al repartidor en el server (socket.data.user) y lo
      // une a la sala driver:{id} para recibir asignaciones y mensajes en vivo.
      auth: { token: localStorage.getItem('accessToken') },
      query: {
        restaurantId: localStorage.getItem('restaurantId'),
        locationId:   localStorage.getItem('locationId'),
      },
    });
    socket.on('newOrder',     () => fetchOrders());
    socket.on('orderUpdated', () => fetchOrders());
    // Nuevo pedido DELIVERY sin asignar → entra al pool de "Disponibles".
    socket.on('newAvailableOrder', () => {
      audioRef.current?.play().catch(() => {});
      fetchAvailable();
    });
    // Alguien tomó (o el staff asignó) un pedido del pool → refrescar ambos.
    socket.on('availableOrdersChanged', () => { fetchAvailable(); fetchOrders(); });
    // Nueva orden asignada específicamente a este repartidor.
    // Backend debe emitir 'orderAssigned' solo al socket del driver: socket.to(driverSocketId).emit('orderAssigned', { order })
    socket.on('orderAssigned', (data: any) => {
      if (data?.order) {
        audioRef.current?.play().catch(() => {});
        setIncomingOrder(data.order);
      }
    });
    socket.on('newMessage', (data: any) => {
      const currentId = selectedOrderIdRef.current;
      if (currentId && currentId === data.orderId) {
        fetchMessages(currentId);
      }
    });
    // Aviso nuevo del restaurante (dirigido o broadcast).
    socket.on('newNotice', () => {
      audioRef.current?.play().catch(() => {});
      fetchAvisos();
    });
    // El admin asignó fondo de cambio / movió la caja: refrescar saldo.
    socket.on('cashUpdated', () => fetchCash());
    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver]);

  useEffect(() => {
    if (screen === 'chat' && selectedOrder) fetchMessages(selectedOrder.id);
    if (screen === 'caja') fetchCash();
    if (screen === 'avisos') fetchAvisos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedOrder]);

  async function handleSetupLogin(email: string, password: string) {
    setLoggingIn(true);
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      const locs = await api.get('/api/auth/my-locations');
      setLocations(locs.data);
      localStorage.setItem('restaurantId', data.user.restaurantId);
      setSetupStep('location');
    } catch { alert('Credenciales incorrectas.'); }
    finally { setLoggingIn(false); }
  }

  function finishSetup(loc: any) {
    localStorage.setItem('locationId', loc.id);
    localStorage.setItem('locationName', loc.name);
    localStorage.removeItem('accessToken');
    setScreen('login');
  }

  // Vinculado por QR escaneado dentro de la app: guarda los IDs y pasa al PIN.
  function handleQrLink({ restaurantId, locationId, locationName }: { restaurantId: string; locationId: string; locationName?: string }) {
    localStorage.setItem('restaurantId', restaurantId);
    localStorage.setItem('locationId', locationId);
    if (locationName) localStorage.setItem('locationName', locationName);
    localStorage.removeItem('accessToken');
    setScreen('login');
  }

  async function handlePinLogin(pin: string) {
    setLoggingIn(true);
    try {
      const { data } = await api.post('/api/employees/login', { pin });
      ++presenceGenerationRef.current;
      setIsSharedCourier(false);
      setNetworkBusy(false);
      setNetworkError('');
      lastPresenceRef.current = null;
      setDriver(data.employee);
      setLoginError('');
      localStorage.setItem('accessToken', data.token);
      setScreen('home');
      fetchOrders(data.employee);
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      let msg = 'PIN incorrecto';
      if (!err?.response)            msg = 'Sin conexión con el servidor';
      else if (status === 404)       msg = 'Repartidor no encontrado en esta sucursal';
      else if (status >= 500)        msg = 'Servidor caído. Intenta de nuevo.';
      else if (serverMsg)            msg = serverMsg;
      setLoginError(msg);
    } finally { setLoggingIn(false); }
  }

  // Entrar a cobrar: si el pedido propio requiere código del cliente y aún no
  // se capturó, pedirlo primero.
  function startDelivery(order: any) {
    setSelectedOrder(order);
    if (needsStoreDeliveryPin(order) && !deliveryPinsRef.current[order.id]) {
      setPinOrder(order);
      return;
    }
    setScreen('cobrar');
  }

  async function confirmStoreDeliveryPin(pin: string): Promise<{ success: boolean; error?: string }> {
    const order = pinOrder;
    if (!order) return { success: false, error: 'Pedido no disponible' };
    // Sin conexión no se puede verificar aquí: el servidor lo verifica al
    // sincronizar la entrega y, si no coincide, la cola la marca rechazada.
    if (navigator.onLine) {
      try {
        await api.post(`/api/delivery/${driver.id}/orders/${order.id}/delivery-pin`, { deliveryPin: pin });
      } catch (err: any) {
        return { success: false, error: err?.response?.data?.error || 'No se pudo verificar el código' };
      }
    }
    deliveryPinsRef.current[order.id] = pin;
    setPinOrder(null);
    setScreen('cobrar');
    return { success: true };
  }

  async function changeStatus(order: any, status: string, method?: string) {
    const data = withDeliveryPin({
      orderId: order.id, status,
      // driverId va en el payload para que la reproducción OFFLINE pueda pegarle
      // al MISMO endpoint que la ruta online (/api/delivery/:driverId/.../status)
      // — ese es el único que crea el INCOME del corte del repartidor. Sin esto,
      // la cola caía en /confirm-cash y la entrega quedaba fuera del corte.
      driverId: driver.id,
      ...(method ? { paymentMethod: method } : {}),
    }, order, status, deliveryPinsRef.current[order.id]);
    const forgetPin = () => { if (status === 'DELIVERED') delete deliveryPinsRef.current[order.id]; };
    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'CONFIRM_DELIVERY', data });
      forgetPin();
      if (status === 'DELIVERED') {
        setOrders(os => os.filter(o => o.id !== order.id));
        setScreen('home');
      }
      return;
    }
    try {
      await api.put(`/api/delivery/${driver.id}/orders/${order.id}/status`, data);
      forgetPin();
      fetchOrders();
      if (status === 'DELIVERED') setScreen('home');
    } catch (err: any) {
      // Pedido asignado a mano que sigue con "ENVÍO POR ASIGNAR": capturar el
      // costo aquí mismo y reintentar — sin envío el backend no deja cerrar.
      if (err?.response?.data?.code === 'SHIPPING_FEE_PENDING') {
        const fee = promptShippingFee(order);
        if (fee == null) return;
        try {
          await api.put(`/api/delivery/orders/${order.id}/delivery-fee`, { amount: fee });
          await api.put(`/api/delivery/${driver.id}/orders/${order.id}/status`, data);
          fetchOrders();
          if (status === 'DELIVERED') setScreen('home');
        } catch (retryErr: any) {
          alert(retryErr?.response?.data?.error || 'No se pudo asignar el envío');
        }
        return;
      }
      // Código del cliente rechazado: volver a pedirlo (nunca reintentar a ciegas).
      if (isDeliveryPinRejection(err?.response?.data?.code)) {
        forgetPin();
        alert(err.response.data.error || 'El código de entrega no coincide');
        setScreen('detail');
        setPinOrder(order);
        return;
      }
      alert(err.response?.data?.error || 'Error');
    }
  }

  // La disponibilidad de red compartida NO es el indicador navigator.onLine.
  // Requiere consentimiento del repartidor, GPS real y acuse del servidor.
  const getCourierPosition = useCallback((): Promise<{ lat: number; lng: number; accuracy: number }> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Tu dispositivo no permite obtener ubicación.')); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.max(0, pos.coords.accuracy) : 0 }),
        () => reject(new Error('Para conectarte, activa el GPS y concede permiso de ubicación.')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );
    }), []);

  const toggleSharedCourier = useCallback(async (enabled: boolean) => {
    if (!driver || networkBusy) return;
    if (enabled && !navigator.onLine) {
      setNetworkError('Sin Internet. No es posible activar la red compartida.');
      return;
    }
    const generation = ++presenceGenerationRef.current;
    setNetworkBusy(true);
    setNetworkError('');
    if (!enabled) setIsSharedCourier(false); // Privacidad: dejar de actualizar GPS inmediatamente.
    try {
      if (enabled) {
        const gps = await getCourierPosition();
        if (generation !== presenceGenerationRef.current) return;
        const response = await updateCourierPresence({
          courierId: driver.id, isOnline: true, acceptingShared: true, ...gps,
        });
        if (!response.ok) throw new Error('El despachador no confirmó tu disponibilidad.');
        if (generation !== presenceGenerationRef.current) return;
        lastPresenceRef.current = { ...gps, at: Date.now() };
        setIsSharedCourier(true);
      } else {
        const last = lastPresenceRef.current;
        const recent = last && Date.now() - last.at < 75000;
        // Si el GPS ya caducó, apagamos presencia hasta verificarla; nunca inventamos 0,0.
        const response = await updateCourierPresence({
          courierId: driver.id, acceptingShared: false, isOnline: Boolean(recent),
          ...(recent ? { lat: last.lat, lng: last.lng, accuracy: last.accuracy } : {}),
        });
        if (!response.ok) throw new Error('El servidor no confirmó la desconexión.');
        lastPresenceRef.current = null;
      }
    } catch (error) {
      if (generation === presenceGenerationRef.current) {
        setNetworkError(error instanceof Error ? error.message : 'No se pudo cambiar la disponibilidad.');
        if (enabled) setIsSharedCourier(false);
      }
    } finally {
      if (generation === presenceGenerationRef.current) setNetworkBusy(false);
    }
  }, [driver, getCourierPosition, networkBusy]);

  // Presencia renovada cada minuto mientras el repartidor eligió conectarse.
  // El ranking del despacho exige última muestra GPS en los últimos 90 segundos.
  useEffect(() => {
    if (!driver || !isSharedCourier || !isOnline) return;
    let cancelled = false;
    let timer: number | undefined;
    // true si el servidor recibió la muestra; solo entonces se agenda la siguiente.
    const refresh = async (): Promise<boolean> => {
      try {
        const gps = await getCourierPosition();
        if (cancelled) return false;
        const response = await updateCourierPresence({
          courierId: driver.id, isOnline: true, acceptingShared: true, ...gps,
        });
        if (!response.ok) throw new Error('El despachador no confirmó el GPS.');
        if (cancelled) return false;
        lastPresenceRef.current = { ...gps, at: Date.now() };
        setNetworkError('');
        return true;
      } catch {
        if (cancelled) return false;
        // No asegurar que seguimos disponibles si no hay presencia actual.
        setIsSharedCourier(false);
        void updateCourierPresence({
          courierId: driver.id, isOnline: false, acceptingShared: false,
        }).catch(() => {}); // Falla de red: el backend dejará vencer la presencia.
        setNetworkError('Se pausó la red: no fue posible actualizar tu GPS. Actívala nuevamente.');
        return false;
      }
    };
    // La siguiente muestra va 55 s después de la última aceptada. Al volver
    // Internet tras un corte, la última ya puede rebasar los 90 s: va de inmediato.
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (await refresh() && !cancelled) schedule();
      }, presenceRefreshDelay(lastPresenceRef.current?.at, Date.now()));
    };
    schedule();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [driver, isSharedCourier, isOnline, getCourierPosition]);

  const handleMarketplaceOfferAccepted = useCallback((_result: { taskId: string; orderId?: string }) => {
    // La API actual confirma taskId pero no entrega una orden legacy ni dirección.
    // El componente Marketplace conserva el acuse y evita inventar una ruta.
    void fetchOrders();
  }, [fetchOrders]);

  async function saveExpense(cat: string, amount: string, desc: string, pending = false) {
    if (!amount || Number(amount) <= 0) return;
    // Clave de idempotencia estable por captura: dedupea doble-tap y replays de
    // la cola offline (el middleware global la cubre) para no duplicar el gasto.
    const movementId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${driver.id}-${Date.now()}`;
    const expenseData = {
      type: 'EXPENSE', category: cat, amount, description: desc, driverId: driver.id, movementId,
      ...(pending ? { pending: 'true' } : {}),
    };

    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'LOG_EXPENSE', data: expenseData });
      setScreen('caja');
      return;
    }
    try {
      const formData = new FormData();
      Object.entries(expenseData).forEach(([k, v]) => formData.append(k, v as string));
      await api.post(`/api/driver-cash/${driver.id}/movements`, formData, {
        headers: { 'Idempotency-Key': movementId },
      });
      setScreen('caja');
    } catch {}
  }

  async function handleRetiro(amount: number) {
    if (!driver || !(amount > 0)) return;
    try {
      const formData = new FormData();
      formData.append('type', 'RETURN');
      formData.append('category', 'RETIRO');
      formData.append('amount', String(amount));
      formData.append('description', 'Retiro de efectivo');
      formData.append('driverId', driver.id);
      await api.post(`/api/driver-cash/${driver.id}/movements`, formData);
      fetchCash();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'No se pudo registrar el retiro');
      throw err;
    }
  }

  async function handleCerrarTurno(): Promise<boolean> {
    if (!driver) return false;
    try {
      await api.post(`/api/driver-cash/${driver.id}/shift-request`);
      return true;
    } catch (err: any) {
      alert(err?.response?.data?.error || 'No se pudo enviar el aviso. Revisa tu conexión.');
      return false;
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || !selectedOrder) return;
    const msgData = { orderId: selectedOrder.id, message: text, fromDriver: true };
    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'CHAT_MESSAGE', data: msgData });
      setMessages(m => [...m, { ...msgData, id: Date.now().toString(), createdAt: new Date() } as any]);
      return;
    }
    try {
      await api.post(`/api/delivery/orders/${selectedOrder.id}/messages`, msgData);
      fetchMessages(selectedOrder.id);
    } catch {}
  }

  if (!mounted) return null;

  const locationName = mounted ? (localStorage.getItem('locationName') || 'Sucursal') : '';

  return (
    <>
      {/* Montado en todas las pantallas con sesión: en el detalle del pedido (cuando entrega)
          el GPS sigue enviando y el comprador ve al repartidor en su seguimiento. */}
      {driver && screen !== 'setup' && screen !== 'login' && (
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <GPSTracker
            driverId={driver?.id}
            activeOrderId={orders.find((o: any) => o.status === 'ON_THE_WAY')?.id}
          />
        </div>
      )}

      {screen === 'setup' && (
        <SetupScreen
          step={setupStep}
          locations={locations}
          loggingIn={loggingIn}
          onLogin={handleSetupLogin}
          onSelectLocation={finishSetup}
          onQrLink={handleQrLink}
        />
      )}

      {screen === 'login' && (
        <LoginScreen
          locationName={locationName}
          loggingIn={loggingIn}
          loginError={loginError}
          onLogin={handlePinLogin}
        />
      )}

      {screen === 'home' && (
        <CourierDashboard
          driver={driver}
          orders={orders}
          availableOrders={availableOrders}
          claimingId={claimingId}
          onClaimOrder={claimOrder}
          isOnline={isOnline}
          unreadNotices={unreadNotices}
          pendingSync={useOfflineStore.getState().queue.length}
          isSharedCourier={isSharedCourier}
          networkBusy={networkBusy}
          networkError={networkError}
          onToggleShared={toggleSharedCourier}
          onMarketplaceOfferAccepted={handleMarketplaceOfferAccepted}
          onSelectOrder={(order: any) => {
            setSelectedOrder(order);
            fetchOrderDetail(order.id);
            setScreen('detail');
          }}
          onChat={(order: any) => { setSelectedOrder(order); setScreen('chat'); }}
          onDeliverOrder={(order: any) => startDelivery(order)}
          onNavigate={(s: string) => {
            if (s === 'login') {
              ++presenceGenerationRef.current;
              if (driver && isSharedCourier) {
                // El token se borra abajo antes de que axios envíe: va explícito.
                const authToken = localStorage.getItem('accessToken') || undefined;
                void updateCourierPresence({
                  courierId: driver.id, isOnline: false, acceptingShared: false,
                }, { authToken }).catch(() => {}); // El servidor descartará GPS por TTL si no hay conexión.
              }
              setIsSharedCourier(false);
              setNetworkBusy(false);
              setNetworkError('');
              lastPresenceRef.current = null;
              setDriver(null);
              localStorage.removeItem('accessToken');
            }
            if (s === 'weekly') fetchHistory();
            setScreen(s as Screen);
          }}
        />
      )}

      {screen === 'detail' && selectedOrder && (
        <DetailScreen
          order={selectedOrder}
          orderDetail={orderDetail}
          onBack={() => setScreen('home')}
          onCobrar={() => startDelivery(selectedOrder)}
          onChat={() => setScreen('chat')}
          onPickupConfirmed={() => {
            // Cambiar estado a ON_THE_WAY después de confirmar recolección
            changeStatus(selectedOrder, 'ON_THE_WAY');
          }}
          onDeliveryConfirmed={() => {
            // Cambiar estado a DELIVERED y volver a home
            changeStatus(selectedOrder, 'DELIVERED');
          }}
        />
      )}

      {screen === 'cobrar' && selectedOrder && (
        <CobrarScreen
          order={selectedOrder}
          onBack={() => setScreen('detail')}
          onConfirm={(method?: string) => changeStatus(selectedOrder, 'DELIVERED', method)}
        />
      )}

      {/* Código de entrega que dicta el cliente (pedidos propios de la tienda) */}
      {pinOrder && (
        <PinVerificationModal
          type="DELIVERY"
          orderNumber={pinOrder.orderNumber || ''}
          targetName={pinOrder.customerName || 'el cliente'}
          onConfirm={confirmStoreDeliveryPin}
          onCancel={() => setPinOrder(null)}
        />
      )}

      {screen === 'caja' && (
        <CajaScreen
          driverId={driver?.id}
          movements={movements}
          summary={cashSummary}
          onBack={() => setScreen('home')}
          onGasto={() => setScreen('gasto')}
          onRetiro={handleRetiro}
          onCerrarTurno={handleCerrarTurno}
        />
      )}

      {screen === 'gasto' && (
        <GastoScreen
          onBack={() => setScreen('caja')}
          onSave={saveExpense}
        />
      )}

      {screen === 'chat' && selectedOrder && (
        <ChatScreen
          order={selectedOrder}
          messages={messages}
          onBack={() => setScreen('home')}
          onSend={sendMessage}
        />
      )}

      {screen === 'weekly' && (
        <DesempenoScreen
          history={history}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'map' && (
        <MapScreen
          orders={orders}
          driverLat={undefined}
          driverLng={undefined}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'dispatch' && (
        <DispatchScreen
          onBack={() => setScreen('home')}
          locationId={typeof window !== 'undefined' ? (localStorage.getItem('locationId') || undefined) : undefined}
        />
      )}

      {screen === 'avisos' && (
        <AvisosScreen
          avisos={avisos}
          onBack={() => setScreen('home')}
          onRead={markNoticeRead}
        />
      )}

      {/* AcceptOrderModal — flota sobre cualquier pantalla cuando llega una asignación */}
      {incomingOrder && (
        <AcceptOrderModal
          order={incomingOrder}
          onAccept={() => {
            fetchOrders();
            setIncomingOrder(null);
            setScreen('home');
          }}
          onReject={() => {
            api.post(`/api/delivery/${driver?.id}/orders/${incomingOrder.id}/reject`)
              .catch(() => {});
            setIncomingOrder(null);
          }}
        />
      )}
    </>
  );
}
