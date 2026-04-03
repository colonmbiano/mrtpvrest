# admin-setup.ps1 — Construye el Panel Admin completo
# Ejecutar desde la carpeta admin/: powershell -ExecutionPolicy Bypass -File admin-setup.ps1

Write-Host "🍔 Construyendo Panel Admin..." -ForegroundColor Cyan

# Crear carpetas necesarias
New-Item -ItemType Directory -Force -Path "app\login"          | Out-Null
New-Item -ItemType Directory -Force -Path "app\admin"          | Out-Null
New-Item -ItemType Directory -Force -Path "app\admin\pedidos"  | Out-Null
New-Item -ItemType Directory -Force -Path "app\admin\menu"     | Out-Null
New-Item -ItemType Directory -Force -Path "app\admin\clientes" | Out-Null
New-Item -ItemType Directory -Force -Path "app\admin\reportes" | Out-Null
New-Item -ItemType Directory -Force -Path "lib"                | Out-Null
New-Item -ItemType Directory -Force -Path "components\admin"   | Out-Null

Write-Host "📁 Carpetas creadas" -ForegroundColor Green

# ── .env.local ────────────────────────────────────────────────────────────
@'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
'@ | Set-Content ".env.local" -Encoding UTF8
Write-Host "✅ .env.local" -ForegroundColor Green

# ── lib/api.ts ────────────────────────────────────────────────────────────
@'
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
'@ | Set-Content "lib\api.ts" -Encoding UTF8
Write-Host "✅ lib/api.ts" -ForegroundColor Green

# ── lib/auth.ts ───────────────────────────────────────────────────────────
@'
export function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

export function isAdmin() {
  const u = getUser();
  return u?.role === "ADMIN";
}
'@ | Set-Content "lib\auth.ts" -Encoding UTF8
Write-Host "✅ lib/auth.ts" -ForegroundColor Green

# ── app/globals.css ───────────────────────────────────────────────────────
@'
@import url("https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap");
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #0a0a0e;
  --surf: #111116;
  --surf2: #18181f;
  --border: #1e1e2a;
  --orange: #ff6b00;
  --orange2: #ff9240;
  --green: #22c55e;
  --text: #f0eef8;
  --muted: #6b6880;
}

* { box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: "DM Sans", sans-serif;
}

.font-syne { font-family: "Syne", sans-serif; }

.status-badge {
  @apply inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold;
}
'@ | Set-Content "app\globals.css" -Encoding UTF8
Write-Host "✅ app/globals.css" -ForegroundColor Green

# ── app/layout.tsx ────────────────────────────────────────────────────────
@'
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel Admin — Restaurante",
  description: "Sistema de gestión de pedidos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
'@ | Set-Content "app\layout.tsx" -Encoding UTF8
Write-Host "✅ app/layout.tsx" -ForegroundColor Green

# ── app/page.tsx (redirect) ───────────────────────────────────────────────
@'
import { redirect } from "next/navigation";
export default function Home() { redirect("/login"); }
'@ | Set-Content "app\page.tsx" -Encoding UTF8
Write-Host "✅ app/page.tsx" -ForegroundColor Green

# ── app/login/page.tsx ────────────────────────────────────────────────────
@'
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      if (data.user.role !== "ADMIN" && data.user.role !== "KITCHEN") {
        setError("Sin acceso al panel admin");
        setLoading(false);
        return;
      }
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/admin");
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:"var(--bg)"}}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🌮</div>
          <h1 className="font-syne text-3xl font-black" style={{color:"var(--text)"}}>
            Panel <span style={{color:"var(--orange)"}}>Admin</span>
          </h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Sistema de gestión de pedidos</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-widest" style={{color:"var(--muted)"}}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@mirestaurante.com"
                required
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}}
                onFocus={e => e.target.style.borderColor="var(--orange)"}
                onBlur={e => e.target.style.borderColor="var(--border)"}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-widest" style={{color:"var(--muted)"}}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}}
                onFocus={e => e.target.style.borderColor="var(--orange)"}
                onBlur={e => e.target.style.borderColor="var(--border)"}
              />
            </div>

            {error && (
              <div className="text-sm px-4 py-3 rounded-xl" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-syne font-black text-sm tracking-wide transition-all active:scale-95"
              style={{background: loading ? "var(--muted)" : "var(--orange)", color:"#000", cursor: loading ? "not-allowed" : "pointer"}}
            >
              {loading ? "Entrando..." : "Entrar al Panel"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{color:"var(--muted)"}}>
          admin@mirestaurante.com · Admin1234!
        </p>
      </div>
    </div>
  );
}
'@ | Set-Content "app\login\page.tsx" -Encoding UTF8
Write-Host "✅ app/login/page.tsx" -ForegroundColor Green

