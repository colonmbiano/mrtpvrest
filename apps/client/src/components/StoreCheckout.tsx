'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCart } from '../lib/cartStore';
import { getApiUrl } from '../lib/config';
import { computeDeliveryPreview, type DeliveryConfig } from '../lib/delivery';
import { MapLocationPicker } from './MapLocationPicker';
import { useMoney } from './StoreLocaleContext';
import { generateWhatsAppOrderMessage } from '../lib/waOrderMessage';

const API = getApiUrl();
// fmt viene de useMoney() (moneda/locale del tenant).

type OrderType = 'DELIVERY' | 'TAKEOUT' | 'DINE_IN';

type StoreCheckoutProps = {
  open: boolean;
  onClose: () => void;
  slug: string;
  primary: string;
  locations?: any[];
  delivery?: DeliveryConfig | null;
  minOrderAmount?: number;
  onlinePayment?: boolean;
  // Tipo de pedido preseleccionado (ej. el toggle Entrega/Recoger del tema).
  // Si la sucursal no lo permite, el efecto de `allowed` lo corrige a uno válido.
  initialOrderType?: OrderType;
  whatsappOrder?: { enabled: boolean; number: string | null };
  // Menú QR en mesa: cuando llega de un QR (?mesa=&l=), el pedido queda fijo en
  // DINE_IN con esa mesa y sucursal (sin selector de tipo, mesa bloqueada).
  lockedTable?: string | null;
  lockedLocationId?: string | null;
};

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  PENDING:    { t: 'Recibido', c: '#f59e0b' },
  CONFIRMED:  { t: 'Confirmado', c: '#3b82f6' },
  PREPARING:  { t: 'En preparación', c: '#8b5cf6' },
  READY:      { t: 'Listo', c: '#10b981' },
  ON_THE_WAY: { t: 'En camino', c: '#06b6d4' },
  DELIVERED:  { t: 'Entregado', c: '#10b981' },
  CANCELLED:  { t: 'Cancelado', c: '#ef4444' },
};

