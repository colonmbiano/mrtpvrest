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
import { LoginScreen }     from '@/components/delivery/screens/LoginScreen';
import { HomeScreen }      from '@/components/delivery/screens/HomeScreen';
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
  const [messages, setMessages]         = useState<any[]>([]);
  const [cashSummary, setCashSummary]   = useState<any>(null);
  const [movements, setMovements]       = useState<any[]>([]);
  const [orderDetail, setOrderDetail]   = useState<any>(null);
  const [prevOrderCount, setPrevOrderCount] = useState(0);
  const [incomingOrder, setIncomingOrder]   = useState<any>(null);
  const [avisos, setAvisos]                 = useState<any[]>([]);
  const [unreadNotices, setUnreadNotices]   = useState(0);

  const [locations, setLocations] = useState<any[]>([]);
  const [setupStep, setSetupStep] = useState<'auth' | 'location'>('auth');

  const [isOnline, setIsOnline] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    window.addEventListener('online',  () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
    audioRef.current = new Audio('/notification.mp3');
    initBackgroundSync();

    const restId = localStorage.getItem('restaurantId');
    const locId  = localStorage.getItem('locationId');
    if (!restId || !locId) setScreen('setup');
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

  async function handlePinLogin(pin: string) {
    setLoggingIn(true);
    try {
      const { data } = await api.post('/api/employees/login', { pin });
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

  async function changeStatus(order: any, status: string, method?: string) {
    const data = {
      orderId: order.id, status,
      ...(method ? { paymentMethod: method } : {}),
    };
    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'CONFIRM_DELIVERY', data });
      if (status === 'DELIVERED') {
        setOrders(os => os.filter(o => o.id !== order.id));
        setScreen('home');
      }
      return;
    }
    try {
      await api.put(`/api/delivery/${driver.id}/orders/${order.id}/status`, data);
      fetchOrders();
      if (status === 'DELIVERED') setScreen('home');
    } catch (err: any) { alert(err.response?.data?.error || 'Error'); }
  }

  async function saveExpense(cat: string, amount: string, desc: string) {
    if (!amount || Number(amount) <= 0) return;
    const expenseData = { type: 'EXPENSE', category: cat, amount, description: desc, driverId: driver.id };

    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'LOG_EXPENSE', data: expenseData });
      setScreen('caja');
      return;
    }
    try {
      const formData = new FormData();
      Object.entries(expenseData).forEach(([k, v]) => formData.append(k, v as string));
      await api.post(`/api/driver-cash/${driver.id}/movements`, formData);
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
      {driver && screen === 'home' && (
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
        <HomeScreen
          driver={driver}
          orders={orders}
          isOnline={isOnline}
          unreadNotices={unreadNotices}
          pendingSync={useOfflineStore.getState().queue.length}
          onSelectOrder={(order: any) => {
            setSelectedOrder(order);
            fetchOrderDetail(order.id);
            setScreen('detail');
          }}
          onChat={(order: any) => { setSelectedOrder(order); setScreen('chat'); }}
          onDeliverOrder={(order: any) => { setSelectedOrder(order); setScreen('cobrar'); }}
          onNavigate={(s: string) => {
            if (s === 'login') { setDriver(null); }
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
          onCobrar={() => setScreen('cobrar')}
          onChat={() => setScreen('chat')}
        />
      )}

      {screen === 'cobrar' && selectedOrder && (
        <CobrarScreen
          order={selectedOrder}
          onBack={() => setScreen('detail')}
          onConfirm={(method: string) => changeStatus(selectedOrder, 'DELIVERED', method)}
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