# ── components/admin/Sidebar.tsx ─────────────────────────────────────────
@'
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout, getUser } from "@/lib/auth";

const NAV = [
  { href: "/admin",           icon: "📊", label: "Dashboard"  },
  { href: "/admin/pedidos",   icon: "📋", label: "Pedidos"    },
  { href: "/admin/menu",      icon: "🌮", label: "Menú"       },
  { href: "/admin/clientes",  icon: "👥", label: "Clientes"   },
  { href: "/admin/reportes",  icon: "📈", label: "Reportes"   },
];

export default function Sidebar() {
  const path = usePathname();
  const user = getUser();

  return (
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col border-r z-40"
      style={{background:"var(--surf)",borderColor:"var(--border)"}}>

      {/* Logo */}
      <div className="px-5 py-6 border-b" style={{borderColor:"var(--border)"}}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌮</span>
          <div>
            <div className="font-syne font-black text-sm" style={{color:"var(--text)"}}>Mi Restaurante</div>
            <div className="text-xs" style={{color:"var(--orange)"}}>Panel Admin</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {NAV.map(item => {
          const active = path === item.href;
          return (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? "rgba(255,107,0,0.12)" : "transparent",
                color: active ? "var(--orange)" : "var(--muted)",
                border: active ? "1px solid rgba(255,107,0,0.2)" : "1px solid transparent",
              }}>
              <span>{item.icon}</span>
              <span className="font-syne font-bold">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t" style={{borderColor:"var(--border)"}}>
        <div className="px-4 py-3 rounded-xl" style={{background:"var(--surf2)"}}>
          <div className="text-xs font-bold mb-0.5" style={{color:"var(--text)"}}>{user?.name || "Admin"}</div>
          <div className="text-xs mb-2" style={{color:"var(--muted)"}}>{user?.email}</div>
          <button onClick={logout}
            className="text-xs font-bold px-3 py-1.5 rounded-lg w-full transition-all"
            style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.15)"}}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );
}
'@ | Set-Content "components\admin\Sidebar.tsx" -Encoding UTF8
Write-Host "✅ components/admin/Sidebar.tsx" -ForegroundColor Green

# ── app/admin/layout.tsx ──────────────────────────────────────────────────
@'
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import { getUser } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const user = getUser();
    if (!user) router.push("/login");
  }, [router]);

  return (
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <Sidebar />
      <main className="ml-56 min-h-screen p-8">
        {children}
      </main>
    </div>
  );
}
'@ | Set-Content "app\admin\layout.tsx" -Encoding UTF8
Write-Host "✅ app/admin/layout.tsx" -ForegroundColor Green

# ── app/admin/page.tsx (Dashboard) ────────────────────────────────────────
@'
"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

interface Stats { totalRevenue: number; totalOrders: number; averageTicket: number; }
interface Order { id: string; orderNumber: string; status: string; total: number; createdAt: string; user: { name: string } }