export default function StoreCheckout({
  open, onClose, slug, primary, locations = [], delivery, minOrderAmount = 0, onlinePayment = false,
  initialOrderType = 'DELIVERY', whatsappOrder,
  lockedTable = null, lockedLocationId = null,
}: StoreCheckoutProps) {
  const fmt = useMoney();
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const clear = useCart(s => s.clear);

  // Datos del cliente
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'' | 'loading' | 'ok' | 'error'>('');

  // Tipo de pedido + sucursal
  const [orderType, setOrderType] = useState<OrderType>(lockedTable ? 'DINE_IN' : initialOrderType);
  const [tableNumber, setTableNumber] = useState(lockedTable || '');
  const [locationId, setLocationId] = useState<string>(lockedLocationId || locations[0]?.id || '');
  const selectedLocation = locations.find(l => l.id === locationId) || locations[0] || null;

  // Pago
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE'>('CASH');

  // Cupón
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; description?: string } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');

  // Propina
  const [tip, setTip] = useState(0);
  const [tipPct, setTipPct] = useState<number | null>(0);

  // Lealtad
  const [loyaltyCode, setLoyaltyCode] = useState('');
  const [loyalty, setLoyalty] = useState<{ name: string; points: number; qrCode: string } | null>(null);
  const [loyaltyMsg, setLoyaltyMsg] = useState('');

  // Recompensas canjeables por puntos (lealtad Fase 3). Se cargan al
  // identificarse el cliente; el canje real lo valida y consume el backend.
  type StoreReward = {
    id: string; name: string; description?: string | null; pointsCost: number;
    discountAmount: number | null; menuItem: { id: string; name: string } | null;
  };
  const [rewards, setRewards] = useState<StoreReward[]>([]);
  const [rewardId, setRewardId] = useState<string | null>(null);
  useEffect(() => {
    if (!loyalty) { setRewards([]); setRewardId(null); return; }
    let cancelled = false;
    fetch(`${API}/api/store/rewards?r=${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (!cancelled && Array.isArray(data)) setRewards(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loyalty, slug]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<any>(null);
  const [liveStatus, setLiveStatus] = useState<string>('PENDING');

  // Registro rápido: recordamos los datos del cliente en el dispositivo para
  // que no tenga que volver a escribirlos. Sin cuenta ni contraseña.
  const PROFILE_KEY = `mrtpv:customer:${slug}`;
  const [saveInfo, setSaveInfo] = useState(true);
  const [savedName, setSavedName] = useState('');

  // Al abrir el checkout, rellenamos con el perfil guardado (si existe).
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      setSavedName(p.name || '');
      setCustomerName(prev => prev || p.name || '');
      setCustomerPhone(prev => prev || p.phone || '');
      setDeliveryAddress(prev => prev || p.address || '');
      if (p.coords?.lat && p.coords?.lng) setCoords(prev => prev || p.coords);
    } catch {}
  }, [open, PROFILE_KEY]);

  const persistProfile = () => {
    try {
      if (saveInfo) {
        localStorage.setItem(PROFILE_KEY, JSON.stringify({
          name: customerName.trim(), phone: customerPhone.trim(),
          address: deliveryAddress.trim(), coords,
        }));
      } else {
        localStorage.removeItem(PROFILE_KEY);
      }
    } catch {}
  };

  const forgetProfile = () => {
    try { localStorage.removeItem(PROFILE_KEY); } catch {}
    setSavedName(''); setSaveInfo(false);
    setCustomerName(''); setCustomerPhone(''); setDeliveryAddress('');
  };

  // Tipos de pedido permitidos por la sucursal
  const allowed: OrderType[] = useMemo(() => {
    const l = selectedLocation;
    const a: OrderType[] = [];
    if (!l || l.hasDelivery !== false) a.push('DELIVERY');
    if (!l || l.hasTakeaway !== false) a.push('TAKEOUT');
    if (!l || l.hasTableMap !== false) a.push('DINE_IN');
    return a.length ? a : ['DELIVERY'];
  }, [selectedLocation]);

  // Con mesa fija (QR) el tipo no se corrige: el pedido es DINE_IN sí o sí.
  useEffect(() => { if (!lockedTable && !allowed.includes(orderType)) setOrderType(allowed[0]); }, [allowed]); // eslint-disable-line

  const isDelivery = orderType === 'DELIVERY';
  const preview = useMemo(() => computeDeliveryPreview(delivery, total, coords), [delivery, total, coords]);
  const needsLocationForFee = isDelivery && delivery?.mode === 'DISTANCE' && !!delivery?.origin && !coords;
  const deliveryFee = isDelivery ? (preview.outOfRange ? 0 : preview.fee) : 0;
  const discount = coupon?.discount || 0;
  const grandTotal = Math.max(0, total - discount + deliveryFee + tip);
  const belowMin = minOrderAmount > 0 && total < minOrderAmount;

  // Recalcular propina por porcentaje cuando cambia el subtotal
  useEffect(() => {
    if (tipPct != null) setTip(Math.round(total * (tipPct / 100)));
  }, [total, tipPct]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus('error'); return; }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus('ok'); },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponMsg('');
    try {
      const res = await fetch(`${API}/api/store/coupon/validate?r=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, orderAmount: total }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid) {
        setCoupon({ code, discount: data.discount, description: data.coupon?.description });
        setCouponMsg('');
      } else { setCoupon(null); setCouponMsg(data?.error || 'Cupón no válido'); }
    } catch { setCouponMsg('No se pudo validar el cupón'); }
  };

  const lookupLoyalty = async () => {
    const qr = loyaltyCode.trim();
    if (!qr) return;
    setLoyaltyMsg('');
    try {
      const res = await fetch(`${API}/api/store/loyalty/lookup?r=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode: qr }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.userId) {
        setLoyalty({ name: data.userName, points: data.points, qrCode: qr });
        if (!customerName) setCustomerName(data.userName || '');
        if (!customerPhone && data.userPhone) setCustomerPhone(data.userPhone);
      } else { setLoyalty(null); setLoyaltyMsg(data?.error || 'Cliente no encontrado'); }
    } catch { setLoyaltyMsg('No se pudo identificar'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!customerName.trim()) { setError('Tu nombre es requerido.'); return; }
    if (customerEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail.trim())) {
      setError('El correo no tiene un formato válido.'); return;
    }
    if (isDelivery && !deliveryAddress.trim()) { setError('La dirección de entrega es requerida.'); return; }
    if (orderType === 'DINE_IN' && !tableNumber.trim()) { setError('Indica el número de mesa.'); return; }
    if (belowMin) { setError(`El pedido mínimo es de ${fmt(minOrderAmount)}.`); return; }
    if (isDelivery && preview.outOfRange) { setError('Tu ubicación está fuera del área de cobertura.'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/store/orders?r=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName, customerPhone,
          customerEmail: customerEmail.trim() || undefined,
          orderType,
          deliveryAddress: isDelivery ? deliveryAddress : undefined,
          deliveryLat: isDelivery ? (coords?.lat ?? null) : null,
          deliveryLng: isDelivery ? (coords?.lng ?? null) : null,
          tableNumber: orderType === 'DINE_IN' ? Number(tableNumber) : undefined,
          locationId: locationId || selectedLocation?.id,
          paymentMethod: paymentMethod === 'ONLINE' ? 'CARD' : paymentMethod,
          tip,
          couponCode: coupon?.code || undefined,
          loyaltyQrCode: loyalty?.qrCode || undefined,
          redeemRewardId: (loyalty && rewardId) || undefined,
          items: lines.map(l => ({
            menuItemId: l.menuItemId,
            variantId: l.variantId || undefined,
            modifierIds: l.modifierIds || [],
            comboSelections: l.comboSelections || undefined,
            notes: l.note || undefined,
            quantity: l.quantity,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'No se pudo enviar el pedido.'); setIsSubmitting(false); return; }

      // Pedido aceptado: guardamos (o borramos) los datos del cliente.
      persistProfile();

      // Pago en línea: crear checkout en la pasarela y redirigir.
      if (paymentMethod === 'ONLINE') {
        try {
          const payRes = await fetch(`${API}/api/store/payment/create?r=${encodeURIComponent(slug)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.id, returnUrl: typeof window !== 'undefined' ? window.location.origin + '/' : undefined }),
          });
          const pay = await payRes.json().catch(() => ({}));
          if (payRes.ok && pay.checkoutUrl) { clear(); window.location.href = pay.checkoutUrl; return; }
          // Si falla la pasarela, el pedido ya existe: lo mostramos como pendiente de pago.
          setError(pay?.error || 'No se pudo iniciar el pago en línea. Tu pedido quedó registrado, paga en la tienda.');
          setSuccess(data); setLiveStatus(data.status || 'PENDING'); clear();
        } catch {
          setError('No se pudo abrir la pasarela. Tu pedido quedó registrado.');
          setSuccess(data); setLiveStatus(data.status || 'PENDING'); clear();
        }
        return;
      }

      setSuccess(data); setLiveStatus(data.status || 'PENDING'); clear();
    } catch {
      setError('Error de red al enviar el pedido.');
    } finally { setIsSubmitting(false); }
  };

  // Seguimiento en vivo del estado del pedido
  useEffect(() => {
    if (!success?.orderNumber) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/store/orders/by-number/${encodeURIComponent(success.orderNumber)}?r=${encodeURIComponent(slug)}`);
        if (res.ok) { const d = await res.json(); if (!stop && d.status) setLiveStatus(d.status); }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 6000);
    return () => { stop = true; clearInterval(id); };
  }, [success, slug]);

  if (!open) return null;

  // ── Pantalla de éxito + seguimiento ──────────────────────────────────────
  if (success) {
    const st = STATUS_LABEL[liveStatus] || STATUS_LABEL.PENDING;
    const isWa = whatsappOrder?.enabled && !!whatsappOrder?.number;
    const waUrl = isWa ? `https://wa.me/${whatsappOrder.number}?text=${generateWhatsAppOrderMessage(success, '')}` : '';

    return (
      <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-[32px] shadow-2xl max-w-sm w-full text-center">
          <div className="text-6xl mb-3">🎉</div>
          <h2 className="text-2xl font-black mb-1">¡Pedido enviado!</h2>
          <p className="text-gray-500 mb-5 font-bold">Orden #{success.orderNumber}</p>
          <div className="rounded-2xl p-4 mb-5" style={{ background: `${st.c}14` }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Estado</p>
            <p className="text-lg font-black flex items-center justify-center gap-2" style={{ color: st.c }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: st.c }} />{st.t}
            </p>
          </div>
          <p className="text-xs text-gray-400 mb-5">El estado se actualiza automáticamente.</p>

          {isWa && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="block w-full py-4 text-white rounded-2xl font-black uppercase tracking-widest mb-3 bg-[#25D366] shadow-lg hover:brightness-105 active:scale-95 transition-all flex justify-center items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.711.927 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.391.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.964 1.003-3.582c-.605-1.054-.925-2.269-.926-3.504.001-3.882 3.161-7.042 7.046-7.044 3.881 0 7.041 3.162 7.043 7.046.002 3.884-3.159 7.044-7.043 7.044z"/></svg>
              Enviar por WhatsApp
            </a>
          )}

          <button onClick={() => { setSuccess(null); onClose(); }}
            className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest ${isWa ? 'bg-gray-100 text-gray-600' : 'text-white'}`} style={!isWa ? { background: primary } : {}}>
            {isWa ? 'Cerrar' : 'Listo'}
          </button>
        </div>
      </div>
    );
  }

  const field = 'w-full p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2 text-sm';
  const sectionTitle = 'text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2';

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] max-h-[94vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-3 flex items-center justify-between border-b border-gray-50">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Finalizar Compra</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-800" aria-label="Cerrar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="py-12 text-center text-gray-400 font-bold">Tu carrito está vacío</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Resumen de productos */}
            <div>
              <p className={sectionTitle}>Tu pedido</p>
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-800 leading-tight">{l.name}</p>
                      <p className="text-xs font-bold" style={{ color: primary }}>{fmt(l.price)} × {l.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-100">
                      <button type="button" onClick={() => remove(l.id)} className="w-7 h-7 font-bold text-lg text-gray-500">−</button>
                      <span className="text-sm font-bold w-5 text-center">{l.quantity}</span>
                      <button type="button" onClick={() => add({ id: l.id, menuItemId: l.menuItemId, name: l.name, price: l.price, variantId: l.variantId, modifierIds: l.modifierIds })} className="w-7 h-7 font-bold text-lg text-white rounded-lg" style={{ background: primary }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tipo de pedido — oculto cuando el pedido viene de un QR de mesa */}
            {lockedTable ? (
              <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: `${primary}14` }}>
                <span className="text-lg">🍽</span>
                <span className="text-sm font-bold" style={{ color: primary }}>Pedido para la Mesa {lockedTable}</span>
              </div>
            ) : (
              <div>
                <p className={sectionTitle}>Tipo de pedido</p>
                <div className="grid grid-cols-3 gap-2">
                  {([['DELIVERY', '🛵 Domicilio'], ['TAKEOUT', '🥡 Para llevar'], ['DINE_IN', '🍽 En mesa']] as [OrderType, string][])
                    .filter(([t]) => allowed.includes(t))
                    .map(([t, label]) => (
                      <button key={t} type="button" onClick={() => setOrderType(t)}
                        className="py-3 rounded-2xl text-xs font-bold border-2 transition-all"
                        style={{ borderColor: orderType === t ? primary : '#e5e7eb', background: orderType === t ? `${primary}14` : 'transparent', color: orderType === t ? primary : '#6b7280' }}>
                        {label}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Sucursal (si hay más de una) — fija cuando el QR trae sucursal */}
            {locations.length > 1 && !lockedLocationId && (
              <div>
                <p className={sectionTitle}>Sucursal</p>
                <select value={locationId} onChange={e => setLocationId(e.target.value)} className={field}>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            {/* Datos del cliente */}
            <div className="space-y-3">
              {savedName && (
                <div className="flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: `${primary}14` }}>
                  <span className="text-sm font-bold" style={{ color: primary }}>👋 Hola de nuevo, {savedName.split(' ')[0]}</span>
                  <button type="button" onClick={forgetProfile} className="text-[11px] font-bold text-gray-500 hover:text-gray-800">No soy yo</button>
                </div>
              )}
              <input required placeholder="Tu nombre" className={field} value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <input placeholder="Tu teléfono" className={field} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              <input type="email" inputMode="email" placeholder="Tu correo (opcional, para tu confirmación)" className={field} value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              {isDelivery && (
                <>
                  <textarea required placeholder="Dirección de entrega" className={`${field} h-20`} value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
                  {delivery?.mode === 'DISTANCE' && (
                    <>
                      <button type="button" onClick={useMyLocation} className="w-full p-4 rounded-2xl font-bold text-sm border-2"
                        style={{ borderColor: coords ? '#10b981' : primary, color: coords ? '#10b981' : primary }}>
                        {geoStatus === 'loading' ? 'Obteniendo ubicación…' : coords ? '✓ Ubicación marcada — ajústala en el mapa' : '📍 Usar mi ubicación para calcular el envío'}
                      </button>
                      <MapLocationPicker
                        value={coords}
                        onChange={setCoords}
                        accent={primary}
                        defaultCenter={delivery?.origin || undefined}
                      />
                    </>
                  )}
                  {geoStatus === 'error' && <p className="text-amber-600 text-xs font-bold">No pudimos obtener tu ubicación. Revisa los permisos.</p>}
                </>
              )}
              {orderType === 'DINE_IN' && (
                <input required placeholder="Número de mesa" type="number" min="1" className={field}
                  value={tableNumber} onChange={e => setTableNumber(e.target.value)}
                  disabled={!!lockedTable} readOnly={!!lockedTable}
                  style={lockedTable ? { opacity: 0.7 } : undefined} />
              )}

              {/* Registro rápido: guardar datos para próximos pedidos */}
              <label className="flex items-center gap-3 px-1 pt-1 cursor-pointer select-none">
                <span
                  onClick={() => setSaveInfo(v => !v)}
                  className="relative w-11 h-6 rounded-full transition-all shrink-0"
                  style={{ background: saveInfo ? primary : '#d1d5db' }}
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: saveInfo ? '22px' : '2px' }} />
                </span>
                <span className="text-xs font-bold text-gray-500">Guardar mis datos para la próxima vez</span>
              </label>
            </div>

            {/* Cliente frecuente (lealtad) */}
            <div>
              <p className={sectionTitle}>Cliente frecuente (opcional)</p>
              {loyalty ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                  <span className="text-sm font-bold text-emerald-700">✓ {loyalty.name} · {loyalty.points} pts</span>
                  <button type="button" onClick={() => { setLoyalty(null); setLoyaltyCode(''); }} className="text-xs font-bold text-emerald-600">Quitar</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input placeholder="Tu código de cliente" className={field} value={loyaltyCode} onChange={e => setLoyaltyCode(e.target.value)} />
                  <button type="button" onClick={lookupLoyalty} className="px-4 rounded-2xl font-bold text-sm text-white shrink-0" style={{ background: primary }}>Identificar</button>
                </div>
              )}
              {loyaltyMsg && <p className="text-amber-600 text-xs font-bold mt-1">{loyaltyMsg}</p>}
            </div>

            {/* Recompensas por puntos (lealtad Fase 3) */}
            {loyalty && rewards.length > 0 && (
              <div>
                <p className={sectionTitle}>Canjea tus puntos</p>
                <div className="space-y-2">
                  {rewards.map(rw => {
                    const afford = loyalty.points >= rw.pointsCost;
                    const selected = rewardId === rw.id;
                    return (
                      <button
                        key={rw.id} type="button" disabled={!afford}
                        onClick={() => setRewardId(selected ? null : rw.id)}
                        className="w-full flex items-center justify-between gap-2 rounded-2xl border-2 p-3 text-left transition-all disabled:opacity-45"
                        style={{ borderColor: selected ? primary : '#e5e7eb', background: selected ? `${primary}14` : 'transparent' }}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold truncate" style={{ color: selected ? primary : '#374151' }}>
                            {rw.menuItem ? `${rw.menuItem.name} gratis` : `−${fmt(rw.discountAmount || 0)} de descuento`}
                          </span>
                          <span className="block text-xs text-gray-500 truncate">
                            {rw.name}{afford ? '' : ' · te faltan puntos'}
                          </span>
                        </span>
                        <span className="text-xs font-bold shrink-0" style={{ color: selected ? primary : '#9ca3af' }}>
                          {rw.pointsCost} pts
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cupón */}
            <div>
              <p className={sectionTitle}>Cupón de descuento</p>
              {coupon ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                  <span className="text-sm font-bold text-emerald-700">✓ {coupon.code} · −{fmt(coupon.discount)}</span>
                  <button type="button" onClick={() => { setCoupon(null); setCouponCode(''); }} className="text-xs font-bold text-emerald-600">Quitar</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input placeholder="Código" className={field} value={couponCode} onChange={e => setCouponCode(e.target.value)} />
                  <button type="button" onClick={applyCoupon} className="px-4 rounded-2xl font-bold text-sm text-white shrink-0" style={{ background: primary }}>Aplicar</button>
                </div>
              )}
              {couponMsg && <p className="text-amber-600 text-xs font-bold mt-1">{couponMsg}</p>}
            </div>

            {/* Propina */}
            <div>
              <p className={sectionTitle}>Propina</p>
              <div className="grid grid-cols-4 gap-2">
                {[0, 10, 15, 20].map(p => (
                  <button key={p} type="button" onClick={() => { setTipPct(p); setTip(Math.round(total * (p / 100))); }}
                    className="py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                    style={{ borderColor: tipPct === p ? primary : '#e5e7eb', background: tipPct === p ? `${primary}14` : 'transparent', color: tipPct === p ? primary : '#6b7280' }}>
                    {p === 0 ? 'Sin' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Método de pago */}
            <div>
              <p className={sectionTitle}>Pago</p>
              <div className="grid grid-cols-3 gap-2">
                {([['CASH', '💵 Efectivo'], ['CARD', '💳 Al recibir'], ['TRANSFER', '🏦 Transfer.']] as ['CASH'|'CARD'|'TRANSFER', string][]).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                    className="py-3 rounded-2xl text-xs font-bold border-2 transition-all"
                    style={{ borderColor: paymentMethod === m ? primary : '#e5e7eb', background: paymentMethod === m ? `${primary}14` : 'transparent', color: paymentMethod === m ? primary : '#6b7280' }}>
                    {label}
                  </button>
                ))}
              </div>
              {onlinePayment && (
                <button type="button" onClick={() => setPaymentMethod('ONLINE')}
                  className="w-full mt-2 py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2"
                  style={{ borderColor: paymentMethod === 'ONLINE' ? primary : '#e5e7eb', background: paymentMethod === 'ONLINE' ? `${primary}14` : 'transparent', color: paymentMethod === 'ONLINE' ? primary : '#374151' }}>
                  💳 Pagar ahora con tarjeta (en línea)
                </button>
              )}
              <p className="text-[10px] text-gray-400 mt-1">
                {paymentMethod === 'ONLINE' ? 'Te llevaremos a la pasarela segura para completar el pago.' : 'El pago se realiza al recibir o en la sucursal.'}
              </p>
            </div>

            {/* Desglose */}
            <div className="pt-4 border-t border-gray-100 space-y-1.5">
              <Row label="Subtotal" value={fmt(total)} />
              {isDelivery && (
                <Row label={`Envío${preview.distanceKm != null ? ` · ${preview.distanceKm} km` : ''}`}
                  value={preview.outOfRange ? 'Fuera de cobertura' : needsLocationForFee ? 'Usa tu ubicación' : deliveryFee === 0 ? 'Gratis' : fmt(deliveryFee)} />
              )}
              {discount > 0 && <Row label="Descuento" value={`−${fmt(discount)}`} green />}
              {tip > 0 && <Row label="Propina" value={fmt(tip)} />}
              <div className="flex items-center justify-between pt-2">
                <span className="font-bold text-gray-400">Total</span>
                <span className="text-3xl font-black" style={{ color: primary }}>{fmt(grandTotal)}</span>
              </div>
            </div>

            {belowMin && <p className="text-amber-600 text-xs font-bold">Pedido mínimo: {fmt(minOrderAmount)}.</p>}
            {error && <p className="text-red-500 text-xs font-bold">{error}</p>}

            <button disabled={isSubmitting || belowMin || (isDelivery && preview.outOfRange)} type="submit"
              className="w-full py-5 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50"
              style={{ background: primary }}>
              {isSubmitting ? 'PROCESANDO...' : `${paymentMethod === 'ONLINE' ? 'PAGAR' : (whatsappOrder?.enabled && !!whatsappOrder?.number ? 'CONFIRMAR Y ENVIAR POR WA' : 'CONFIRMAR')} · ${fmt(grandTotal)}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm font-bold" style={{ color: green ? '#10b981' : '#6b7280' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
