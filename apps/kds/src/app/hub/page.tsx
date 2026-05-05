'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UtensilsCrossed, LifeBuoy, ChevronDown, Sparkles, MapPin,
  ShoppingBag, Clock, TrendingUp, ArrowRight, Plus, LogOut,
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

export default function HubPage() {
  const router = useRouter();
  const employee = useAuthStore((s) => s.employee);
  const logout = useAuthStore((s) => s.logout);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/workspaces/me');
        if (cancelled) return;
        const list: Workspace[] = data.workspaces || [];
        setWorkspaces(list);

        // Auto-skip si solo hay un espacio
        if (list.length === 1) {
          selectWorkspace(list[0]);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.response?.data?.error || 'No pudimos cargar tus espacios');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectWorkspace = (w: Workspace) => {
    localStorage.setItem('activeWorkspaceId', w.id);
    localStorage.setItem('activeRestaurantId', w.restaurantId);
    localStorage.setItem('activeLocationId', w.id);
    localStorage.setItem('activeWorkspaceName', `${w.restaurantName} · ${w.name}`);
    router.replace('/pos/order-type');
  };

  const handleLogout = () => {
    logout();
    router.replace('/locked');
  };

  const firstName = employee?.name?.split(' ')[0] || 'usuario';
  const userInitial = firstName.charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: '#0C0C0E' }}>
      {/* Background glows */}
      <div aria-hidden className="pointer-events-none absolute -top-48 -left-48 w-[800px] h-[800px] rounded-full opacity-60"
        style={{ background: 'radial-gradient(circle, rgba(255,132,0,0.18) 0%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute top-[400px] -right-32 w-[900px] h-[900px] rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(136,214,108,0.12) 0%, transparent 70%)' }} />

      {/* Top nav */}
      <header className="relative flex items-center justify-between px-6 lg:px-10 py-7">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: '#FF8400' }}>
            <UtensilsCrossed size={18} className="text-black" />
          </div>
          <span className="text-white text-sm font-bold tracking-wider">MR TPV REST</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs text-white/80 hover:text-white transition"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <LifeBuoy size={14} /> Ayuda
          </button>
          <div className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-black"
              style={{ background: '#FF8400' }}>{userInitial}</div>
            <span className="text-xs text-white">{employee?.name || 'Empleado'}</span>
            <ChevronDown size={12} className="text-white/60" />
          </div>
        </div>
      </header>

      {/* Hero block */}
      <main className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="flex flex-col items-center gap-4 mb-12 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Sparkles size={12} style={{ color: '#FF8400' }} />
            <span className="text-[11px] font-bold tracking-[0.15em] text-white">WORKSPACE</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            Hola, {firstName}. <br className="md:hidden" />
            <span className="text-white/80">¿A dónde vamos hoy?</span>
          </h1>
          <p className="text-base text-white/60">
            Selecciona uno de tus espacios de trabajo para continuar.
          </p>
        </div>

        {/* Cards grid */}
        {workspaces === null && !error && (
          <div className="text-white/40 text-sm">Cargando espacios…</div>
        )}

        {error && (
          <div className="text-center max-w-md p-6 rounded-2xl" style={{ background: '#FF5C3315', border: '1px solid #FF5C3340' }}>
            <p className="text-sm" style={{ color: '#FF5C33' }}>{error}</p>
          </div>
        )}

        {workspaces && workspaces.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-6 max-w-6xl">
            {workspaces.map((w, i) => {
              const accent = w.accentColor || (i === 0 ? '#FF8400' : i === 1 ? '#0EA5E9' : '#06B6D4');
              const isHovered = hoveredId === w.id;
              return (
                <button
                  key={w.id}
                  onMouseEnter={() => setHoveredId(w.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => selectWorkspace(w)}
                  className="text-left group relative flex flex-col gap-4 p-6 rounded-3xl transition-all hover:scale-[1.02] active:scale-[0.99]"
                  style={{
                    background: '#1A1A1A',
                    width: 340,
                    minHeight: 380,
                    border: `${isHovered ? 2 : 1}px solid ${isHovered ? accent : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: isHovered
                      ? `0 24px 48px rgba(0,0,0,0.5), 0 0 48px ${accent}40`
                      : '0 12px 24px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Icon box */}
                  <div className="w-[72px] h-[72px] rounded-[18px] flex items-center justify-center"
                    style={{ background: accent }}>
                    {w.businessType === 'RESTAURANT' ? (
                      <UtensilsCrossed size={36} className="text-white" />
                    ) : (
                      <ShoppingBag size={36} className="text-white" />
                    )}
                  </div>

                  {/* Title block */}
                  <div className="flex flex-col gap-2 w-full">
                    <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: '#666666' }}>
                      {TYPE_LABEL[w.businessType] || w.businessType}
                    </span>
                    <h3 className="text-2xl font-bold text-white leading-tight">{w.restaurantName}</h3>
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: '#B8B9B6' }}>
                      <MapPin size={12} />
                      <span className="truncate">{w.name}{w.address ? ` · ${w.address}` : ''}</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-2.5 w-full">
                    <Stat icon={<TrendingUp size={11} style={{ color: '#88D66C' }} />} label="VENTAS HOY" value={fmtMoney(w.salesToday)} />
                    <Stat icon={<ShoppingBag size={11} style={{ color: '#FF8400' }} />} label="ÓRDENES" value={String(w.openOrders)} />
                    <Stat icon={<Clock size={11} style={{ color: '#FFB84D' }} />} label="ESTADO" value={w.isOpen ? 'Abierto' : 'Cerrado'} />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between w-full mt-auto">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                      style={{ background: '#88D66C26', border: '1px solid #88D66C60' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#88D66C' }} />
                      <span className="text-[10px] font-bold" style={{ color: '#88D66C' }}>EN LÍNEA</span>
                    </div>
                    {isHovered ? (
                      <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-black"
                        style={{ background: accent }}>
                        Entrar <ArrowRight size={13} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <ArrowRight size={14} className="text-white" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {workspaces && workspaces.length === 0 && (
          <div className="text-center max-w-md">
            <p className="text-white/60 mb-4">No tienes espacios de trabajo asignados.</p>
            <button onClick={handleLogout}
              className="px-4 py-2 rounded-full text-xs text-white"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              Cerrar sesión
            </button>
          </div>
        )}

        {/* Add new workspace */}
        {workspaces && workspaces.length > 0 && (
          <button className="mt-12 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs text-white hover:bg-white/10 transition"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Plus size={14} /> Crear nuevo espacio de trabajo
          </button>
        )}
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 left-0 w-full flex items-center justify-center gap-3.5 text-[11px]" style={{ color: '#666666' }}>
        <button onClick={handleLogout} className="inline-flex items-center gap-1.5 hover:text-white/80 transition">
          <LogOut size={11} /> Cerrar sesión
        </button>
        <span className="w-[3px] h-[3px] rounded-full" style={{ background: '#666666' }} />
        <span>Términos · Privacidad · v2.4.0</span>
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[10px] px-2.5 py-2 flex flex-col gap-0.5"
      style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[9px] font-bold tracking-wider" style={{ color: '#666666' }}>{label}</span>
      </div>
      <span className="text-xs font-bold text-white truncate">{value}</span>
    </div>
  );
}