const STATUS_COLORS: Record<string, string> = {
  PENDING:    "#f59e0b",
  CONFIRMED:  "#3b82f6",
  PREPARING:  "#8b5cf6",
  READY:      "#06b6d4",
  ON_THE_WAY: "#f97316",
  DELIVERED:  "#22c55e",
  CANCELLED:  "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  PENDING:"Pendiente", CONFIRMED:"Confirmado", PREPARING:"Preparando",
  READY:"Listo", ON_THE_WAY:"En camino", DELIVERED:"Entregado", CANCELLED:"Cancelado",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/api/reports/sales").then(r => setStats(r.data)),
      api.get("/api/orders?limit=8").then(r => setOrders(r.data.orders || [])),
      api.get("/api/admin/config").then(r => setIsOpen(r.data.isOpen ?? true)),
    ]).finally(() => setLoading(false));
  }, []);

  async function toggleOpen() {
    const { data } = await api.patch("/api/admin/toggle");
    setIsOpen(data.isOpen);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-4xl animate-spin">🌮</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-syne text-3xl font-black" style={{color:"var(--text)"}}>Dashboard</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Resumen del día</p>
        </div>
        <button onClick={toggleOpen}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-syne font-bold text-sm transition-all"
          style={{
            background: isOpen ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: isOpen ? "#22c55e" : "#ef4444",
            border: `1px solid ${isOpen ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          }}>
          <span className="w-2 h-2 rounded-full" style={{background: isOpen ? "#22c55e" : "#ef4444"}}></span>
          {isOpen ? "Restaurante Abierto" : "Restaurante Cerrado"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Ventas Totales",   value: `$${(stats?.totalRevenue || 0).toFixed(0)}`, icon: "💰", color: "#22c55e" },
          { label: "Pedidos Hoy",      value: stats?.totalOrders || 0,                     icon: "📋", color: "#3b82f6" },
          { label: "Ticket Promedio",  value: `$${(stats?.averageTicket || 0).toFixed(0)}`, icon: "🎯", color: "var(--orange)" },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl p-6 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{background:`${stat.color}18`,color:stat.color}}>HOY</span>
            </div>
            <div className="font-syne text-3xl font-black mb-1" style={{color: stat.color}}>{stat.value}</div>
            <div className="text-xs" style={{color:"var(--muted)"}}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div className="rounded-2xl border overflow-hidden" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
          <h2 className="font-syne font-bold">Pedidos Recientes</h2>
          <a href="/admin/pedidos" className="text-xs font-bold" style={{color:"var(--orange)"}}>Ver todos →</a>
        </div>
        <div>
          {orders.length === 0 ? (
            <div className="px-6 py-12 text-center" style={{color:"var(--muted)"}}>
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm">No hay pedidos aún</p>
            </div>
          ) : orders.map((order, i) => (
            <div key={order.id} className="px-6 py-4 flex items-center gap-4 border-b last:border-0" style={{borderColor:"var(--border)"}}>
              <div className="font-syne font-black text-sm" style={{color:"var(--orange)"}}>{order.orderNumber}</div>
              <div className="flex-1">
                <div className="text-sm font-medium">{order.user?.name}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>{new Date(order.createdAt).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{background:`${STATUS_COLORS[order.status]}18`,color:STATUS_COLORS[order.status]}}>
                {STATUS_LABELS[order.status]}
              </span>
              <div className="font-syne font-black text-sm">${order.total.toFixed(0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
'@ | Set-Content "app\admin\page.tsx" -Encoding UTF8
Write-Host "✅ app/admin/page.tsx (Dashboard)" -ForegroundColor Green

# ── app/admin/pedidos/page.tsx ────────────────────────────────────────────
@'
"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import io from "socket.io-client";

const STATUS_FLOW = ["PENDING","CONFIRMED","PREPARING","READY","ON_THE_WAY","DELIVERED"];
const STATUS_COLORS: Record<string,string> = {
  PENDING:"#f59e0b",CONFIRMED:"#3b82f6",PREPARING:"#8b5cf6",
  READY:"#06b6d4",ON_THE_WAY:"#f97316",DELIVERED:"#22c55e",CANCELLED:"#ef4444",
};
const STATUS_LABELS: Record<string,string> = {
  PENDING:"Pendiente",CONFIRMED:"Confirmado",PREPARING:"Preparando",
  READY:"Listo",ON_THE_WAY:"En camino",DELIVERED:"Entregado",CANCELLED:"Cancelado",
};
const NEXT_ACTION: Record<string,string> = {
  PENDING:"Confirmar",CONFIRMED:"A cocina",PREPARING:"Listo",
  READY:"En camino",ON_THE_WAY:"Entregado",
};

export default function PedidosPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const params: any = { limit: 50 };
      if (filter !== "ALL") params.status = filter;
      const { data } = await api.get("/api/orders", { params });
      setOrders(data.orders || []);
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001");
    socket.emit("join:admin");
    socket.on("order:new", (order: any) => {
      setOrders(prev => [order, ...prev]);
      setNewAlert(true);
      setTimeout(() => setNewAlert(false), 4000);
      if (typeof window !== "undefined") {
        try { new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA...").play(); } catch {}
      }
    });
    return () => { socket.disconnect(); };
  }, []);

  async function advanceStatus(orderId: string, currentStatus: string) {
    const idx = STATUS_FLOW.indexOf(currentStatus);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const nextStatus = STATUS_FLOW[idx + 1];
    await api.patch(`/api/orders/${orderId}/status`, { status: nextStatus });
    fetchOrders();
  }

  async function cancelOrder(orderId: string) {
    if (!confirm("¿Cancelar este pedido?")) return;
    await api.patch(`/api/orders/${orderId}/status`, { status: "CANCELLED" });
    fetchOrders();
  }

  const filters = ["ALL","PENDING","CONFIRMED","PREPARING","READY","ON_THE_WAY","DELIVERED","CANCELLED"];

  return (
    <div>
      {/* Alert */}
      {newAlert && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl font-bold text-sm animate-bounce"
          style={{background:"var(--orange)",color:"#000"}}>
          🔔 ¡Nuevo pedido!
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="font-syne text-3xl font-black">Pedidos</h1>
        <button onClick={fetchOrders} className="text-sm px-4 py-2 rounded-xl border font-bold"
          style={{borderColor:"var(--border)",color:"var(--muted)"}}>
          🔄 Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-syne font-bold transition-all"
            style={{
              background: filter === f ? "var(--orange)" : "var(--surf)",
              color: filter === f ? "#000" : "var(--muted)",
              border: `1px solid ${filter === f ? "var(--orange)" : "var(--border)"}`,
            }}>
            {f === "ALL" ? "Todos" : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Orders grid */}
      {loading ? (
        <div className="text-center py-20 text-4xl animate-spin">🌮</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border" style={{borderColor:"var(--border)"}}>
          <div className="text-5xl mb-4">📭</div>
          <p style={{color:"var(--muted)"}}>No hay pedidos con este filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {orders.map(order => (
            <div key={order.id} className="rounded-2xl border overflow-hidden" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
              {/* Header */}
              <div className="px-5 py-4 flex items-center gap-3 border-b" style={{borderColor:"var(--border)"}}>
                <span className="font-syne font-black" style={{color:"var(--orange)"}}>{order.orderNumber}</span>
                <span className="text-sm font-medium">{order.user?.name}</span>
                <span className="text-xs" style={{color:"var(--muted)"}}>{order.user?.phone}</span>
                <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{background:`${STATUS_COLORS[order.status]}18`,color:STATUS_COLORS[order.status]}}>
                  {STATUS_LABELS[order.status]}
                </span>
              </div>

              {/* Items */}
              <div className="px-5 py-3 border-b" style={{borderColor:"var(--border)"}}>
                {order.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm py-1">
                    <span>{item.quantity}x {item.name}</span>
                    <span style={{color:"var(--muted)"}}>${item.subtotal?.toFixed(0)}</span>
                  </div>
                ))}
                {order.notes && <p className="text-xs mt-2 italic" style={{color:"var(--orange)"}}>📝 {order.notes}</p>}
              </div>

              {/* Address + total */}
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
                <div className="text-xs" style={{color:"var(--muted)"}}>
                  {order.address ? `📍 ${order.address.street} ${order.address.extNumber}, ${order.address.neighborhood}` : "🏪 Sin dirección"}
                </div>
                <div className="font-syne font-black text-lg">${order.total?.toFixed(0)}</div>
              </div>

              {/* Actions */}
              {order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
                <div className="px-5 py-3 flex gap-2">
                  <button onClick={() => advanceStatus(order.id, order.status)}
                    className="flex-1 py-2 rounded-xl font-syne font-black text-xs transition-all active:scale-95"
                    style={{background:"var(--orange)",color:"#000"}}>
                    ✅ {NEXT_ACTION[order.status]}
                  </button>
                  <button onClick={() => cancelOrder(order.id)}
                    className="px-4 py-2 rounded-xl font-syne font-black text-xs"
                    style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>
                    ✕ Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
'@ | Set-Content "app\admin\pedidos\page.tsx" -Encoding UTF8
Write-Host "✅ app/admin/pedidos/page.tsx" -ForegroundColor Green

# ── app/admin/menu/page.tsx ───────────────────────────────────────────────
@'
"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function MenuPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ name:"", description:"", price:"", categoryId:"", isPopular:false, isAvailable:true });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const [i, c] = await Promise.all([api.get("/api/menu/items"), api.get("/api/menu/categories")]);
    setItems(i.data);
    setCats(c.data);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function syncLoyverse() {
    setSyncing(true);
    try {
      const { data } = await api.post("/api/menu/sync-loyverse");
      alert(`✅ ${data.message}\nCategorías: ${data.synced.categories}\nPlatillos: ${data.synced.items}`);
      fetchData();
    } catch (e: any) {
      alert("Error: " + (e.response?.data?.error || e.message));
    } finally { setSyncing(false); }
  }

  async function toggleAvailable(item: any) {
    await api.put(`/api/menu/items/${item.id}`, { isAvailable: !item.isAvailable });
    fetchData();
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/menu/items", { ...form, price: parseFloat(form.price) });
      setShowForm(false);
      setForm({ name:"", description:"", price:"", categoryId:"", isPopular:false, isAvailable:true });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-syne text-3xl font-black">Menú</h1>
        <div className="flex gap-3">
          <button onClick={syncLoyverse} disabled={syncing}
            className="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
            style={{borderColor:"var(--border)",color:"var(--muted)"}}>
            {syncing ? "⏳ Sincronizando..." : "🔄 Sync Loyverse"}
          </button>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-xl text-sm font-syne font-black transition-all"
            style={{background:"var(--orange)",color:"#000"}}>
            + Nuevo platillo
          </button>
        </div>
      </div>

      {/* New item form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)"}}>
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h2 className="font-syne font-black text-xl mb-5">Nuevo Platillo</h2>
            <form onSubmit={saveItem} className="flex flex-col gap-4">
              {[
                { label:"Nombre", field:"name", type:"text", placeholder:"Hamburguesa Clásica" },
                { label:"Descripción", field:"description", type:"text", placeholder:"Ingredientes..." },
                { label:"Precio ($)", field:"price", type:"number", placeholder:"89.00" },
              ].map(f => (
                <div key={f.field}>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.field]}
                    onChange={e => setForm(prev => ({...prev, [f.field]: e.target.value}))}
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Categoría</label>
                <select value={form.categoryId} onChange={e => setForm(p => ({...p, categoryId: e.target.value}))} required
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}}>
                  <option value="">Seleccionar...</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isPopular} onChange={e => setForm(p => ({...p,isPopular:e.target.checked}))} />
                <span style={{color:"var(--text)"}}>⭐ Marcar como popular</span>
              </label>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl font-syne font-black text-sm"
                  style={{background:"var(--orange)",color:"#000"}}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Items grid */}
      {loading ? <div className="text-center py-20 text-4xl animate-spin">🌮</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="rounded-2xl border overflow-hidden transition-all"
              style={{background:"var(--surf)",borderColor:"var(--border)",opacity: item.isAvailable ? 1 : 0.5}}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-syne font-bold text-sm">{item.name}</div>
                    <div className="text-xs mt-1" style={{color:"var(--muted)"}}>{item.category?.name}</div>
                  </div>
                  <div className="font-syne font-black text-lg" style={{color:"var(--orange)"}}>${item.price}</div>
                </div>
                {item.description && <p className="text-xs mb-3" style={{color:"var(--muted)"}}>{item.description}</p>}
                {item.isPopular && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:"rgba(255,200,0,0.12)",color:"#ffc800"}}>⭐ Popular</span>}
              </div>
              <div className="px-5 pb-4">
                <button onClick={() => toggleAvailable(item)}
                  className="w-full py-2 rounded-xl text-xs font-syne font-black transition-all"
                  style={{
                    background: item.isAvailable ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    color: item.isAvailable ? "#22c55e" : "#ef4444",
                    border: `1px solid ${item.isAvailable ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                  }}>
                  {item.isAvailable ? "✅ Disponible — clic para desactivar" : "❌ No disponible — clic para activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
'@ | Set-Content "app\admin\menu\page.tsx" -Encoding UTF8
Write-Host "✅ app/admin/menu/page.tsx" -ForegroundColor Green

# ── app/admin/clientes/page.tsx ───────────────────────────────────────────
@'
"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

const TIER_COLORS: Record<string,string> = { GOLD:"#ffc800", SILVER:"#94a3b8", BRONZE:"#b87333" };
const TIER_ICONS: Record<string,string>  = { GOLD:"🥇", SILVER:"🥈", BRONZE:"🥉" };

export default function ClientesPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [couponForm, setCouponForm] = useState({ code:"", description:"", discountType:"PERCENTAGE", discountValue:"", minOrderAmount:"", expiresAt:"" });
  const [showCoupon, setShowCoupon] = useState(false);

  useEffect(() => {
    api.get("/api/loyalty/customers").then(r => setClients(r.data)).finally(() => setLoading(false));
  }, []);

  async function saveCoupon(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/loyalty/coupons", { ...couponForm, discountValue: parseFloat(couponForm.discountValue), minOrderAmount: parseFloat(couponForm.minOrderAmount || "0") });
      alert("✅ Cupón creado exitosamente");
      setShowCoupon(false);
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al crear cupón");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-syne text-3xl font-black">Clientes</h1>
        <button onClick={() => setShowCoupon(true)}
          className="px-4 py-2 rounded-xl text-sm font-syne font-black"
          style={{background:"var(--orange)",color:"#000"}}>
          🎁 Nuevo Cupón
        </button>
      </div>

      {/* Coupon modal */}
      {showCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)"}}>
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h2 className="font-syne font-black text-xl mb-5">Crear Cupón</h2>
            <form onSubmit={saveCoupon} className="flex flex-col gap-4">
              {[
                { label:"Código", field:"code", placeholder:"PROMO20" },
                { label:"Descripción", field:"description", placeholder:"20% en tu próximo pedido" },
                { label:"Valor del descuento", field:"discountValue", placeholder:"20" },
                { label:"Pedido mínimo ($)", field:"minOrderAmount", placeholder:"100" },
                { label:"Fecha de expiración", field:"expiresAt", type:"date" },
              ].map(f => (
                <div key={f.field}>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>{f.label}</label>
                  <input type={f.type || "text"} placeholder={f.placeholder} value={(couponForm as any)[f.field]}
                    onChange={e => setCouponForm(p => ({...p,[f.field]:e.target.value}))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Tipo</label>
                <select value={couponForm.discountType} onChange={e => setCouponForm(p => ({...p,discountType:e.target.value}))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm"
                  style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}}>
                  <option value="PERCENTAGE">Porcentaje (%)</option>
                  <option value="FIXED">Monto fijo ($)</option>
                </select>
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setShowCoupon(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl font-syne font-black text-sm" style={{background:"var(--orange)",color:"#000"}}>Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clients table */}
      {loading ? <div className="text-center py-20 text-4xl animate-spin">🌮</div> : (
        <div className="rounded-2xl border overflow-hidden" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{borderColor:"var(--border)"}}>
                {["Cliente","Teléfono","Nivel","Puntos","Miembro desde"].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-syne font-black uppercase tracking-wider" style={{color:"var(--muted)"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className="border-b last:border-0" style={{borderColor:"var(--border)"}}>
                  <td className="px-5 py-4">
                    <div className="font-medium text-sm">{c.user?.name}</div>
                    <div className="text-xs" style={{color:"var(--muted)"}}>{c.user?.email}</div>
                  </td>
                  <td className="px-5 py-4 text-sm" style={{color:"var(--muted)"}}>{c.user?.phone || "—"}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{background:`${TIER_COLORS[c.tier]}18`,color:TIER_COLORS[c.tier]}}>
                      {TIER_ICONS[c.tier]} {c.tier}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-syne font-black text-sm" style={{color:"var(--orange)"}}>{c.points} pts</td>
                  <td className="px-5 py-4 text-xs" style={{color:"var(--muted)"}}>
                    {new Date(c.user?.createdAt).toLocaleDateString("es-MX")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 && (
            <div className="py-16 text-center" style={{color:"var(--muted)"}}>
              <div className="text-4xl mb-3">👥</div>
              <p className="text-sm">No hay clientes registrados aún</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
'@ | Set-Content "app\admin\clientes\page.tsx" -Encoding UTF8
Write-Host "✅ app/admin/clientes/page.tsx" -ForegroundColor Green

# ── app/admin/reportes/page.tsx ───────────────────────────────────────────
@'
"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function ReportesPage() {
  const [stats, setStats] = useState<any>(null);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [to, setTo]   = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  async function fetchReports() {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        api.get(`/api/reports/sales?from=${from}&to=${to}`),
        api.get("/api/reports/top-items"),
      ]);
      setStats(s.data);
      setTopItems(t.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchReports(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-syne text-3xl font-black">Reportes</h1>
        <div className="flex items-center gap-3">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
          <span style={{color:"var(--muted)"}}>a</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
          <button onClick={fetchReports} className="px-4 py-2 rounded-xl text-sm font-syne font-black"
            style={{background:"var(--orange)",color:"#000"}}>Filtrar</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label:"Ingresos Totales", value:`$${(stats?.totalRevenue||0).toFixed(2)}`, icon:"💰", color:"#22c55e" },
          { label:"Total Pedidos",    value: stats?.totalOrders||0,                    icon:"📋", color:"#3b82f6" },
          { label:"Ticket Promedio",  value:`$${(stats?.averageTicket||0).toFixed(2)}`,icon:"🎯", color:"var(--orange)" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-6 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="text-3xl mb-3">{s.icon}</div>
            <div className="font-syne text-3xl font-black mb-1" style={{color:s.color}}>{loading ? "..." : s.value}</div>
            <div className="text-xs" style={{color:"var(--muted)"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top items */}
      <div className="rounded-2xl border overflow-hidden" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <div className="px-6 py-4 border-b" style={{borderColor:"var(--border)"}}>
          <h2 className="font-syne font-bold">🏆 Platillos más vendidos</h2>
        </div>
        <div>
          {topItems.map((item, i) => (
            <div key={item.name} className="px-6 py-4 flex items-center gap-4 border-b last:border-0" style={{borderColor:"var(--border)"}}>
              <span className="font-syne font-black text-xl w-8" style={{color: i===0?"#ffc800":i===1?"#94a3b8":"#b87333"}}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`}
              </span>
              <div className="flex-1 font-medium text-sm">{item.name}</div>
              <div className="text-sm font-syne font-black" style={{color:"var(--orange)"}}>
                {item._sum?.quantity} unidades
              </div>
              <div className="text-sm" style={{color:"var(--muted)"}}>
                ${(item._sum?.subtotal||0).toFixed(0)}
              </div>
            </div>
          ))}
          {topItems.length === 0 && !loading && (
            <div className="py-12 text-center" style={{color:"var(--muted)"}}>
              <div className="text-3xl mb-2">📊</div>
              <p className="text-sm">No hay datos de ventas aún</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
'@ | Set-Content "app\admin\reportes\page.tsx" -Encoding UTF8
Write-Host "✅ app/admin/reportes/page.tsx" -ForegroundColor Green

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Panel Admin construido exitosamente!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Abre http://localhost:3000 en tu navegador" -ForegroundColor Yellow
Write-Host "Login: admin@mirestaurante.com / Admin1234!" -ForegroundColor Yellow
