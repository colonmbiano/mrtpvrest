'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import {
  UtensilsCrossed, ChevronDown, MapPin,
  ShoppingBag, Clock, TrendingUp, ArrowRight, LogOut,
  Loader2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface Workspace {
  id: string;
  restaurantId: string;
  restaurantName: string;
  businessType: string;
  accentColor: string | null;
  logoUrl: string | null;
  name: string;
  address: string | null;
  openOrders: number;
  salesToday: number;
  isOpen: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  RESTAURANT: 'RESTAURANTE',
  RETAIL: 'RETAIL',
  GROCERY: 'TIENDA',
  RECREATION: 'RECREACIÓN',
  };

const fmtMoney = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });

// Loader compartido: se usa tanto como fallback de Suspense (prerender)
// como en el estado pre-mounted del cliente.
function HubLoader() {
  return (
    <div className="min-h-screen w-full bg-[#0a0a0c] flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
        Iniciando sesión segura…
      </span>
    </div>
  );
}

// Wrapper que envuelve en Suspense — requerido por Next 14 cuando se usa
// useSearchParams() en una página estática (output: 'export').
export default function HubPage() {
  return (
    <Suspense fallback={<HubLoader />}>
      <HubPageInner />
    </Suspense>
  );
}

function HubPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const force = searchParams.get('force') === 'true';

  // mounted se queda en false mientras decidimos si el selector debe pintarse.
  const [mounted, setMounted] = useState(false);
  const employee = useAuthStore((s) => s.employee);
  const logout = useAuthStore((s) => s.logout);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const selectWorkspace = async (w: Workspace) => {
    // Sincronización UNIFICADA de llaves (TPV + API)
    localStorage.setItem('activeWorkspaceId', w.id);
    localStorage.setItem('activeRestaurantId', w.restaurantId);
    localStorage.setItem('activeLocationId', w.id);
    localStorage.setItem('activeWorkspaceName', `${w.restaurantName} · ${w.name}`);

    // Llaves primarias que espera el interceptor de api.ts
    localStorage.setItem('restaurantId', w.restaurantId);
    localStorage.setItem('locationId', w.id);
    localStorage.setItem('locationName', w.name);

    try {
      const { data } = await api.get('/api/shifts/active');
      const isShiftOpen = Boolean(data?.isOpen ?? data?.id);

      if (isShiftOpen) {
        router.replace('/pos/order-type');
      } else {
        router.replace('/pos/shift/open');
      }
    } catch (err) {
      console.error('Error verificando turno:', err);
      router.replace('/pos/shift/open');
    }
  };

  useEffect(() => {
    let cancelled = false;
    // Cuerpo diferido a microtask (ver impresoras): el setMounted(true)
    // síncrono ya no corre dentro del effect (set-state-in-effect).
    // Comportamiento idéntico — el microtask corre antes del paint.
    queueMicrotask(() => {
      if (cancelled) return;

      // Atajo silencioso: si ya hay workspace activo en localStorage Y no
      // estamos forzando, brincar directo a /pos/order-type (o shift/open).
      const persistedId = typeof window !== 'undefined'
        ? localStorage.getItem('activeWorkspaceId')
        : null;

      if (persistedId && !force) {
        (async () => {
          try {
            const { data } = await api.get('/api/shifts/active');
            if (cancelled) return;
            const isShiftOpen = Boolean(data?.isOpen ?? data?.id);
            router.replace(isShiftOpen ? '/pos/order-type' : '/pos/shift/open');
          } catch {
            if (!cancelled) router.replace('/pos/shift/open');
          }
        })();
        return;
      }

      // Sin workspace persistido o 'force' activo — flujo de selección:
      setMounted(true);
      (async () => {
        try {
          const { data } = await api.get('/api/workspaces/me');
          if (cancelled) return;
          const list: Workspace[] = data.workspaces || [];
          setWorkspaces(list);

          if (list.length === 0) return;
          // Si solo hay uno y no estamos forzando, auto-seleccionar.
          if (list.length === 1 && !force) {
            const onlyWorkspace = list[0];
            if (onlyWorkspace) selectWorkspace(onlyWorkspace);
          }
        } catch (err: any) {
          if (!cancelled) setError(err?.response?.data?.error || 'No pudimos cargar tus espacios');
        }
      })();
    });
    return () => { cancelled = true; };
  }, [force]);

  const handleLogout = () => {
    logout();
    router.replace('/locked');
  };

  const firstName = employee?.name?.split(' ')[0] || 'usuario';
  const userInitial = firstName.charAt(0).toUpperCase();

  if (!mounted) {
    return <HubLoader />;
  }

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0c]"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient diseño operativo glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -left-60 w-[700px] h-[700px] rounded-full blur-[120px] opacity-60"
        style={{ background: 'radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[400px] -right-40 w-[800px] h-[800px] rounded-full blur-[120px] opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(136,214,108,0.10) 0%, transparent 70%)' }}
      />

      {/* Top nav */}
      <header className="relative z-10 flex items-center justify-between px-6 lg:px-10 py-7">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#ffb84d] shadow-lg shadow-amber-500/20">
            <UtensilsCrossed size={20} className="text-[#0a0a0c]" strokeWidth={2.5} />
          </div>
          <span className="text-white text-sm font-bold tracking-[0.18em]">MR TPV REST</span>
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md active:scale-95 transition-transform"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-[#0a0a0c] bg-[#ffb84d]">
              {userInitial}
            </div>
            <span className="text-xs font-semibold text-white">{employee?.name || 'Empleado'}</span>
            <ChevronDown
              size={12}
              className={`text-white/60 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#0a0a0c]/95 backdrop-blur-xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] p-1.5 z-50"
            >
              <div className="px-3 py-2 border-b border-white/5 mb-1">
                <p className="text-[11px] font-bold text-white truncate">{employee?.name || 'Empleado'}</p>
                <p className="text-[10px] font-medium text-white/40 truncate">{employee?.role || ''}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-bold text-white/80 hover:bg-white/5 active:scale-95 transition-all text-left"
              >
                <LogOut size={14} className="text-white/55" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero + tarjeta premium */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-6 pb-24">
        {/* Bloque tarjeta principal — glassmorphism diseño operativo */}
        <div
          className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 md:p-12 shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
        >
          {/* Header del card */}
          <div className="flex flex-col items-center gap-4 mb-10 text-center">
            <div className="inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-[#ffb84d] bg-[#ffb84d]/10 border border-[#ffb84d]/20">
              Workspace
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
              Hola, {firstName}.
            </h1>
            <p className="text-base font-medium text-white/60 max-w-xl">
              Selecciona el espacio de trabajo donde vas a operar hoy.
            </p>
          </div>

          {/* Estados */}
          {workspaces === null && !error && (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="w-10 h-10 border-4 border-amber-500/20 border-t-[#ffb84d] rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
                Cargando espacios…
              </span>
            </div>
          )}

          {error && (
            <div
              className="text-center max-w-md mx-auto p-5 rounded-2xl"
              style={{ background: 'rgba(255,92,51,0.08)', border: '1px solid rgba(255,92,51,0.25)' }}
            >
              <p className="text-sm font-semibold" style={{ color: '#FF5C33' }}>{error}</p>
            </div>
          )}

          {/* Workspaces grid */}
          {workspaces && workspaces.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {workspaces.map((w, i) => {
                const accent = w.accentColor || (i === 0 ? '#ffb84d' : i === 1 ? '#10b981' : '#3b82f6');
                return (
                  <button
                    key={w.id}
                    onClick={() => selectWorkspace(w)}
                    className="group relative flex flex-col gap-4 p-6 min-h-[64px] py-6 rounded-2xl text-left bg-white/5 border border-white/10 active:scale-95 transition-transform duration-150 overflow-hidden"
                  >
                    {/* Icono grande */}
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl"
                      style={{ background: accent }}
                    >
                      {w.businessType === 'RESTAURANT' ? (
                        <UtensilsCrossed size={32} className="text-[#0a0a0c]" strokeWidth={2.5} />
                      ) : (
                        <ShoppingBag size={32} className="text-[#0a0a0c]" strokeWidth={2.5} />
                      )}
                    </div>

                    {/* Título */}
                    <div className="flex flex-col gap-1.5 w-full">
                      <span className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">
                        {TYPE_LABEL[w.businessType] || w.businessType}
                      </span>
                      <h3 className="text-xl font-black text-white tracking-tight leading-tight">
                        {w.restaurantName}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white/60">
                        <MapPin size={12} />
                        <span className="truncate">
                          {w.name}{w.address ? ` · ${w.address}` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-2 w-full mt-1">
                      <Stat
                        icon={<TrendingUp size={11} className="text-emerald-400" />}
                        label="VENTAS"
                        value={fmtMoney(w.salesToday)}
                      />
                      <Stat
                        icon={<ShoppingBag size={11} className="text-[#ffb84d]" />}
                        label="ÓRDENES"
                        value={String(w.openOrders)}
                      />
                      <Stat
                        icon={<Clock size={11} className="text-amber-300" />}
                        label="ESTADO"
                        value={w.isOpen ? 'Abierto' : 'Cerrado'}
                      />
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between w-full mt-auto pt-2">
                      <div
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(136,214,108,0.12)', border: '1px solid rgba(136,214,108,0.35)' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-black tracking-widest text-emerald-300">EN LÍNEA</span>
                      </div>
                      <div
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black text-[#0a0a0c] bg-[#ffb84d] shadow-lg shadow-amber-500/20"
                      >
                        Seleccionar
                        <ArrowRight size={13} strokeWidth={3} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Vacío */}
          {workspaces && workspaces.length === 0 && (
            <div className="text-center max-w-md mx-auto py-8">
              <p className="text-white/60 mb-5 font-medium">
                No tienes espacios de trabajo asignados.
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="px-5 py-2.5 min-h-[48px] rounded-full text-xs font-bold text-white bg-white/5 border border-white/10 active:scale-95 transition-transform"
              >
                Cerrar sesión
              </button>
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 left-0 w-full flex items-center justify-center gap-3.5 text-[11px] font-medium text-white/40">
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <LogOut size={12} /> Cerrar sesión
        </button>
        <span className="w-1 h-1 rounded-full bg-white/30" />
        <span>Términos · Privacidad · v2.4.0</span>
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex-1 rounded-xl px-3 py-2 flex flex-col gap-0.5 bg-white/5 border border-white/5"
    >
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[9px] font-black tracking-widest text-white/40">{label}</span>
      </div>
      <span className="text-xs font-bold text-white truncate">{value}</span>
    </div>
  );
}
