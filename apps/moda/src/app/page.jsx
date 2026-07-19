"use client";
import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react";
import * as Retail from "@/lib/retail";
import * as Outbox from "@/lib/outbox";
import { getApiUrl, setApiUrl } from "@/lib/config";
import { getTenant, setTenant, getGiro } from "@/lib/tenant";
import { DEFAULT_GIRO, giroConfig, sizesFor, attrLabel, isBulkUnit, canEnterByPackage, packagesToBase, baseToPackages, round3 } from "@/lib/giro";
import { getToken } from "@/lib/token-vault";
import { buildReceipt, buildLabel, printEscpos, getPrinterConfig, setPrinterIp } from "@/lib/printer";
import { APP_VERSION } from "@/lib/version";

/* ---------------- icons (lucide paths) ---------------- */
function Icon({ n, s = 18, c = "currentColor", sw = 1.9, cls = "" }) {
  const P = {
    cart:["M8 21a1 1 0 100-2 1 1 0 000 2zM19 21a1 1 0 100-2 1 1 0 000 2z","M2.5 3h2l2.6 13.4A2 2 0 009 18h8.6a2 2 0 002-1.6L21.5 8H6"],
    tag:["M7.5 7.5h.01","M3 11V4a1 1 0 011-1h7l9 9-8 8-9-9z"],
    users:["M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2","M9 11a4 4 0 100-8 4 4 0 000 8z","M22 21v-2a4 4 0 00-3-3.87","M16 3.13A4 4 0 0116 11"],
    box:["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z","M3.3 7L12 12l8.7-5","M12 22V12"],
    bookmark:["M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"],
    return:["M9 14L4 9l5-5","M4 9h11a5 5 0 015 5v1a5 5 0 01-5 5h-1"],
    wallet:["M19 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-2","M3 7h16a2 2 0 012 2v6a2 2 0 01-2 2H3","M16 12h.01"],
    chart:["M3 3v18h18","M7 16V11","M12 16V8","M17 16v-3"],
    gear:["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.92.99V21a2 2 0 11-4 0v-.09A1.65 1.65 0 006.93 19.4l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 003.4 13.7H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 6.93l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 0010 4.6h.09A1.65 1.65 0 0012 3.09V3a2 2 0 014 0v.09A1.65 1.65 0 0019.07 4.6l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0020.91 10H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"],
    search:["M11 19a8 8 0 100-16 8 8 0 000 16z","M21 21l-4.3-4.3"],
    scan:["M3 7V5a2 2 0 012-2h2","M17 3h2a2 2 0 012 2v2","M21 17v2a2 2 0 01-2 2h-2","M7 21H5a2 2 0 01-2-2v-2","M7 12h10"],
    bell:["M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9","M13.7 21a2 2 0 01-3.4 0"],
    plus:["M12 5v14","M5 12h14"],
    minus:["M5 12h14"],
    trash:["M3 6h18","M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6","M10 11v6","M14 11v6","M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"],
    check:["M20 6L9 17l-5-5"],
    lock:["M5 11h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z","M7 11V7a5 5 0 0110 0v4"],
    shield:["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
    sun:["M12 17a5 5 0 100-10 5 5 0 000 10z","M12 1v2","M12 21v2","M4.2 4.2l1.4 1.4","M18.4 18.4l1.4 1.4","M1 12h2","M21 12h2","M4.2 19.8l1.4-1.4","M18.4 5.6l1.4-1.4"],
    moon:["M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"],
    card:["M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2z","M2 10h20"],
    cash:["M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2z","M12 15a3 3 0 100-6 3 3 0 000 6z"],
    qr:["M3 3h7v7H3z","M14 3h7v7h-7z","M3 14h7v7H3z","M14 14h3v3h-3z","M20 14v7","M14 20h7"],
    swap:["M16 3l4 4-4 4","M20 7H8","M8 21l-4-4 4-4","M4 17h12"],
    printer:["M6 9V2h12v7","M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2","M6 14h12v8H6z"],
    x:["M18 6L6 18","M6 6l12 12"],
    min:["M5 12h14"],
    max:["M4 4h16v16H4z"],
    chev:["M6 9l6 6 6-6"],
    menu:["M3 6h18","M3 12h18","M3 18h18"],
    heart:["M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0012 5 4.5 4.5 0 002 8.5C2 10.7 3.5 12.5 5 14l7 7z"],
    store:["M3 9l1.5-5h15L21 9","M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9","M3 9h18"],
    wifi:["M5 12.5a10 10 0 0114 0","M8.5 16a5 5 0 017 0","M12 20h.01"],
    info:["M12 21a9 9 0 100-18 9 9 0 000 18z","M12 11v5","M12 8h.01"],
    mail:["M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2z","M2 7l10 6 10-6"],
    file:["M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z","M14 3v6h6"],
    menu:["M3 6h18","M3 12h18","M3 18h18"],
    clock:["M12 21a9 9 0 100-18 9 9 0 000 18z","M12 7v5l3 2"],
    alert:["M10.3 3.8L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.8a2 2 0 00-3.4 0z","M12 9v4","M12 17h.01"],
    truck:["M1 3h15v13H1z","M16 8h4l3 3v5h-7","M5.5 19a2 2 0 100-4 2 2 0 000 4zM18.5 19a2 2 0 100-4 2 2 0 000 4z"],
    star:["M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 18l-6.6 3.2L6.7 14l-5-4.8 7-.9z"],
    dollar:["M12 1v22","M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"],
    pencil:["M12 20h9","M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"],
    arrow:["M19 12H5","M12 19l-7-7 7-7"],
    sparkle:["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"],
  }[n] || [];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true">
      {P.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/* ---------------- helpers ---------------- */
const mx = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
// Precio unitario de una línea (lista del cliente + escalón por cantidad) y su
// importe. El POS DEBE cotizar lo mismo que cobra el backend: POST /sales
// rechaza la venta si los pagos no cuadran con el total del servidor, así que
// cualquier divergencia aquí vuelve la venta INCOBRABLE. Por eso la regla vive
// en unitPriceFor (lib/retail.ts), espejo de priceFor del backend, y no se
// reimplementa en la UI.
const linePrice = (l, priceListId) =>
  Retail.unitPriceFor(l.price, l.priceTiers, Number(l.qty) || 0, l.listPrices, priceListId);
const lineTotal = (l, priceListId) => linePrice(l, priceListId) * (Number(l.qty) || 0);
const cartTotal = (cart, priceListId) => cart.reduce((s, l) => s + lineTotal(l, priceListId), 0);
// El eje de tallas/medidas y las etiquetas de atributos salen del giro, no de un
// hardcode de ropa.
//
// Sale del CONTEXTO, no de localStorage: el giro llega con el catálogo, y
// `onLogin` hace setSession() ANTES de await loadCatalog(). Leyéndolo de
// localStorage al montar, la UI se pintaba antes de que el fetch lo escribiera
// ⇒ en el primer login tras vincular, una ferretería mostraba "Talla/Color" y
// solo se acomodaba al recargar. Por contexto, el setState del catálogo lo
// propaga solo. Root lo inicializa con el valor cacheado para no parpadear.
const useGiro = () => useData().giro || DEFAULT_GIRO;
// Copys del onboarding por giro. El label sale de giro.ts (fuente única); aquí
// solo vive el placeholder del nombre de tienda, que es de esta pantalla.
const GIROS_UI = {
  ROPA:          { id:"ROPA",          label:giroConfig("ROPA").label,          storePlaceholder:"Boutique Aurora" },
  FERRETERIA:    { id:"FERRETERIA",    label:giroConfig("FERRETERIA").label,    storePlaceholder:"Ferretería El Tornillo" },
  REFACCIONARIA: { id:"REFACCIONARIA", label:giroConfig("REFACCIONARIA").label, storePlaceholder:"Refaccionaria Del Valle" },
};
const swatch = { Beige:"#d8c4ab", Blanco:"#f1f1ee", "Verde Olivo":"#5a6b3e", Negro:"#23262a", Gris:"#9aa0a3", "Azul Claro":"#9db7d4", Camel:"#b08456", Perla:"#e8e3d8", Canela:"#9a5b33" };

const totalStock = (p) => Object.values(p.matrix).reduce((a,r)=>a+r.reduce((x,y)=>x+y,0),0);



// Roles con acceso total (dueño/encargado). El enforcement REAL de las mutaciones
// sensibles vive en el backend; aquí el gate es de UI sobre el empleado logueado.
const ADMIN_ROLES_UI = ["OWNER","ADMIN","MANAGER","SUPER_ADMIN"];
const ROLE_ES = { OWNER:"Dueño", ADMIN:"Administrador", MANAGER:"Encargado", CASHIER:"Cajero", WAITER:"Mesero", SUPER_ADMIN:"Super Admin" };
const roleEs = (r) => ROLE_ES[(r||"").toUpperCase()] || r || "";
// Llave de permiso de la caja → permiso CANÓNICO del backend (los únicos 6 que
// existen y que acepta el override por PIN). Las llaves sin equivalente directo
// se tratan como admin (proxy manage_users).
const CANON_PERM = {
  apply_discount:"apply_discount", open_cash_drawer:"open_cash_drawer", cancel_items:"cancel_items",
  process_return:"cancel_items", refund_cash:"cancel_items", override_price:"apply_discount",
  cancel_hold:"cancel_items", view_cash_count:"view_expected_cash", manage_users:"manage_users",
  manage_cash_shift:"manage_users", adjust_inventory:"manage_users", manage_transfers:"manage_users",
  manage_catalog:"manage_users", view_reports:"manage_users", manage_settings:"manage_users",
};
const PERM_LABEL = { apply_discount:"Aplicar descuento", override_price:"Cambiar precio de venta", cancel_items:"Anular venta",
  process_return:"Procesar devolución", refund_cash:"Devolver efectivo", cancel_hold:"Cancelar apartado",
  manage_cash_shift:"Cerrar turno / corte", view_cash_count:"Ver corte de caja", open_cash_drawer:"Abrir cajón",
  adjust_inventory:"Ajustar inventario", manage_transfers:"Traspaso entre sucursales", manage_catalog:"Editar catálogo",
  view_reports:"Ver reportes", manage_settings:"Configuración", manage_users:"Gestionar usuarios" };
const PermCtx = createContext(null);
function usePerm(){ return useContext(PermCtx); }

// Solo pantallas que leen datos REALES. Las maquetas que vivían aquí (Clientes,
// Inventario, Apartados, Reportes) se BORRARON junto con el modo demostración:
// corrían sobre arrays inventados —clientes con niveles Platino/Oro, cifras de
// venta fijas, una matriz talla×color que no significa nada fuera de ropa— y a
// un tenant real le enseñaban datos que no eran suyos. Cuando alguna tenga
// backend se reescribe contra él; no se "reactiva".
const NAV = [
  ["venta","Venta","cart"],["catalogo","Catálogo","tag"],
  ["devoluciones","Devoluciones","return"],
  ["caja","Caja","wallet"],["config","Configuración","gear"],
];
const SHORTCUTS = [["F1","Nueva venta","plus"],["F2","Buscar","search"],["F5","Cobrar","card"],
  ["F7","Devolución","return"],["F8","Abrir cajón","wallet"]];

/* ---------------- shell ---------------- */
function TitleBar({ screen }) {
  const data=useData();
  return (
    <div className="hidden lg:flex items-center justify-between h-9 px-3 bg-titlebar border-b border-line select-none">
      <div className="text-[12px] text-ink-500 font-medium">MRTPV Retail <span className="text-ink-400">•</span> {screen}</div>
      <div className="flex items-center gap-2 text-ink-400">
        <span className={"flex items-center gap-1.5 text-[11px] px-2 h-6 rounded-full border "+(data.online?"border-brand-200 text-brand-700 bg-brand-50":"border-line text-ink-400")} title={data.online?"Conectado al backend":"Sin conexión con el servidor"}>
          <span className="w-1.5 h-1.5 rounded-full" style={{background:data.online?"#16a34a":"#cbd5cf"}}/>{data.online?(data.session?.name||"En línea"):"Sin conexión"}</span>
        {/* Ventas cobradas que aún no llegan al servidor. Se muestra siempre que
            haya alguna: es dinero que el corte del backend todavía no conoce. */}
        {data.outbox?.pending>0&&<button onClick={()=>data.flushOutbox&&data.flushOutbox()}
          title="Ventas cobradas pendientes de enviar. Clic para reintentar ahora."
          className="flex items-center gap-1.5 text-[11px] px-2 h-6 rounded-full border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100">
          <Icon n="clock" s={12}/><span className="tnum font-semibold">{data.outbox.pending}</span> por enviar</button>}
        {data.outbox?.rejected>0&&<span title="El servidor rechazó estas ventas. Requieren revisión manual."
          className="flex items-center gap-1.5 text-[11px] px-2 h-6 rounded-full border border-red-300 bg-red-50 text-red-700">
          <Icon n="alert" s={12}/><span className="tnum font-semibold">{data.outbox.rejected}</span> rechazada(s)</span>}
        {data.session&&<button onClick={()=>data.logout&&data.logout()} title="Cerrar sesión" className="text-[11px] px-2 h-6 rounded-full border border-line hover:bg-black/5 text-ink-500">Salir</button>}
        <button className="w-7 h-7 grid place-items-center rounded hover:bg-black/5"><Icon n="min" s={14}/></button>
        <button className="w-7 h-7 grid place-items-center rounded hover:bg-black/5"><Icon n="max" s={12}/></button>
        <button className="w-7 h-7 grid place-items-center rounded hover:bg-red-500 hover:text-white"><Icon n="x" s={14}/></button>
      </div>
    </div>
  );
}
function TopBar({ query, setQuery, theme, setTheme, setNavOpen }) {
  const data=useData();
  const name=data.session?.name || "Invitado";
  const initials=((name.match(/\b\w/g)||[]).join("").slice(0,2)||"··").toUpperCase();
  const [t]=useState("11:36 AM");
  return (
    <header className="flex items-center gap-2 lg:gap-4 px-3 lg:px-5 h-[60px] lg:h-[68px] bg-card border-b border-line">
      <button onClick={()=>setNavOpen&&setNavOpen(true)} aria-label="Menú" className="lg:hidden w-10 h-10 grid place-items-center rounded-lg hover:bg-surf text-ink-600 shrink-0"><Icon n="menu" s={20}/></button>
      <div className="flex items-baseline gap-2 lg:w-[200px] shrink-0">
        <span className="text-xl lg:text-2xl font-bold tracking-tight text-ink-900">MRT<span className="text-brand-600">PV</span> Retail</span>
        <span className="hidden xl:inline text-[9px] font-semibold tracking-[0.2em] text-ink-400 uppercase">Smart retail flow</span>
      </div>
      <label className="hidden md:flex flex-1 max-w-[640px] items-center gap-3 h-11 px-4 rounded-xl bg-surf border border-line focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <Icon n="search" s={18} cls="text-ink-400"/>
        <input id="globalsearch" value={query} onChange={(e)=>setQuery(e.target.value)}
          placeholder="Buscar producto, SKU o código de barras"
          className="flex-1 bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-400"/>
        <Icon n="scan" s={18} cls="text-ink-400"/>
      </label>
      <div className="flex-1"/>
      <div className="flex items-center gap-2 lg:gap-4">
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-semibold text-sm">{initials}</div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-ink-900">{name}</div>
            <div className="text-[11px] text-ink-400">{data.session?.role?roleEs(data.session.role):""}</div>
          </div>
        </div>
        <div className="hidden xl:block text-[13px] font-medium text-ink-500 tnum">{t}</div>
        <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} title={theme==="dark"?"Modo claro":"Modo oscuro"} aria-label="Cambiar tema" className="w-9 h-9 grid place-items-center rounded-lg hover:bg-surf text-ink-500">
          <Icon n={theme==="dark"?"sun":"moon"} s={18}/></button>
        <button className="relative w-9 h-9 grid place-items-center rounded-lg hover:bg-surf text-ink-500">
          <Icon n="bell" s={18}/>
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 text-white text-[9px] grid place-items-center">2</span>
        </button>
      </div>
    </header>
  );
}
function Sidebar({ screen, go, navOpen, setNavOpen }) {
  const close=()=>setNavOpen&&setNavOpen(false);
  const data=useData();
  return (<>
    {navOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={close}/>}
    <aside className={"bg-card border-r border-line flex-col w-[264px] shrink-0 fixed inset-y-0 left-0 z-50 lg:static lg:w-[224px] lg:z-auto "+(navOpen?"flex":"hidden lg:flex")}>
      <div className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-line">
        <span className="text-lg font-bold tracking-tight text-ink-900">MRT<span className="text-brand-600">PV</span> Retail</span>
        <button onClick={close} aria-label="Cerrar" className="w-9 h-9 grid place-items-center rounded-lg hover:bg-surf text-ink-500"><Icon n="x" s={18}/></button>
      </div>
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {NAV.map(([id,label,icon])=>{
          const a = screen===id;
          return (
            <button key={id} onClick={()=>{ go(id); close(); }}
              className={"w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-medium transition-colors "+
                (a?"bg-brand-100 text-brand-700":"text-ink-500 hover:bg-surf hover:text-ink-900")}>
              <Icon n={icon} s={19} sw={a?2.1:1.8}/>{label}
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-line space-y-2.5 text-[12px]">
        <Row k="Tienda" v={Retail.getLinkedName().location || "—"} icon="store"/>
        {data.session?.name && <Row k="Cajero" v={data.session.name} icon="users"/>}
        <div className="flex items-center gap-2 text-ink-400"><Icon n="wifi" s={14}/><span>Conexión: <span className={data.online?"text-brand-600 font-medium":"text-ink-500 font-medium"}>{data.online?"Online":"Sin conexión"}</span></span></div>
        {data.session && <button onClick={()=>{ close(); data.logout&&data.logout(); }} className="w-full mt-1 h-9 rounded-lg border border-line hover:bg-surf text-ink-600 text-[12px] font-medium inline-flex items-center justify-center gap-2"><Icon n="lock" s={14}/>Cerrar sesión</button>}
      </div>
    </aside>
  </>);
}
function Row({k,v,icon}){return(<div className="flex items-center gap-2 text-ink-400"><Icon n={icon} s={14}/><span>{k}: <span className="text-ink-700 font-medium">{v}</span></span></div>);}

function BottomBar({ go, onCobrar, onNewTicket }) {
  return (
    <footer className="flex items-center gap-2 px-3 lg:px-4 h-[58px] lg:h-[60px] bg-card border-t border-line overflow-x-auto">
      {SHORTCUTS.map(([k,label,icon])=>(
        <button key={k} onClick={()=>{ if(k==="F5")onCobrar(); else if(k==="F7")go("devoluciones"); else if(k==="F8")go("caja"); else if(k==="F1")onNewTicket(); else document.getElementById("globalsearch")?.focus(); }}
          className="shrink-0 min-w-[92px] lg:min-w-0 lg:flex-1 flex items-center justify-center gap-2 h-11 px-3 rounded-xl border border-line hover:bg-surf text-ink-700 text-[12px] lg:text-[13px] font-medium">
          <Icon n={icon} s={17} cls="text-ink-400"/>{label}
          <span className="hidden lg:inline tnum text-[10px] text-ink-400 border border-line rounded px-1">{k}</span>
        </button>
      ))}
      <button className="shrink-0 w-11 h-11 grid place-items-center rounded-xl border border-line hover:bg-surf text-ink-500">···</button>
    </footer>
  );
}

/* ---------------- generic UI ---------------- */
function Card({ className="", children }) { return <div className={"bg-card border border-line rounded-2xl "+className}>{children}</div>; }
/* `disabled` es un atributo real, no solo opacidad: el checkout deshabilitaba el
   botón de cobrar con `pointer-events-none`, que apaga el mouse pero deja el
   botón enfocable y activable con Enter/espacio desde el teclado. */
function PrimaryBtn({ children, onClick, className="", testid, disabled=false, title }) {
  return <button onClick={onClick} data-testid={testid} disabled={disabled} title={title} aria-disabled={disabled}
    className={"inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors active:scale-[.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:hover:bg-brand-600 "+className}>{children}</button>;
}
function GhostBtn({ children, onClick, className="" }) {
  return <button onClick={onClick} className={"inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-line hover:bg-surf text-ink-700 font-medium text-[13px] "+className}>{children}</button>;
}
function Thumb({ p, size=44 }) {
  return <div style={{background:p.tone,width:size,height:size}} className="rounded-xl grid place-items-center shrink-0 border border-black/5">
    <Icon n={p.cat==="Accesorios"?"bookmark":p.cat==="Calzado"?"tag":"tag"} s={size*0.42} cls="text-black/25"/></div>;
}
function ScreenHead({ icon, title, right, folio }) {
  return (<div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-3"><Icon n={icon} s={22} cls="text-brand-600"/><h1 className="text-lg font-semibold text-ink-900">{title}</h1></div>
    <div className="flex items-center gap-3">{folio&&<span className="tnum text-[12px] text-ink-400">Folio: {folio}</span>}{right}</div>
  </div>);
}

function Modal({ title, onClose, children }) {
  return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-xl bg-card rounded-2xl border border-line shadow-2xl p-6" onClick={(e)=>e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 grid place-items-center rounded-lg hover:bg-surf text-ink-400"><Icon n="x" s={18}/></button>
      </div>
      {children}
    </div></div>);
}

function GateBtn({ perm, onClick, children, className="", ghost=false }) {
  const { can, gate } = usePerm();
  const locked = !can(perm);
  const Comp = ghost ? GhostBtn : PrimaryBtn;
  return <Comp className={className} onClick={()=>gate(perm, onClick||(()=>{}))}>
    {locked && <Icon n="lock" s={15}/>}{children}</Comp>;
}

/* RoleSwitcher eliminado: el rol ya no es seleccionable desde el cliente.
   El acceso se deriva del empleado logueado (RBAC real). */

function OverrideModal({ perm, onClose, onOk }) {
  const [pin,setPin]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(pin.length<4){ setErr("Ingresa el PIN de 4 dígitos."); return; }
    setBusy(true); setErr("");
    try{
      const r=await Retail.verifyPermission(pin, CANON_PERM[perm]||perm);
      onOk(r?.supervisor?.name || "Supervisor");
    }catch(e){
      setErr(e?.status===401?"PIN de supervisor incorrecto.":e?.status===403?"Ese supervisor no tiene este permiso.":(e?.message||"No se pudo autorizar."));
      setPin(""); setBusy(false);
    }
  };
  return (<Modal title="Autorización de supervisor" onClose={onClose}>
    <div className="text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 grid place-items-center text-amber-500 mb-3"><Icon n="lock" s={26}/></div>
      <div className="text-[14px] text-ink-700">Se requiere permiso:</div>
      <div className="text-[15px] font-semibold text-ink-900">{PERM_LABEL[perm]||perm}</div>
      <div className="text-[12px] text-ink-400 mt-1">Un supervisor (encargado o dueño) con este permiso debe autorizar con su PIN.</div>
      <input value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,"").slice(0,4));setErr("");}} type="password" inputMode="numeric" placeholder="••••" autoFocus
        className="mt-4 w-44 mx-auto block text-center tnum text-2xl tracking-[0.5em] h-14 rounded-xl border border-line outline-none focus:border-brand-500"
        onKeyDown={e=>{ if(e.key==="Enter") submit(); }}/>
      {err && <div className="text-[12px] text-red-500 mt-2">{err}</div>}
      <div className="flex gap-2 mt-5"><GhostBtn className="flex-1" onClick={onClose}>Cancelar</GhostBtn><PrimaryBtn className="flex-1" onClick={busy?undefined:submit}><Icon n="check" s={16}/>{busy?"Verificando…":"Autorizar"}</PrimaryBtn></div>
    </div></Modal>);
}

function LockedScreen({ perm, icon, title }) {
  const { gate } = usePerm();
  return (<div className="h-full overflow-y-auto"><ScreenHead icon={icon} title={title}/>
    <Card className="flex flex-col items-center justify-center text-center py-20">
      <div className="w-16 h-16 rounded-full bg-amber-50 grid place-items-center text-amber-500 mb-4"><Icon n="lock" s={30}/></div>
      <div className="text-lg font-semibold text-ink-900">Acceso restringido</div>
      <p className="text-ink-500 mt-1 max-w-sm">Tu rol no tiene el permiso <span className="font-medium text-ink-700">{PERM_LABEL[perm]}</span>. Pide autorización a un supervisor.</p>
      <PrimaryBtn className="mt-5" onClick={()=>gate(perm,()=>{})}><Icon n="shield" s={16}/>Solicitar autorización</PrimaryBtn>
    </Card></div>);
}

function Toast({ msg, onClose }) {
  useEffect(()=>{ const t=setTimeout(onClose,3500); return ()=>clearTimeout(t); },[]);
  return (<div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl bg-ink-900 text-white shadow-lg text-[13px]">
    <span className="w-5 h-5 rounded-full bg-brand-500 grid place-items-center"><Icon n="check" s={13} c="#fff"/></span>{msg}</div>);
}

function Barcode({ value, height=44, width=1.7, className="" }) {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current && window.JsBarcode){ try{ window.JsBarcode(ref.current, String(value||" "), {format:"CODE128", height, width, displayValue:false, margin:0, background:"transparent", lineColor:"#1b2520"}); }catch{} } }, [value, height, width]);
  return <svg ref={ref} className={className}></svg>;
}
function Dash(){ return <div className="border-t border-dashed border-ink-400 my-2"/>; }
function RcLine({l,r}){ return <div className="flex justify-between gap-2"><span className="text-ink-600">{l}</span><span>{r}</span></div>; }

function ReceiptModal({ sale, onClose }) {
  const data = useData();
  // IVA desglosado COMO INCLUIDO en el total (precio de catálogo con IVA); informativo.
  const iva = Math.round((sale.total - sale.total/1.16) * 100)/100;
  const [ip,setIp]=useState(""); const [status,setStatus]=useState("");
  useEffect(()=>{ setIp(getPrinterConfig().ip||""); },[]);
  const doPrint=async()=>{
    if(ip.trim()) setPrinterIp(ip.trim());
    setStatus("Imprimiendo…");
    const escpos=buildReceipt({ folio:sale.folio, items:sale.items, subtotal:sale.subtotal, desc:sale.desc, total:sale.total, method:sale.method, cashier:(data.session&&data.session.name)||"" });
    const res=await printEscpos(escpos);
    if(res.ok) setStatus("Enviado a la impresora ✓");
    else if(res.channel==="web"){ if(window.print) window.print(); setStatus("Sin impresora nativa — impresión del sistema"); }
    else setStatus("Error: "+(res.error||"revisa la IP")); };
  return (<Modal title="Vista previa del recibo" onClose={onClose}>
    <div className="flex gap-6 items-start">
      <div className="mx-auto w-[290px] bg-card border border-line rounded-md px-5 py-5 font-mono text-[11px] text-ink-900 leading-relaxed shadow-sm">
        <div className="text-center">
          <div className="text-[16px] font-bold tracking-tight">MRTPV Retail</div>
          <div className="text-[8px] tracking-[0.22em] text-ink-500">SMART RETAIL FLOW</div>
          <div className="text-[10px] text-ink-500 mt-1.5">Av. Masaryk 100, Polanco</div>
          <div className="text-[10px] text-ink-500">RFC MPL230114AB1 · Tel 55 1234 0000</div>
        </div>
        <Dash/>
        <RcLine l="Folio" r={sale.folio}/><RcLine l="Cajero" r="Carla Méndez"/>
        <RcLine l="Caja" r="01"/><RcLine l="Fecha" r="19/05/24 11:36"/>
        <Dash/>
        {sale.items.map((it)=>(<div key={it.key} className="mb-1.5">
          <div className="truncate">{it.name}</div>
          <div className="flex justify-between text-ink-600"><span>{it.qty} x {mx(it.price)} · {it.color}/{it.size}</span><span>{mx(it.price*it.qty)}</span></div>
        </div>))}
        <Dash/>
        <RcLine l="Subtotal" r={mx(sale.subtotal)}/>
        {sale.desc ? <RcLine l="Descuento" r={"-"+mx(sale.desc)}/> : null}
        <div className="flex justify-between font-bold text-[14px] mt-1.5"><span>TOTAL</span><span>{mx(sale.total)}</span></div>
        <RcLine l="IVA 16% incluido" r={mx(iva)}/>
        <RcLine l={sale.method||"Efectivo"} r={mx(sale.total)}/>
        <Dash/>
        <div className="flex justify-center my-1"><Barcode value={sale.folio} height={36} width={1.4}/></div>
        <div className="text-center text-[9px] tracking-wider text-ink-600">{sale.folio}</div>
        <div className="text-center mt-3 text-[10px] leading-snug">¡Gracias por tu compra!<br/>Cambios en 30 días con ticket</div>
      </div>
      <div className="w-44 shrink-0 self-center space-y-3">
        <div className="text-[12px] text-ink-500">Impresora térmica 80 mm · ESC/POS</div>
        <div><div className="text-[11px] text-ink-500 mb-1">IP de la impresora</div>
          <input value={ip} onChange={e=>setIp(e.target.value)} placeholder="192.168.1.50" className="w-full h-9 rounded-lg border border-line bg-surf px-3 text-[12px] tnum outline-none focus:border-brand-500"/></div>
        <PrimaryBtn className="w-full" onClick={doPrint}><Icon n="printer" s={16}/>Imprimir recibo</PrimaryBtn>
        {status && <div className="text-[11px] text-ink-500 text-center">{status}</div>}
        <GhostBtn className="w-full" onClick={onClose}>Cerrar</GhostBtn>
      </div>
    </div></Modal>);
}

function LabelModal({ sku, color, size, onClose }) {
  const [qty,setQty]=useState(1);
  const giro=useGiro();
  // El código debe ser el de la VARIANTE seleccionada. Antes se usaba
  // `sku.barcode` (el del primer SKU del producto) para todas las tallas, así que
  // la etiqueta de una M salía con el código de la XS.
  const variantCode = (sku.barcodeByVariant||{})[String(color)+"::"+String(size)];
  const code = variantCode || sku.barcode || sku.sku;
  const attrs = giroConfig(giro).attrs.map(a=>a.key==="color"?color:a.key==="size"?size:sku[a.key]).filter(Boolean);
  const [ip,setIp]=useState(""); const [status,setStatus]=useState("");
  useEffect(()=>{ setIp(getPrinterConfig().ip||""); },[]);
  const doPrint=async()=>{
    if(ip.trim()) setPrinterIp(ip.trim());
    setStatus("Imprimiendo…");
    const escpos=buildLabel({ name:sku.name, attrs, unit:sku.unit, price:sku.price, code, sku:sku.sku }, qty);
    const res=await printEscpos(escpos);
    if(res.ok) setStatus("Enviado a la impresora ✓");
    else if(res.channel==="web"){ if(window.print) window.print(); setStatus("Sin impresora nativa — impresión del sistema"); }
    else setStatus("Error: "+(res.error||"revisa la IP")); };
  return (<Modal title="Etiqueta de código de barras" onClose={onClose}>
    <div className="flex gap-6 items-start">
      <div className="mx-auto">
        <div className="w-[236px] bg-card border border-ink-300 rounded-md p-3 text-center shadow-sm">
          <div className="text-[11px] font-semibold text-ink-900 truncate">{giroConfig(giro).label} · {sku.name}</div>
          <div className="text-[10px] text-ink-500">{attrs.join(" / ")}</div>
          <div className="tnum text-xl font-bold text-ink-900 my-1.5">{mx(sku.price)}</div>
          <div className="flex justify-center"><Barcode value={code} height={52} width={1.9}/></div>
          <div className="tnum text-[10px] tracking-[0.18em] text-ink-800 mt-1">{code}</div>
          <div className="text-[9px] text-ink-400 mt-0.5">{sku.sku}</div>
        </div>
      </div>
      <div className="w-48 shrink-0 self-center space-y-3">
        <Fld label="Cantidad de etiquetas">
          <div className="flex items-center justify-between h-10 px-2 rounded-lg border border-line"><button onClick={()=>setQty(Math.max(1,qty-1))} className="w-7 h-7 grid place-items-center text-ink-400"><Icon n="minus" s={14}/></button><span className="tnum">{qty}</span><button onClick={()=>setQty(qty+1)} className="w-7 h-7 grid place-items-center text-brand-600"><Icon n="plus" s={14}/></button></div>
        </Fld>
        <div><div className="text-[11px] text-ink-500 mb-1">IP de la impresora</div>
          <input value={ip} onChange={e=>setIp(e.target.value)} placeholder="192.168.1.50" className="w-full h-9 rounded-lg border border-line bg-surf px-3 text-[12px] tnum outline-none focus:border-brand-500"/></div>
        <PrimaryBtn className="w-full" onClick={doPrint}><Icon n="printer" s={16}/>Imprimir {qty} etiqueta{qty>1?"s":""}</PrimaryBtn>
        {status && <div className="text-[11px] text-ink-500 text-center">{status}</div>}
        <GhostBtn className="w-full" onClick={onClose}>Cerrar</GhostBtn>
      </div>
    </div></Modal>);
}

/* ===================================================== SALE ===================================================== */
function SaleScreen({ cart, setCart, sel, setSel, go, tickets, activeId, ticketIndex, onSwitch, onAddTicket, onCloseTicket }) {
  const products=useProducts();
  // l.qty SIEMPRE está en unidad base (pza/mts/kg…), aunque el cajero capture por
  // caja: así el subtotal, el descuento de stock y lo que se manda al backend no
  // dependen del modo de captura. La caja solo cambia el input y lo que se pinta.
  const setQty=(id,d)=>setCart(c=>c.map(l=>{
    if(l.key!==id) return l;
    const step=l.byPackage?(l.unitsPerPackage||1):1;
    return {...l,qty:round3(Math.max(step,Number(l.qty)+d*step))};
  }));
  // Granel: cantidad libre. Se deja pasar el string vacío/parcial mientras el
  // cajero teclea ("0." no es un número válido todavía) y se normaliza al vender.
  const setQtyExact=(id,v)=>setCart(c=>c.map(l=>l.key===id?{...l,qty:(v===""?"":Number(v)<0?0:v)}:l));
  // Captura por caja: el input muestra cajas, l.qty guarda unidad base.
  const setQtyPackages=(id,v)=>setCart(c=>c.map(l=>{
    if(l.key!==id) return l;
    if(v==="") return {...l,qty:""};
    const n=Number(v);
    return {...l,qty:n<0?0:packagesToBase(n,l.unitsPerPackage||1)};
  }));
  // Alternar pza↔caja NO cambia la cantidad real, solo cómo se captura: si tienes
  // 250 pza y cambias a cajas de 100, sigues teniendo 250 pza (2.5 cajas).
  const togglePackage=(id)=>setCart(c=>c.map(l=>l.key===id?{...l,byPackage:!l.byPackage}:l));
  const del=(id)=>setCart(c=>c.filter(l=>l.key!==id));
  const [scan,setScan]=useState("");
  const giro=useGiro();
  const { priceLists, priceListId, setPriceListId }=useData();
  const sizes=sizesFor(giro);
  const addProduct=(p)=>{ const size=sizes.includes(p.size)?p.size:(p.live?p.size:(sizes[0]||"Única")); setCart(c=>[...c,{key:p.id+"-"+Date.now(),id:p.id,name:p.name,sku:p.sku,price:p.price,priceTiers:p.priceTiers,color:p.color,size,tone:p.tone,cat:p.cat,qty:1,unit:p.unit,unitsPerPackage:p.unitsPerPackage,byPackage:false,skuId:p.skuId||resolveSkuId(p,p.color,p.size)}]); };
  // Resolución del escaneo, en orden de especificidad. El orden importa: la
  // pistola manda el código de barras, y un código que casualmente aparezca como
  // substring del nombre de otro producto agregaría el artículo equivocado.
  //   1) barcode exacto  2) SKU exacto  3) substring de SKU+nombre (búsqueda a mano)
  const doScan=(e)=>{ e.preventDefault(); const q=scan.trim().toLowerCase(); if(!q)return;
    const m=products.find(p=>(p.barcode||"").toLowerCase()===q)
      ||products.find(p=>p.sku.toLowerCase()===q)
      ||products.find(p=>(p.sku+" "+p.name+" "+(p.variantLabel||"")).toLowerCase().indexOf(q)>=0);
    if(m){ addProduct(m); setSel(m); } setScan(""); };
  const subtotal=cartTotal(cart,priceListId);
  const desc=0; // sin descuento automático; el precio de catálogo ya incluye IVA
  const total=Math.round((subtotal-desc)*100)/100;
  const iva=Math.round((total-total/1.16)*100)/100; // IVA incluido (informativo)
  return (
    <div className="flex flex-col h-full gap-3">
      <TicketTabs tickets={tickets} activeId={activeId} onSwitch={onSwitch} onAdd={onAddTicket} onClose={onCloseTicket}/>
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-4 flex-1 min-h-0">
      <div className="flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 h-14 border-b border-line">
            <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-brand-100 grid place-items-center text-brand-600"><Icon n="cart" s={18}/></div>
              <span className="font-semibold text-ink-900">Venta activa</span></div>
            <div className="flex items-center gap-3">
              {/* Tipo de cliente: cambia el precio de TODO el carrito. Solo si el
                  tenant definió listas — una tienda sin listas no ve el selector. */}
              {priceLists?.length>0 && (
                <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
                  <Icon n="users" s={14}/>
                  <select data-testid="price-list-select" value={priceListId||""} onChange={e=>setPriceListId(e.target.value||null)}
                    className="h-8 rounded-lg border border-line bg-surf px-2 text-[12px] text-ink-900 outline-none focus:border-brand-500">
                    <option value="">Precio de catálogo</option>
                    {priceLists.map(pl=><option key={pl.id} value={pl.id}>{pl.name}</option>)}
                  </select>
                </label>
              )}
              <span className="tnum text-[12px] text-ink-400">Ticket {(ticketIndex??0)+1}</span>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_120px_56px_56px_90px_84px_40px] px-5 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wide border-b border-line">
            <span>Producto</span><span>SKU</span><span data-testid="cart-col-size" className="text-center">{attrLabel(giro,"size")||"Talla"}</span><span data-testid="cart-col-color" className="text-center">{attrLabel(giro,"color")||"Color"}</span><span className="text-right">Precio</span><span className="text-center">Cant.</span><span></span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {cart.map(l=>(
              <div key={l.key} data-testid="cart-row" className="grid grid-cols-[1fr_120px_56px_56px_90px_84px_40px] items-center px-5 py-3 border-b border-line/70 hover:bg-surf/60">
                <div className="flex items-center gap-3 min-w-0"><Thumb p={l}/>
                  <div className="min-w-0"><div className="text-[13px] font-semibold text-ink-900 truncate">{l.name}</div>
                    <div className="text-[11px] text-ink-400">{[l.color,l.size].filter(v=>v&&v!=="Único"&&v!=="Única").join(" / ")}</div></div></div>
                <span className="tnum text-[11px] text-ink-500">{l.sku}</span>
                <span className="text-center text-[13px] text-ink-700">{l.size}</span>
                {/* El swatch solo tiene sentido donde el atributo ES un color. */}
                <span className="flex justify-center">{giroConfig(giro).attrs.find(a=>a.key==="color")?.swatch
                  ? <span style={{background:swatch[l.color]||"#ccc"}} className="w-5 h-5 rounded-full border border-black/10"/>
                  : <span className="text-[12px] text-ink-700 truncate">{l.color==="Único"?"—":l.color}</span>}</span>
                {/* Precio con escalón aplicado: si el mayoreo entró, el cajero
                    tiene que verlo — es lo que se va a cobrar. */}
                <span className="tnum text-right text-[13px] text-ink-900">
                  {mx(linePrice(l,priceListId))}
                  {isBulkUnit(l.unit)?<span className="text-[10px] text-ink-400">/{l.unit}</span>:null}
                  {linePrice(l,priceListId)<l.price?<span className="block text-[9px] text-brand-600 font-semibold">precio especial</span>:null}
                </span>
                {/* Tres modos de captura, pero l.qty SIEMPRE en unidad base:
                      · granel (MTS/KG/LTS) → decimal a mano (el stepper de ±1 no sirve)
                      · por caja           → el input son cajas, se guardan unidades base
                      · pieza              → stepper clásico
                    El backend acepta decimales (Decimal(12,3) en toda la cadena). */}
                <span className="flex flex-col items-center justify-center gap-0.5">
                  <span className="flex items-center justify-center gap-1.5">
                    {l.byPackage ? (
                      <input type="number" min="0.001" step="1" data-testid="cart-qty-input" aria-label={`Cajas de ${l.name}`}
                        value={baseToPackages(Number(l.qty)||0, l.unitsPerPackage||1)}
                        onChange={e=>setQtyPackages(l.key, e.target.value)}
                        onWheel={e=>e.currentTarget.blur()}
                        className="tnum w-16 h-7 text-center text-[13px] rounded-lg border border-line bg-surf outline-none focus:border-brand-500"/>
                    ) : isBulkUnit(l.unit) ? (
                      <input type="number" min="0.001" step="0.001" data-testid="cart-qty-input" aria-label={`Cantidad de ${l.name} en ${l.unit}`}
                        value={l.qty}
                        onChange={e=>setQtyExact(l.key, e.target.value)}
                        onWheel={e=>e.currentTarget.blur()}
                        className="tnum w-16 h-7 text-center text-[13px] rounded-lg border border-line bg-surf outline-none focus:border-brand-500"/>
                    ) : (<>
                      <button onClick={()=>setQty(l.key,-1)} className="w-7 h-7 grid place-items-center rounded-lg border border-line hover:bg-surf text-ink-500"><Icon n="minus" s={13}/></button>
                      <span className="tnum w-5 text-center text-[13px]">{l.qty}</span>
                      <button onClick={()=>setQty(l.key,1)} className="w-7 h-7 grid place-items-center rounded-lg border border-line hover:bg-surf text-ink-500"><Icon n="plus" s={13}/></button>
                    </>)}
                  </span>
                  {canEnterByPackage(l.unit, l.unitsPerPackage) && (
                    <button onClick={()=>togglePackage(l.key)}
                      data-testid="cart-package-toggle"
                      title={`1 caja = ${l.unitsPerPackage} ${l.unit}`}
                      className={"text-[9px] px-1.5 rounded "+(l.byPackage?"bg-brand-100 text-brand-700 font-semibold":"text-ink-400 hover:text-ink-700")}>
                      {l.byPackage?`caja ×${l.unitsPerPackage} = ${round3(Number(l.qty)||0)} ${l.unit}`:"por caja"}
                    </button>
                  )}
                </span>
                <button onClick={()=>del(l.key)} aria-label={`Quitar ${l.name}`} className="justify-self-center w-8 h-8 grid place-items-center rounded-lg hover:bg-red-50 text-ink-400 hover:text-red-500"><Icon n="trash" s={15}/></button>
              </div>
            ))}
            {cart.length===0&&<div className="py-16 text-center text-ink-400 text-sm">Escanea o agrega un producto para iniciar la venta.</div>}
          </div>
          <div className="flex gap-2 px-5 py-3 border-t border-line">
            <GhostBtn onClick={()=>go("catalogo")}><Icon n="plus" s={16}/>Agregar producto</GhostBtn>
            <GateBtn ghost perm="apply_discount"><Icon n="tag" s={16}/>Aplicar descuento</GateBtn>
            <GhostBtn><Icon n="file" s={16}/>Agregar nota</GhostBtn>
          </div>
        </Card>
        <Card className="mt-4 grid grid-cols-[1fr_360px] overflow-hidden">
          <div className="p-5 flex flex-col justify-end">
            <form onSubmit={doScan} className="flex items-center gap-3 h-12 px-4 rounded-xl bg-surf border border-line focus-within:border-brand-500">
              <Icon n="scan" s={18} cls="text-ink-400"/>
              <input value={scan} onChange={(e)=>setScan(e.target.value)} placeholder="Escanea o escribe SKU / código…" className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-400"/>
              <button type="submit" className="text-[12px] font-medium text-brand-600 px-2">Agregar</button></form>
            <div className="text-[11px] text-ink-400 mt-2 ml-1">Escanea o escribe el SKU del producto y presiona Enter</div>
          </div>
          <div className="p-5 border-l border-line space-y-2">
            <TotRow k="Subtotal" v={mx(subtotal)}/>
            {desc>0 && <TotRow k="Descuento" v={<span className="text-brand-600">-{mx(desc)}</span>}/>}
            <TotRow k="IVA 16% incluido" v={mx(iva)}/>
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-line">
              <span className="font-semibold text-ink-900">Total</span>
              <span data-testid="sale-total" className="tnum text-2xl font-bold text-ink-900">{mx(total)}</span></div>
            <PrimaryBtn onClick={()=>go("checkout")} testid="btn-cobrar" className="w-full mt-1"><Icon n="card" s={18}/>Cobrar <span className="tnum opacity-80">F5</span></PrimaryBtn>
          </div>
        </Card>
      </div>
      {/* La guarda va aquí y no dentro del panel: ProductDetailPanel arranca con
          useState(p.color)/useEffect, así que un early-return por p==null
          rompería el orden de hooks. */}
      {sel
        ? <ProductDetailPanel p={sel} onAdd={(p,color,size)=>setCart(c=>[...c,{key:p.id+color+size+Date.now(),id:p.id,name:p.name,sku:p.sku,price:p.price,priceTiers:p.priceTiers,color,size,tone:p.tone,cat:p.cat,qty:1,unit:p.unit,unitsPerPackage:p.unitsPerPackage,byPackage:false,skuId:p.skuId||resolveSkuId(p,color,size)}])}/>
        : <EmptyDetailPanel/>}
      </div>
    </div>
  );
}
function TotRow({k,v}){return(<div className="flex items-center justify-between text-[13px]"><span className="text-ink-500">{k}</span><span className="tnum text-ink-900">{v}</span></div>);}

// Panel de detalle sin producto seleccionado: catálogo vacío o todavía cargando.
// Antes este hueco lo tapaba PRODUCTS[0] — una camisa de lino inventada.
function EmptyDetailPanel(){
  const { online }=useData();
  return (
    <Card className="flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-surf grid place-items-center text-ink-300 mb-3"><Icon n="tag" s={24}/></div>
      <div className="text-[13px] font-semibold text-ink-600">
        {online?"Selecciona un producto":"Sin conexión con el servidor"}
      </div>
      <div className="text-[12px] text-ink-400 mt-1 max-w-[220px]">
        {online
          ? "Escanea un código o elige uno del catálogo para ver su detalle."
          : "No se pudo cargar el catálogo. Revisa la conexión y vuelve a intentar."}
      </div>
    </Card>
  );
}
function ProductDetailPanel({ p, onAdd }) {
  const giro=useGiro();
  const cfg=giroConfig(giro);
  const sizes=p.sizes?.length?p.sizes:sizesFor(giro);
  const pick=(s)=>sizes.includes(s)?s:(sizes[0]||"Única");
  const [color,setColor]=useState(p.color);
  const [size,setSize]=useState(pick(p.size));
  const [label,setLabel]=useState(false);
  useEffect(()=>{ setColor(p.color); setSize(pick(p.size)); },[p.id]);
  const row=p.matrix[color]||p.matrix[p.colors[0]]||[];
  const stock=row.reduce((a,b)=>a+b,0);
  const unitLabel=p.unit&&p.unit!=="PZA"?p.unit.toLowerCase():"pzas.";
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 h-14 border-b border-line">
        <div className="min-w-0"><div className="font-semibold text-ink-900 truncate">{p.name}</div>
          <div className="tnum text-[11px] text-ink-400">{p.sku}</div></div>
        <div className="flex items-center gap-1">
          <button onClick={()=>setLabel(true)} aria-label="Imprimir etiqueta" title="Imprimir etiqueta" className="w-8 h-8 grid place-items-center rounded-lg hover:bg-surf text-ink-400 hover:text-brand-600"><Icon n="barcode" s={17}/></button>
          <button className="w-8 h-8 grid place-items-center rounded-lg hover:bg-surf text-ink-400"><Icon n="heart" s={17}/></button>
        </div>
      </div>
      <div className="p-5 overflow-y-auto flex-1">
        <div style={{background:p.tone}} className="w-full h-44 rounded-2xl grid place-items-center border border-black/5"><Icon n="tag" s={56} cls="text-black/15"/></div>
        <div className="flex items-end justify-between mt-4">
          <div><div className="tnum text-2xl font-bold text-ink-900">{mx(p.price)}</div>
            <div className="text-[12px] text-brand-600 font-medium mt-0.5">En stock: {stock} {unitLabel}</div></div></div>

        {/* Ropa vende una matriz talla×color; ferretería/refaccionaria venden el
            SKU directo, así que el selector de variante no aplica. */}
        {cfg.useVariantMatrix ? (<>
          <div className="mt-5">
            <div className="text-[12px] text-ink-500 mb-2">{attrLabel(giro,"color")||"Color"}: <span className="text-ink-900 font-medium">{color}</span></div>
            <div className="flex gap-2">{p.colors.map(c=>(
              <button key={c} onClick={()=>setColor(c)} title={c}
                style={{background:swatch[c]||"#ccc"}}
                className={"w-9 h-9 rounded-full border-2 "+(color===c?"border-brand-600 ring-2 ring-brand-100":"border-black/10")}/>))}</div>
          </div>
          <div className="mt-5">
            <div className="text-[12px] text-ink-500 mb-2">{attrLabel(giro,"size")||"Talla"}:</div>
            <div className="flex gap-2">{sizes.map(s=>(
              <button key={s} onClick={()=>setSize(s)}
                className={"flex-1 h-10 rounded-xl border text-[13px] font-medium "+(size===s?"border-brand-600 bg-brand-100 text-brand-700":"border-line text-ink-700 hover:bg-surf")}>{s}</button>))}</div>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-1.5 text-[12px] text-ink-700 font-medium"><Icon n="box" s={15} cls="text-brand-600"/>Stock por {(attrLabel(giro,"size")||"talla").toLowerCase()}</div></div>
            <div className="grid rounded-xl border border-line overflow-hidden text-center" style={{gridTemplateColumns:`repeat(${sizes.length||1}, minmax(0, 1fr))`}}>
              {sizes.map((s,i)=>(<div key={s} className="border-r border-line last:border-0 py-2"><div className="text-[11px] text-ink-400">{s}</div>
                <div className={"tnum text-sm font-semibold "+(s===size?"text-brand-600":"text-ink-900")}>{row[i]??0}</div></div>))}</div>
          </div>
        </>) : (
          <div className="mt-5 rounded-xl border border-line divide-y divide-line">
            {cfg.attrs.map(a=>p[a.key]?(
              <div key={a.key} className="flex items-center justify-between px-3 py-2 text-[12px]">
                <span className="text-ink-500">{a.label}</span><span className="text-ink-900 font-medium">{p[a.key]}</span></div>):null)}
            <div className="flex items-center justify-between px-3 py-2 text-[12px]">
              <span className="text-ink-500">Unidad</span><span className="text-ink-900 font-medium">{p.unit}</span></div>
            {p.unitsPerPackage?(<div className="flex items-center justify-between px-3 py-2 text-[12px]">
              <span className="text-ink-500">Por caja</span><span className="tnum text-ink-900 font-medium">{p.unitsPerPackage}</span></div>):null}
            {p.binLocation?(<div className="flex items-center justify-between px-3 py-2 text-[12px]">
              <span className="text-ink-500">Ubicación</span><span className="text-ink-900 font-medium">{p.binLocation}</span></div>):null}
          </div>
        )}

        <button onClick={()=>onAdd(p,color,size)} className="w-full h-12 mt-5 rounded-xl border-2 border-brand-200 text-brand-700 font-semibold text-sm hover:bg-brand-50 inline-flex items-center justify-center gap-2"><Icon n="plus" s={18}/>Agregar a la venta</button>
        <Acc title="Descripción" body={p.desc}/>
        <Acc title="Detalles" body={p.detail}/>
      </div>
      {label && <LabelModal sku={p} color={color} size={size} onClose={()=>setLabel(false)}/>}
    </Card>
  );
}
function Acc({title,body}){const[o,setO]=useState(true);return(<div className="border-t border-line mt-4 pt-3">
  <button onClick={()=>setO(!o)} className="w-full flex items-center justify-between text-[13px] font-medium text-ink-900"><span>{title}</span><Icon n="chev" s={16} cls={"text-ink-400 transition-transform "+(o?"":"-rotate-90")}/></button>
  {o&&<p className="text-[12px] text-ink-500 mt-2 leading-relaxed">{body}</p>}</div>);}

/* ===================================================== CHECKOUT ===================================================== */
/** Denominaciones sugeridas para el efectivo.
 *
 *  Antes los botones eran `+$100 / +$200 / …` y SUMABAN al importe ya escrito,
 *  que es como funciona una calculadora, no como paga un cliente: el cajero
 *  recibe UN billete y quiere teclearlo, no acumular. Ahora cada botón es la
 *  cantidad que el cliente entrega, calculada desde el restante: el primero es
 *  el importe exacto y los demás son los billetes reales que le siguen. */
function cashSuggestions(remaining) {
  const BILLS = [20, 50, 100, 200, 500, 1000];
  const exact = Math.round(remaining * 100) / 100;
  if (exact <= 0) return [];
  const out = [exact];
  // Redondeo "hacia arriba" a la siguiente decena/centena útil (p. ej. 265 → 300).
  for (const step of [50, 100, 500]) {
    const up = Math.ceil(exact / step) * step;
    if (up > exact && !out.includes(up)) out.push(up);
  }
  // Billetes sueltos que ya cubren el total (p. ej. 265 → 500, 1000).
  for (const bill of BILLS) if (bill > exact && !out.includes(bill)) out.push(bill);
  return out.sort((a, b) => a - b).slice(0, 4);
}

function CheckoutScreen({ cart, setCart, go, onApprove }) {
  const [method,setMethod]=useState("Efectivo");
  const [amt,setAmt]=useState("");
  const [lines,setLines]=useState([]);
  const [rcpt,setRcpt]=useState(false);
  const [busy,setBusy]=useState(false);
  const [confirmClear,setConfirmClear]=useState(false);
  const amtRef=useRef(null);
  // Guard de doble cobro. Va en un ref y no solo en el estado porque dos clics
  // en el mismo tick de React leen el MISMO valor de `busy` (el re-render aún
  // no ocurrió) y ambos pasarían el if. El ref se escribe de inmediato.
  const inFlight=useRef(false);
  const { priceListId, priceLists, setPriceListId }=useData();
  const subtotal=cartTotal(cart,priceListId);
  const desc=0; // sin descuento automático; el precio de catálogo ya incluye IVA
  const total=Math.round((subtotal-desc)*100)/100;
  const iva=Math.round((total-total/1.16)*100)/100; // IVA incluido (informativo)
  const methods=[["Efectivo","Billetes y monedas","cash"],["Tarjeta","Débito o crédito","card"],["Transferencia","SPEI o depósito","swap"],["QR / Pago","Escanea y paga","qr"],["Meses sin intereses","Pago diferido","card"]];
  const paid=Math.round(lines.reduce((s,l)=>s+l.amount,0)*100)/100;
  const remaining=Math.max(0,Math.round((total-paid)*100)/100);
  const amtNum=Number(amt||0);
  const isCash=method==="Efectivo";
  // Importe vacío = "el resto": el cajero que cobra exacto no tiene que teclear.
  const given=amtNum>0?amtNum:remaining;
  const isPartial=amtNum>0&&amtNum<remaining;
  const liveChange=isCash?Math.max(0,Math.round((given-remaining)*100)/100):0;
  // El cambio se DERIVA de los pagos aplicados, no se acumula en un estado
  // aparte: el `changeDue` anterior se ponía en 0 al quitar cualquier pago, así
  // que quitar el segundo pago de una mixta borraba el cambio del primero.
  const changeDue=Math.round(lines.reduce((s,l)=>s+(l.change||0),0)*100)/100;
  const payLabel=lines.length>1?"Pago mixto":(lines[0]?lines[0].method:method);

  const buildPayment=()=>{
    const applied=Math.min(given,remaining);
    if(applied<=0) return null;
    return { method, amount:Math.round(applied*100)/100, change:isCash?Math.max(0,Math.round((given-remaining)*100)/100):0 };
  };
  const addPay=()=>{ const p=buildPayment(); if(!p)return; setLines(l=>[...l,p]); setAmt(""); amtRef.current?.focus(); };
  const removePay=(i)=>{ setLines(l=>l.filter((_,j)=>j!==i)); };

  /* Acción principal. Resuelve el pago que falta y cobra en UNA sola pulsación:
     antes había que "Agregar pago" y luego "Cobrar", dos clics para la venta más
     común (efectivo exacto). Un pago PARCIAL sí se queda en la pantalla, porque
     todavía falta cobrar el resto. */
  const submit=async()=>{
    if(inFlight.current||!cart.length) return;
    if(isPartial){ addPay(); return; }
    const pending=remaining>0?buildPayment():null;
    if(remaining>0&&!pending) return;
    const allLines=pending?[...lines,pending]:lines;
    if(!allLines.length) return;
    inFlight.current=true; setBusy(true);
    try{
      const change=Math.round(allLines.reduce((s,l)=>s+(l.change||0),0)*100)/100;
      await onApprove(total,allLines.length>1?"Pago mixto":allLines[0].method,allLines,change);
    } finally {
      // Si la venta salió bien la pantalla ya se desmontó; si falló hay que
      // volver a habilitar el botón para que el cajero reintente.
      inFlight.current=false; setBusy(false);
    }
  };

  // F5 aquí y no solo en App: el botón anuncia el atajo, pero `cobrar()` de App
  // únicamente navega a esta pantalla, así que en el checkout la tecla no hacía
  // nada. Se registra en captura para ganarle al handler global.
  useEffect(()=>{
    const h=(e)=>{
      if(e.key==="F5"){ e.preventDefault(); e.stopPropagation(); submit(); }
      else if(e.key==="F4"){ e.preventDefault(); const i=methods.findIndex(m=>m[0]===method); setMethod(methods[(i+1)%methods.length][0]); setAmt(""); }
    };
    window.addEventListener("keydown",h,true);
    return ()=>window.removeEventListener("keydown",h,true);
  });
  useEffect(()=>{ if(isCash) amtRef.current?.focus(); },[isCash,method]);

  const primary=(()=>{
    if(busy) return { label:"Procesando venta…", disabled:true };
    if(!cart.length) return { label:"Carrito vacío", disabled:true };
    if(remaining<=0) return { label:"Finalizar venta", disabled:false };
    if(isPartial) return { label:"Aplicar "+mx(amtNum), disabled:false };
    if(isCash&&given<remaining) return { label:"Captura el importe recibido", disabled:true };
    return { label:"Cobrar "+mx(total), disabled:false };
  })();

  return (
    /* Tres zonas reales: carrito | pago | resumen. Antes la tercera columna se
       partía otra vez en dos y los métodos quedaban en ~170px con scroll propio
       (en 1366 "Meses sin intereses" no se alcanzaba a ver), más una cuarta
       fila a lo ancho que repetía el total. */
    /* Escalones: <1024 una columna (globals.css apila los grid de pantalla),
       1024–1279 dos columnas con el carrito alto a la izquierda y pago+resumen
       apilados a la derecha, ≥1280 las tres zonas lado a lado. */
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.95fr)_minmax(300px,0.82fr)] gap-4 h-auto lg:h-full lg:min-h-0">

      {/* ---------- ZONA 1 · CARRITO ---------- */}
      <Card className="flex flex-col overflow-hidden min-h-0 lg:row-span-2 xl:row-span-1">
        <div className="px-5 h-14 flex items-center justify-between border-b border-line shrink-0">
          <span className="font-semibold text-ink-900">Carrito de compra</span>
          <span className="text-[12px] text-ink-400 tnum">{cart.reduce((s,l)=>s+(Number(l.qty)||0),0)} art.</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
          {cart.map(l=>{
            const unit=linePrice(l,priceListId);
            const many=(Number(l.qty)||0)>1;
            return (<div key={l.key} data-testid="checkout-row" className="flex items-center gap-3 p-2 rounded-xl hover:bg-surf">
              <Thumb p={l} size={44}/>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-ink-900 truncate">{l.name}</div>
                <div className="tnum text-[11px] text-ink-400 truncate">{l.sku}</div>
                {/* Precio unitario × cantidad: con lista de precios o escalón de
                    mayoreo el unitario NO es l.price, y antes esta columna
                    mostraba el de catálogo — el cajero veía un precio y se
                    cobraba otro. */}
                {many&&<div className="tnum text-[11px] text-ink-500 mt-0.5">{l.qty} × {mx(unit)}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1">
                  <button onClick={()=>setCart(c=>c.map(x=>x.key===l.key?{...x,qty:Math.max(1,(Number(x.qty)||1)-1)}:x))}
                    aria-label={`Quitar una unidad de ${l.name}`}
                    className="w-10 h-10 grid place-items-center rounded-lg border border-line text-ink-500 hover:bg-surf focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Icon n="minus" s={14}/></button>
                  <span className="tnum text-[13px] w-8 text-center" aria-label={`Cantidad: ${l.qty}`}>{l.qty}</span>
                  <button onClick={()=>setCart(c=>c.map(x=>x.key===l.key?{...x,qty:(Number(x.qty)||0)+1}:x))}
                    aria-label={`Agregar una unidad de ${l.name}`}
                    className="w-10 h-10 grid place-items-center rounded-lg border border-line text-ink-500 hover:bg-surf focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Icon n="plus" s={14}/></button>
                </span>
                <div className="tnum text-[14px] font-semibold text-ink-900 w-24 text-right">{mx(lineTotal(l,priceListId))}</div>
              </div>
            </div>);
          })}
          {cart.length===0&&<div className="py-16 px-6 text-center">
            <div className="text-ink-400 text-sm">Aún no hay productos en la venta.</div>
            <GhostBtn className="mt-4 mx-auto" onClick={()=>go("venta")}><Icon n="scan" s={16}/>Volver a la venta</GhostBtn>
          </div>}
        </div>
        <div className="p-3 border-t border-line flex gap-2 shrink-0">
          <GhostBtn onClick={()=>go("venta")} className="flex-1"><Icon n="chev" s={16} cls="rotate-180"/>Seguir agregando</GhostBtn>
          <GhostBtn onClick={()=>setConfirmClear(true)} className="text-ink-500"><Icon n="trash" s={16}/>Vaciar</GhostBtn>
        </div>
      </Card>

      {/* ---------- ZONA 2 · PAGO ---------- */}
      <div className="flex flex-col gap-4 min-h-0">
        <Card className="p-4 shrink-0">
          <div className="font-semibold text-ink-900 mb-3">Método de pago <span className="text-[11px] font-normal text-ink-400 ml-1">F4</span></div>
          {/* Cuadrícula de 2 columnas: entran los 5 métodos sin scroll interno. */}
          <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-2 gap-2">
            {methods.map(([m,sub,icon])=>{const a=method===m;return(
              <button key={m} role="radio" aria-checked={a} onClick={()=>{setMethod(m);setAmt("");}}
                className={"flex items-center gap-2.5 p-3 rounded-xl border-2 text-left min-h-[60px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 "+(a?"border-brand-500 bg-brand-50":"border-line hover:bg-surf")}>
                <div className={"w-9 h-9 rounded-lg grid place-items-center shrink-0 "+(a?"bg-brand-100 text-brand-600":"bg-surf text-ink-400")}><Icon n={icon} s={18}/></div>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink-900 truncate">{m}</div><div className="text-[11px] text-ink-400 truncate">{sub}</div></div>
                {a&&<Icon n="check" s={16} cls="text-brand-600 shrink-0"/>}</button>);})}
          </div>
        </Card>

        <Card className="p-5 flex flex-col min-h-0 overflow-y-auto">
          <label htmlFor="pay-amount" className="text-[13px] font-medium text-ink-700">{isCash?"Importe recibido":"Monto a cobrar"}</label>
          <input id="pay-amount" ref={amtRef} value={amt}
            onChange={(e)=>setAmt(e.target.value.replace(/[^\d.]/g,"").replace(/(\..*)\./g,"$1"))}
            onFocus={(e)=>e.target.select()} onWheel={(e)=>e.currentTarget.blur()}
            inputMode="decimal" autoComplete="off" placeholder={mx(remaining)}
            className="h-14 mt-2 rounded-xl bg-surf border border-line text-right px-4 tnum text-2xl font-bold text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 placeholder:text-ink-400 placeholder:font-semibold"/>

          {isCash&&<>
            {/* Botones separados con la cantidad que entrega el cliente. La
                rejilla se ajusta al número de sugerencias: un total redondo
                genera menos opciones y con `grid-cols-4` fijo quedaba un hueco. */}
            {(()=>{const sug=cashSuggestions(remaining);return(
              <div className={"grid gap-2 mt-3 "+(sug.length>=4?"grid-cols-4":sug.length===3?"grid-cols-3":"grid-cols-2")}>
                {sug.map((v,i)=>(
                  <button key={v} type="button" onClick={()=>{setAmt(String(v));amtRef.current?.focus();}}
                    className={"h-12 rounded-lg border tnum text-[12px] font-semibold leading-tight hover:bg-surf focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 "+(i===0?"border-brand-200 text-brand-700 bg-brand-50/60":"border-line text-ink-700")}>
                    {i===0?<><span className="block text-[10px] font-medium opacity-70">Exacto</span>{mx(v).replace(/\.00$/,"")}</>
                          :mx(v).replace(/\.00$/,"")}
                  </button>))}
              </div>);})()}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
              <span className="text-[13px] text-ink-500">Cambio</span>
              {/* aria-live: el cajero que usa lector necesita oír el cambio al
                  teclear, no descubrirlo al final. */}
              <span aria-live="polite" className={"tnum text-xl font-bold "+(liveChange>0?"text-brand-600":"text-ink-400")}>{mx(liveChange)}</span>
            </div>
          </>}

          {!isCash&&<p className="text-[12px] text-ink-500 mt-3 leading-relaxed">
            {/* Honestidad sobre lo que el sistema NO hace: no hay integración de
                terminal ni de proveedor QR, el pago se REGISTRA manualmente. */}
            Se registra el cobro de forma manual. MRTPV Retail no está conectado a la
            terminal ni al proveedor, así que confirma en tu dispositivo antes de continuar.
          </p>}

          {isPartial&&<button type="button" onClick={addPay} data-testid="btn-aplicar-pago"
            className="h-11 mt-4 rounded-xl border-2 border-brand-200 text-brand-700 font-semibold text-sm hover:bg-brand-50 inline-flex items-center justify-center gap-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <Icon n="plus" s={16}/>Aplicar {mx(amtNum)} y seguir cobrando</button>}

          {lines.length>0&&<div className="mt-4 pt-3 border-t border-line shrink-0">
            <div className="text-[12px] font-medium text-ink-500 mb-2">Pagos aplicados</div>
            <div className="space-y-1.5">{lines.map((l,i)=>(
              <div key={i} className="flex items-center justify-between text-[12px] bg-surf rounded-lg px-3 py-2">
                <span className="text-ink-700">{l.method}{l.change>0&&<span className="text-ink-400"> · cambio {mx(l.change)}</span>}</span>
                <span className="flex items-center gap-2"><span className="tnum font-semibold text-ink-900">{mx(l.amount)}</span>
                  <button onClick={()=>removePay(i)} aria-label={`Quitar pago de ${mx(l.amount)}`} className="text-ink-400 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"><Icon n="x" s={14}/></button></span>
              </div>))}</div>
          </div>}
        </Card>
      </div>

      {/* ---------- ZONA 3 · RESUMEN + ACCIÓN ----------
          El bloque de acción vive FUERA del área que scrollea: en 1024×768 el
          alto no alcanza para cliente + totales + botón, y con todo junto el
          botón de cobrar quedaba recortado bajo el borde (main es
          overflow-hidden desde lg, así que la página tampoco scrolleaba y el
          cajero simplemente no podía cobrar). */}
      <div className="flex flex-col gap-4 min-h-0">
        <div className="flex flex-col gap-4 min-h-0 lg:overflow-y-auto">
        <Card className="p-4 shrink-0">
          {/* Antes aquí vivía una tarjeta de cliente con datos DEMO fijos
              (nombre, correo, teléfono y puntos inventados) que se pintaba
              igual en una venta real. El backend ni siquiera acepta cliente en
              POST /sales, así que se sustituye por lo que sí es real y sí
              cambia el precio: la lista con la que se está cotizando. */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold text-ink-900">Venta al público</span>
            <Icon n="users" s={16} cls="text-ink-400"/>
          </div>
          <label htmlFor="pl-checkout" className="text-[11px] text-ink-500">Lista de precios</label>
          <select id="pl-checkout" data-testid="price-list-select-checkout" value={priceListId||""}
            onChange={(e)=>setPriceListId&&setPriceListId(e.target.value||null)}
            className="w-full h-11 mt-1 rounded-lg border border-line bg-surf px-2 text-[13px] text-ink-900 outline-none focus:border-brand-500">
            <option value="">Precio de catálogo</option>
            {(priceLists||[]).map(pl=><option key={pl.id} value={pl.id}>{pl.name}</option>)}
          </select>
        </Card>

        <Card className="p-5 flex flex-col shrink-0">
          <TotRow k="Subtotal" v={mx(subtotal)}/>
          <div className="my-2"/><TotRow k="IVA 16% incluido" v={mx(iva)}/>
          {desc>0&&<><div className="my-2"/><TotRow k="Descuento" v={<span className="text-brand-600">-{mx(desc)}</span>}/></>}
          <div className="flex items-baseline justify-between pt-4 mt-3 border-t border-line">
            <span className="text-base font-bold text-ink-900">Total</span>
            <span data-testid="checkout-total" className="tnum text-[38px] leading-none font-bold text-ink-900">{mx(total)}</span>
          </div>
          <div className="mt-4 pt-3 border-t border-line space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-ink-500">Pagado</span>
              <span className={"tnum font-semibold "+(paid>0?"text-emerald-600":"text-ink-400")}>{mx(paid)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-ink-500">{remaining>0?"Restante":"Cambio a entregar"}</span>
              <span aria-live="polite" className={"tnum text-lg font-bold "+(remaining>0?"text-brand-600":"text-ink-900")}>
                {remaining>0?mx(remaining):mx(changeDue)}</span>
            </div>
          </div>
        </Card>
        </div>

        <div className="flex flex-col gap-2 mt-auto shrink-0">
          <PrimaryBtn testid="btn-confirmar-cobro" onClick={submit} disabled={primary.disabled}
            className="w-full h-16 text-base disabled:opacity-50 disabled:cursor-not-allowed">
            {busy
              ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none" aria-hidden="true"/>
              : <Icon n="check" s={20}/>}
            {primary.label}
            {!primary.disabled&&<span className="tnum opacity-80 text-[12px]">F5</span>}
          </PrimaryBtn>
          {/* Imprimir queda bloqueado hasta que la venta exista: antes abría un
              ticket con folio inventado ("VTA-000012346") para una venta que no
              se había cobrado. El ticket real se imprime en la pantalla de éxito. */}
          <GhostBtn className="w-full opacity-50 cursor-not-allowed" onClick={()=>{}}
            title="Disponible al finalizar la venta"><Icon n="printer" s={18}/>Imprimir ticket al finalizar</GhostBtn>
        </div>
      </div>

      {confirmClear&&<Modal title="¿Vaciar la venta?" onClose={()=>setConfirmClear(false)}>
        <p className="text-[13px] text-ink-500">Se quitarán los {cart.reduce((s,l)=>s+(Number(l.qty)||0),0)} artículo(s) del carrito. Esta acción no se puede deshacer.</p>
        <div className="flex gap-2 mt-5">
          <GhostBtn className="flex-1" onClick={()=>setConfirmClear(false)}>Cancelar</GhostBtn>
          <button onClick={()=>{setCart([]);setConfirmClear(false);go("venta");}}
            className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm inline-flex items-center justify-center gap-2"><Icon n="trash" s={16}/>Vaciar venta</button>
        </div>
      </Modal>}
      {rcpt && <ReceiptModal sale={{items:cart,subtotal,desc,total,method:payLabel,folio:"—"}} onClose={()=>setRcpt(false)}/>}
    </div>
  );
}

/* ===================================================== SUCCESS ===================================================== */
function SuccessScreen({ sale, go, newSale }) {
  const [rcpt,setRcpt]=useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 h-full">
      <Card className="p-8 flex flex-col items-center justify-center text-center">
        <div className={"w-20 h-20 rounded-full border-4 grid place-items-center mb-4 "+(sale.pending?"border-amber-400 text-amber-600":"border-brand-500 text-brand-600")}>
          <Icon n={sale.pending?"clock":"check"} s={40} sw={2.4}/></div>
        <h1 className="text-2xl font-bold text-ink-900">{sale.pending?"Venta guardada":"¡Pago aprobado!"}</h1>
        {/* Sin red la venta NO está en el servidor todavía. Decir "completada" a
            secas sería el mismo engaño del folio inventado que había antes. */}
        <p className="text-ink-500 mt-1">{sale.pending
          ? "Se cobró y quedó guardada en esta caja. Se enviará sola en cuanto vuelva la conexión."
          : "La venta ha sido completada correctamente."}</p>
        {/* El cambio se muestra aquí y no solo en el checkout: es el número que
            el cajero necesita LEER mientras cuenta el dinero, y al cobrar la
            pantalla anterior ya desapareció. */}
        {sale.change>0&&<div className="mt-5 px-6 py-3 rounded-2xl bg-brand-50 border border-brand-200 flex items-center gap-3">
          <Icon n="cash" s={22} cls="text-brand-600"/>
          <span className="text-[13px] text-ink-700">Cambio a entregar</span>
          <span data-testid="sale-success-change" className="tnum text-2xl font-bold text-brand-700">{mx(sale.change)}</span>
        </div>}
        <div className={"grid gap-px bg-line rounded-2xl overflow-hidden mt-6 w-full max-w-xl border border-line "+(sale.change>0?"grid-cols-4":"grid-cols-3")}>
          {[["Total pagado",mx(sale.total),"sale-success-total"],["Método de pago",sale.method],...(sale.change>0?[["Cambio",mx(sale.change)]]:[]),[sale.pending?"Folio":"Folio de venta",sale.pending?"al sincronizar":(sale.folio||"—"),"sale-success-folio"]].map(([k,v,tid])=>(
            <div key={k} className="bg-card p-4 text-center"><div className="text-[11px] text-ink-400 mb-1">{k}</div><div data-testid={tid} className="tnum font-semibold text-ink-900 text-sm">{v}</div></div>))}
        </div>
        <div className="grid grid-cols-5 gap-3 mt-6 w-full max-w-xl">
          {[["Nueva venta","cart"],["Enviar ticket por correo","mail"],["Mostrar QR recibo digital","qr"],["Imprimir recibo","printer"],["Facturar CFDI","file"]].map(([t,ic])=>(
            <button key={t} onClick={()=>{ if(t==="Nueva venta")newSale(); else if(t==="Imprimir recibo")setRcpt(true); }} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-line hover:bg-surf text-ink-600 text-[11px] text-center leading-tight">
              <Icon n={ic} s={22} cls="text-brand-600"/>{t}</button>))}
        </div>
        <PrimaryBtn onClick={newSale} className="w-full max-w-xl mt-6">Nueva venta</PrimaryBtn>
        <button onClick={()=>go("venta")} className="w-full max-w-xl h-11 mt-2 rounded-xl border border-line text-brand-700 font-medium hover:bg-surf">Volver al inicio</button>
      </Card>
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-full bg-brand-600 text-white grid place-items-center tnum text-xs">1</div><span className="font-semibold text-ink-900">Resumen de compra</span></div>
        <div className="space-y-3">{sale.items.map(l=>(<div key={l.key} className="flex items-center gap-3">
          <Thumb p={l} size={44}/><div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink-900 truncate">{l.name}</div><div className="text-[11px] text-ink-400">{l.color} / {l.size}</div></div>
          {/* La lista de la VENTA, no la del selector: el cajero pudo cambiarlo
              después de cobrar y el recibo no debe reescribirse solo. */}
          <div className="tnum text-[13px] font-semibold text-ink-900">{mx(lineTotal(l,sale.priceListId))}</div></div>))}</div>
        <div className="mt-5 pt-4 border-t border-line space-y-2">
          <TotRow k="Subtotal" v={mx(sale.subtotal)}/>{sale.desc?<TotRow k="Descuento" v={<span className="text-brand-600">- {mx(sale.desc)}</span>}/>:null}
          <div className="flex items-center justify-between pt-2 border-t border-line"><span className="font-semibold text-ink-900">Total</span><span className="tnum text-lg font-bold text-ink-900">{mx(sale.total)}</span></div>
          <div className="text-[11px] text-ink-400">IVA incluido</div>
        </div>
        <div className="mt-5 p-4 rounded-2xl bg-surf border border-line text-center">
          <div className="text-[12px] text-ink-500 mb-2">Escanea para ver tu recibo digital</div>
          <div className="w-28 h-28 mx-auto bg-card border border-line rounded-xl grid place-items-center text-ink-300"><Icon n="qr" s={56}/></div>
          <div className="text-[12px] text-brand-600 font-medium mt-2">¡Te esperamos pronto!</div>
        </div>
      </Card>
      {rcpt && <ReceiptModal sale={{...sale, folio:sale.folio||"—"}} onClose={()=>setRcpt(false)}/>}
    </div>
  );
}

/* ---------------- campo de formulario compartido ---------------- */
function Fld({label,children}){return(<label className="block mb-3"><span className="text-[12px] text-ink-500 mb-1 block">{label}</span>{children}</label>);}

/* ===================================================== CATALOG ===================================================== */
function CatalogScreen({ setSel, go }) {
  const [q,setQ]=useState(""); const [cat,setCat]=useState("Todas");
  const [color,setColor]=useState("Todos"); const [stock,setStock]=useState("Todos");
  const [sort,setSort]=useState("Recientes"); const [quick,setQuick]=useState(null); const [label,setLabel]=useState(null);
  const products=useProducts();
  const cats=["Todas","Mujer","Hombre","Accesorios","Calzado","Outlet","Nueva colección"];
  const allColors=["Todos",...Array.from(new Set(products.flatMap(p=>p.colors)))];
  let list=products.filter(p=>(cat==="Todas"||p.cat===cat)&&(color==="Todos"||p.colors.includes(color))&&(!q||(p.name+p.sku).toLowerCase().includes(q.toLowerCase())));
  if(stock==="Bajo") list=list.filter(p=>totalStock(p)<30);
  if(stock==="Sin stock") list=list.filter(p=>totalStock(p)===0);
  if(sort==="Precio: menor") list=[...list].sort((a,b)=>a.price-b.price);
  if(sort==="Precio: mayor") list=[...list].sort((a,b)=>b.price-a.price);
  if(sort==="Más vendidos") list=[...list].sort((a,b)=>totalStock(b)-totalStock(a));
  return (<div className="h-full overflow-y-auto">
    <ScreenHead icon="tag" title="Catálogo de productos" right={<span className="text-[12px] text-ink-400 tnum">{list.length} productos</span>}/>
    <Card className="p-3 mb-4">
      <div className="flex gap-2 flex-wrap items-center">
        {cats.map(c=><button key={c} onClick={()=>setCat(c)} className={"h-9 px-4 rounded-full text-[13px] font-medium "+(cat===c?"bg-brand-600 text-white":"bg-surf text-ink-500 hover:text-ink-900")}>{c}</button>)}
        <label className="ml-auto flex items-center gap-2 h-9 px-3 rounded-full bg-surf border border-line min-w-[220px]"><Icon n="search" s={15} cls="text-ink-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por nombre o SKU" className="flex-1 bg-transparent outline-none text-[13px]"/></label>
      </div>
      <div className="flex gap-2 mt-3 flex-wrap items-center">
        <MiniSel label="Color" v={color} set={setColor} opts={allColors}/>
        <MiniSel label="Stock" v={stock} set={setStock} opts={["Todos","Bajo","Sin stock"]}/>
        <MiniSel label="Ordenar" v={sort} set={setSort} opts={["Recientes","Precio: menor","Precio: mayor","Más vendidos"]}/>
      </div>
    </Card>
    <div className="grid grid-cols-4 gap-4">{list.map(p=>{const st=totalStock(p);const low=st>0&&st<30;return(
      <Card key={p.id} className="overflow-hidden hover:border-brand-200 transition-colors group">
        <div style={{background:p.tone}} className="h-40 grid place-items-center relative">
          <Icon n="tag" s={44} cls="text-black/15"/>
          <button onClick={()=>setQuick(p)} className="absolute inset-0 bg-black/0 group-hover:bg-black/5 grid place-items-center opacity-0 group-hover:opacity-100 transition">
            <span className="bg-card/95 text-ink-900 text-[12px] font-medium px-3 py-1.5 rounded-lg shadow-sm">Vista rápida</span></button>
          <span className={"absolute top-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded "+(st===0?"bg-red-100 text-red-600":low?"bg-amber-100 text-amber-700":"bg-card/90 text-brand-700")}>{st===0?"Sin stock":st+" pzas."}</span>
        </div>
        <div className="p-3"><div className="text-[13px] font-semibold text-ink-900 truncate">{p.name}</div><div className="tnum text-[11px] text-ink-400">{p.sku}</div>
          <div className="flex items-center justify-between mt-2"><span className="tnum text-base font-bold text-ink-900">{mx(p.price)}</span><span className="text-[11px] text-ink-400">{p.cat}</span></div>
          <div className="flex gap-1 mt-2">{p.colors.slice(0,5).map(c=><span key={c} style={{background:swatch[c]}} className="w-4 h-4 rounded-full border border-black/10"/>)}</div>
          <button onClick={()=>{setSel(p);go("venta");}} className="w-full h-9 mt-3 rounded-lg bg-brand-100 text-brand-700 text-[13px] font-medium hover:bg-brand-200 inline-flex items-center justify-center gap-1.5"><Icon n="plus" s={15}/>Agregar</button></div>
      </Card>);})}</div>
    {quick&&<Modal title="Vista rápida" onClose={()=>setQuick(null)}>
      <div className="grid grid-cols-[180px_1fr] gap-5">
        <div style={{background:quick.tone}} className="h-48 rounded-2xl grid place-items-center border border-black/5"><Icon n="tag" s={48} cls="text-black/15"/></div>
        <div><h3 className="text-lg font-semibold text-ink-900">{quick.name}</h3><div className="tnum text-[12px] text-ink-400">{quick.sku}</div>
          <div className="tnum text-2xl font-bold text-ink-900 mt-2">{mx(quick.price)}</div>
          <div className="text-[12px] text-brand-600 font-medium">{totalStock(quick)} pzas. disponibles</div>
          <div className="text-[12px] text-ink-500 mt-2">Colores:</div>
          <div className="flex gap-2 mt-1">{quick.colors.map(c=><span key={c} style={{background:swatch[c]}} className="w-7 h-7 rounded-full border border-black/10"/>)}</div>
          <p className="text-[12px] text-ink-500 mt-3 leading-relaxed">{quick.desc}</p>
          <div className="flex gap-2 mt-4"><PrimaryBtn onClick={()=>{setSel(quick);setQuick(null);go("venta");}}><Icon n="plus" s={16}/>Agregar</PrimaryBtn><GhostBtn onClick={()=>{setLabel(quick);setQuick(null);}}><Icon n="barcode" s={16}/>Etiqueta</GhostBtn></div></div>
      </div></Modal>}
    {label&&<LabelModal sku={label} onClose={()=>setLabel(null)}/>}
  </div>);
}
function MiniSel({label,v,set,opts}){return(<label className="flex items-center gap-2 h-9 px-3 rounded-full border border-line text-[12px] text-ink-500">
  <span className="text-ink-400">{label}:</span>
  <select value={v} onChange={e=>set(e.target.value)} className="bg-transparent outline-none text-ink-900 font-medium">{opts.map(o=><option key={o} value={o}>{o}</option>)}</select></label>);}

/* ===================================================== CASH REGISTER ===================================================== */
function CashScreen() {
  const data=useData();
  const denoms=[1000,500,200,100,50,20,10,5,2,1];
  const [shift,setShift]=useState(null);     // turno OPEN o null
  const [totals,setTotals]=useState(null);   // corte en vivo del backend
  const [count,setCount]=useState({});
  const [loading,setLoading]=useState(true);
  const [openFloat,setOpenFloat]=useState("");
  const [blind,setBlind]=useState(false);
  const [mv,setMv]=useState(null);           // tipo de movimiento en curso
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const num=(v)=>Number(v||0);
  const contado=denoms.reduce((a,d)=>a+d*(count[d]||0),0);
  const blindHidden=Boolean(totals?.blindHidden || shift?.blindHidden);
  const expected=blindHidden?null:(totals?num(totals.expectedCash):null);
  const diff=expected==null?null:Math.round((contado-expected)*100)/100;

  const load=async()=>{
    if(!data.online){ setLoading(false); return; }
    setLoading(true);
    try{
      const r=await Retail.getActiveShift();
      if(r.shift){ const s=await Retail.getShiftSummary(r.shift.id); setShift(s.shift||r.shift); setTotals(s.totals||null); }
      else { setShift(null); setTotals(null); }
    }catch(e){ setMsg("No se pudo cargar la caja: "+(e?.message||e)); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[data.online]);

  const doOpen=async()=>{ setBusy(true); setMsg("");
    try{ await Retail.openShift(num(openFloat), blind); setOpenFloat(""); setBlind(false); await load(); }
    catch(e){ setMsg("No se pudo abrir la caja: "+(e?.message||e)); if(e?.status===409) await load(); }
    finally{ setBusy(false); } };
  const doMovement=async(type,amount,reason)=>{ if(!shift||!(amount>0))return; setBusy(true); setMsg("");
    try{ await Retail.cashMovement(shift.id,{type,amount,reason:reason||undefined}); setMv(null); await load(); }
    catch(e){ setMsg("No se pudo registrar el movimiento: "+(e?.message||e)); }
    finally{ setBusy(false); } };
  const doClose=async()=>{ if(!shift)return; setBusy(true); setMsg("");
    try{ const r=await Retail.closeShift(shift.id, contado); const sh=r.shift||{};
      setMsg(sh.blindHidden ? "Turno cerrado. El esperado y la diferencia los revisa un supervisor."
        : `Turno cerrado. Esperado ${mx(num(sh.expectedCash))} · Contado ${mx(contado)} · Diferencia ${mx(num(sh.difference))}.`);
      setCount({}); await load();
    }catch(e){ setMsg(e?.status===403 ? "Necesitas permiso de encargado/gerente para cerrar el turno."
        : "No se pudo cerrar el turno: "+(e?.message||e)); }
    finally{ setBusy(false); } };

  const Banner=()=> msg ? <div className="text-[12px] text-ink-700 bg-surf border border-line rounded-lg px-3 py-2 mb-3 text-center">{msg}</div> : null;

  // Sin backend no hay caja: el turno y el corte son datos del servidor.
  if(!data.online){
    return (<div className="h-full overflow-y-auto"><ScreenHead icon="wallet" title="Caja / corte de caja"/>
      <Card className="flex flex-col items-center justify-center text-center py-20">
        <div className="w-16 h-16 rounded-full bg-amber-50 grid place-items-center text-amber-500 mb-4"><Icon n="wallet" s={30}/></div>
        <div className="text-lg font-semibold text-ink-900">Caja sin conexión</div>
        <p className="text-ink-500 mt-1 max-w-sm">El corte de caja necesita conexión al backend. Inicia sesión con tu PIN en una tienda real para abrir, registrar movimientos y cerrar el turno.</p>
      </Card></div>);
  }
  if(loading){
    return (<div className="h-full overflow-y-auto"><ScreenHead icon="wallet" title="Caja / corte de caja"/>
      <Card className="py-20 grid place-items-center"><div className="w-7 h-7 rounded-full border-2 border-line border-t-brand-500 animate-spin"/></Card></div>);
  }

  // Sin turno abierto → abrir caja.
  if(!shift){
    return (<div className="h-full overflow-y-auto"><ScreenHead icon="wallet" title="Caja / corte de caja"/>
      <Card className="max-w-md mx-auto p-6 mt-4">
        <div className="text-center mb-5"><div className="w-14 h-14 mx-auto rounded-full bg-brand-50 grid place-items-center text-brand-600 mb-2"><Icon n="wallet" s={26}/></div>
          <div className="text-lg font-semibold text-ink-900">No hay caja abierta</div>
          <p className="text-[13px] text-ink-500 mt-1">Abre un turno para que las ventas entren al corte.</p></div>
        <Banner/>
        <Fld label="Fondo inicial en efectivo">
          <input value={openFloat} onChange={e=>setOpenFloat(e.target.value.replace(/[^\d.]/g,""))} inputMode="decimal" placeholder="0.00"
            className="w-full h-11 rounded-xl border border-line bg-surf px-3 text-right tnum text-lg outline-none focus:border-brand-500"/>
        </Fld>
        <div className="flex items-center justify-between py-3 border-t border-line mt-1">
          <div><div className="text-[13px] font-medium text-ink-900">Corte ciego</div><div className="text-[11px] text-ink-400">El cajero no ve el esperado al cerrar</div></div>
          <Toggle on={blind} set={setBlind}/></div>
        <PrimaryBtn className="w-full mt-3" onClick={busy?undefined:doOpen}><Icon n="check" s={18}/>{busy?"Abriendo…":"Abrir caja"}</PrimaryBtn>
      </Card></div>);
  }

  // Turno abierto → corte en vivo.
  const ventasTotal=totals?num(totals.totalCashSales)+num(totals.totalCardSales)+num(totals.totalTransferSales):0;
  return (<div className="h-full overflow-y-auto">
    <ScreenHead icon="wallet" title="Caja / corte de caja" right={<span className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl bg-brand-50 text-brand-700 text-[13px] font-medium border border-brand-100"><Icon n="clock" s={15}/>Turno abierto{shift.openedByName?" · "+shift.openedByName:""}</span>}/>
    <Banner/>
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
      <div className="space-y-4">
        {blindHidden ? (
          <Card className="p-4 text-[13px] text-ink-500 flex items-center gap-2"><Icon n="lock" s={16} cls="text-amber-500"/>Corte ciego: las ventas y el esperado los revisa un supervisor.</Card>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {[["Efectivo",num(totals?.totalCashSales),"cash"],["Tarjeta",num(totals?.totalCardSales),"card"],["Transferencia",num(totals?.totalTransferSales),"swap"],["Total ventas",ventasTotal,"chart"]].map(([k,v,ic])=>(
              <Card key={k} className="p-4 min-w-0"><div className="flex items-center gap-1.5 text-[11px] text-ink-400 min-w-0"><Icon n={ic} s={14} cls="text-brand-600 shrink-0"/><span className="truncate">{k}</span></div>
                <div className="tnum text-base font-bold text-ink-900 mt-1">{mx(v)}</div></Card>))}
          </div>
        )}
        <Card className="p-5"><div className="flex items-center justify-between mb-3"><div className="font-semibold text-ink-900">Movimientos del turno</div><span className="text-[11px] text-ink-400">{totals?.salesCount??0} ventas</span></div>
          <div className="flex items-center gap-3 py-2.5 border-b border-line">
            <div className="w-8 h-8 rounded-lg grid place-items-center bg-brand-50 text-brand-600"><Icon n="wallet" s={15}/></div>
            <div className="flex-1"><div className="text-[13px] text-ink-900">Fondo inicial</div></div>
            <span className="tnum font-medium text-ink-900">{mx(num(shift.openingFloat))}</span></div>
          {(shift.movements||[]).map((m,i)=>{const neg=m.type==="CASH_OUT"||m.type==="EXPENSE";const label=m.type==="CASH_IN"?"Entrada":m.type==="EXPENSE"?"Gasto":"Salida";return(
            <div key={m.id||i} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
              <div className={"w-8 h-8 rounded-lg grid place-items-center "+(neg?"bg-red-50 text-red-500":"bg-brand-50 text-brand-600")}><Icon n={m.type==="CASH_IN"?"plus":m.type==="EXPENSE"?"file":"minus"} s={15}/></div>
              <div className="flex-1"><div className="text-[13px] text-ink-900">{label}</div>{m.reason&&<div className="text-[11px] text-ink-400">{m.reason}</div>}</div>
              <span className={"tnum font-medium "+(neg?"text-red-500":"text-ink-900")}>{neg?"- ":"+ "}{mx(num(m.amount))}</span></div>);})}
          {!(shift.movements||[]).length && <div className="text-[12px] text-ink-400 py-2">Sin entradas, salidas ni gastos.</div>}
          <div className="flex gap-2 mt-3">
            <GhostBtn className="flex-1" onClick={()=>{setMsg("");setMv("CASH_IN");}}><Icon n="plus" s={15}/>Entrada</GhostBtn>
            <GhostBtn className="flex-1" onClick={()=>{setMsg("");setMv("CASH_OUT");}}><Icon n="minus" s={15}/>Salida</GhostBtn>
            <GhostBtn className="flex-1" onClick={()=>{setMsg("");setMv("EXPENSE");}}><Icon n="file" s={15}/>Gasto</GhostBtn>
          </div>
          {!blindHidden && <div className="flex items-center justify-between py-3 mt-3 border-t-2 border-line"><span className="font-semibold text-ink-900">Esperado en efectivo</span><span className="tnum text-xl font-bold text-brand-600">{expected==null?"—":mx(expected)}</span></div>}
        </Card>
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Conteo de efectivo</div>
          <div className="grid grid-cols-5 gap-3">{denoms.map(d=>(<div key={d}><div className="text-[11px] text-ink-400 mb-1 tnum">${d}</div>
            <input type="number" min="0" value={count[d]||""} onChange={e=>setCount(c=>({...c,[d]:Math.max(0,parseInt(e.target.value)||0)}))} placeholder="0"
              className="w-full h-10 px-2 rounded-lg border border-line text-center tnum text-sm outline-none focus:border-brand-500"/></div>))}</div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Cierre de turno</div>
          {!blindHidden && <div className="flex items-center justify-between text-[13px] py-1"><span className="text-ink-500">Esperado</span><span className="tnum font-medium">{expected==null?"—":mx(expected)}</span></div>}
          <div className="flex items-center justify-between text-[13px] py-1"><span className="text-ink-500">Contado</span><span className="tnum font-medium">{mx(contado)}</span></div>
          {!blindHidden && diff!=null && <div className={"flex items-center justify-between p-3 rounded-xl mt-2 text-[13px] "+(diff===0?"bg-brand-50 border border-brand-100":"bg-amber-50 border border-amber-100")}>
            <span className={"font-medium "+(diff===0?"text-brand-700":"text-amber-700")}>Diferencia</span>
            <span className={"tnum font-bold "+(diff===0?"text-brand-700":"text-amber-700")}>{diff<0?"- ":diff>0?"+ ":""}{mx(Math.abs(diff))}</span></div>}
          {blindHidden && <div className="text-[11px] text-ink-400 mt-2">Corte ciego: cuenta el efectivo y cierra; el supervisor verá el esperado y la diferencia.</div>}
          <PrimaryBtn className="w-full mt-4" onClick={busy?undefined:doClose}><Icon n="check" s={16}/>{busy?"Cerrando…":"Cerrar turno"}</PrimaryBtn>
        </Card>
      </div>
    </div>
    {mv && <MovementModal type={mv} busy={busy} onClose={()=>setMv(null)} onOk={doMovement}/>}
  </div>);
}

function MovementModal({ type, busy, onClose, onOk }){
  const [amt,setAmt]=useState(""); const [reason,setReason]=useState("");
  const title=type==="CASH_IN"?"Entrada de efectivo":type==="EXPENSE"?"Registrar gasto":"Salida de efectivo";
  const amount=Math.round(Number(amt||0)*100)/100;
  return (<Modal title={title} onClose={onClose}>
    <Fld label="Monto">
      <input value={amt} onChange={e=>setAmt(e.target.value.replace(/[^\d.]/g,""))} inputMode="decimal" placeholder="0.00" autoFocus
        className="w-full h-11 rounded-xl border border-line bg-surf px-3 text-right tnum text-lg outline-none focus:border-brand-500"/>
    </Fld>
    <Fld label="Motivo (opcional)">
      <input value={reason} onChange={e=>setReason(e.target.value)} placeholder={type==="EXPENSE"?"Ej. limpieza, papelería":"Ej. cambio / feria"}
        className="w-full h-10 px-3 rounded-lg border border-line text-sm outline-none focus:border-brand-500"/>
    </Fld>
    <div className="flex gap-2 mt-4"><GhostBtn className="flex-1" onClick={onClose}>Cancelar</GhostBtn>
      <PrimaryBtn className="flex-1" onClick={()=>{ if(amount>0) onOk(type,amount,reason); }}><Icon n="check" s={16}/>{busy?"Guardando…":"Registrar"}</PrimaryBtn></div>
  </Modal>);
}

/* ===================================================== SIMPLE SCREENS ===================================================== */
/**
 * Devoluciones — contra el backend real (POST /sales/:id/return).
 *
 * Antes era una maqueta: un ticket fijo de "María Fernanda López", casillas por
 * artículo y tipos "Cambio por talla / Nota de crédito". Nada de eso existe:
 * `reverseRetailSale` revierte la venta COMPLETA (COMPLETED → RETURNED) y repone
 * el stock de todas sus líneas. No hay devolución parcial, ni cambios, ni notas
 * de crédito. Ofrecerlos era prometer lo que el servidor no puede cumplir, y el
 * botón además no llamaba a nada.
 *
 * Lo que sí hace el backend y esta pantalla respeta:
 *  · Un solo tiro: el flip de estado es condicional ⇒ el 2º intento da 409 en
 *    vez de reponer stock dos veces. Por eso el error de 409 se muestra tal cual.
 *  · Exige rol de administrador ⇒ un cajero recibe 403; se dice, no se esconde.
 */
function ReturnsScreen() {
  const [sales,setSales]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [q,setQ]=useState("");
  const [selId,setSelId]=useState(null);
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true); setErr("");
    try{ const r=await Retail.fetchSales(40); setSales(Array.isArray(r)?r:[]); }
    catch(e){ setErr(e?.message||"No se pudieron cargar las ventas."); setSales([]); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const list=sales.filter(s=>!q||[s.folio,s.customerName].filter(Boolean).join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const sel=sales.find(s=>s.id===selId)||null;
  const puede=sel?.status==="COMPLETED";

  async function doReturn(){
    if(!sel||!puede) return;
    const n=sel.lines?.length||0;
    if(!confirm(`¿Devolver COMPLETA la venta ${sel.folio} por ${mx(Number(sel.total))}?\n\nEl backend no hace devoluciones parciales: se revierte entera y se repone el stock de sus ${n} línea(s). No se puede deshacer.`)) return;
    setBusy(true); setErr("");
    try{
      await Retail.returnSale(sel.id, notes.trim()||undefined);
      setNotes(""); setSelId(null);
      await load();
    }catch(e){
      setErr(
        e?.status===409 ? `La venta ${sel.folio} ya fue devuelta o cancelada.` :
        e?.status===403 ? "Tu usuario no puede devolver ventas: hace falta un administrador." :
        (e?.message||"No se pudo devolver la venta.")
      );
    }finally{ setBusy(false); }
  }

  const badge=(st)=>st==="RETURNED"?["Devuelta","bg-amber-100 text-amber-700"]
    :st==="CANCELLED"?["Cancelada","bg-red-100 text-red-600"]
    :["Cobrada","bg-brand-100 text-brand-700"];

  return (<div className="h-full overflow-y-auto"><ScreenHead icon="return" title="Devoluciones"
    right={<GhostBtn onClick={load}>{loading?"Cargando…":"Actualizar"}</GhostBtn>}/>
    <Card className="p-4 mb-4"><label className="flex items-center gap-3 h-12 px-4 rounded-xl bg-surf border border-line max-w-2xl">
      <Icon n="search" s={18} cls="text-ink-400"/>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por folio o cliente" className="flex-1 bg-transparent outline-none text-sm"/>
    </label></Card>

    {err&&<Card className="p-3 mb-4 border-red-200 bg-red-50"><div className="text-[13px] text-red-600">{err}</div></Card>}

    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
      <Card className="overflow-hidden">
        <div className="px-5 py-3 font-semibold text-ink-900 border-b border-line">Ventas recientes</div>
        {loading?<div className="py-10 text-center text-[13px] text-ink-400">Cargando ventas…</div>
        :list.length===0?<div className="py-10 text-center text-[13px] text-ink-400">{sales.length===0?"Aún no hay ventas registradas.":"Ninguna venta coincide."}</div>
        :<table className="w-full text-[12px]"><thead><tr className="bg-surf text-ink-400 uppercase text-[10px]">
          {["Folio","Fecha","Cliente","Artículos","Estado","Total"].map(h=><th key={h} className="text-left py-2.5 px-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{list.map(s=>{const [lbl,cls]=badge(s.status);const on=s.id===selId;return(
            <tr key={s.id} onClick={()=>setSelId(s.id)} className={"border-t border-line cursor-pointer "+(on?"bg-brand-50":"hover:bg-surf")}>
              <td className="tnum px-3 py-2.5 text-ink-700">{s.folio}</td>
              <td className="tnum px-3 text-ink-500">{new Date(s.createdAt).toLocaleDateString()}</td>
              <td className="px-3 text-ink-700">{s.customerName||"Mostrador"}</td>
              <td className="tnum px-3 text-ink-500">{s.lines?.length||0}</td>
              <td className="px-3"><span className={"text-[11px] px-2 py-0.5 rounded "+cls}>{lbl}</span></td>
              <td className="tnum px-3 font-medium text-ink-900">{mx(Number(s.total))}</td>
            </tr>);})}</tbody></table>}
      </Card>

      <Card className="p-5 self-start">
        {!sel?<div className="py-8 text-center text-[13px] text-ink-400">Elige una venta de la lista para devolverla.</div>:<>
          <div className="font-semibold text-ink-900">Venta {sel.folio}</div>
          <div className="text-[12px] text-ink-400 mb-3">{new Date(sel.createdAt).toLocaleString()}</div>
          <div className="max-h-52 overflow-y-auto -mx-1 px-1">
            {(sel.lines||[]).map(l=>(<div key={l.id} className="flex items-start gap-2 py-2 border-t border-line first:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-ink-900 truncate">{l.productName}</div>
                <div className="tnum text-[11px] text-ink-400">{l.skuCode} · {Number(l.quantity)} × {mx(Number(l.unitPrice))}</div>
              </div>
              <div className="tnum text-[13px] font-semibold shrink-0">{mx(Number(l.subtotal))}</div>
            </div>))}
          </div>
          <div className="flex justify-between pt-2 mt-1 border-t border-line text-[13px]">
            <span className="font-medium text-ink-900">A devolver</span>
            <span className="tnum font-bold text-red-500">- {mx(Number(sel.total))}</span>
          </div>
          {puede?<>
            <div className="mt-3"><Fld label="Motivo (opcional)">
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Producto defectuoso"
                className="w-full h-10 px-3 rounded-lg border border-line text-sm outline-none focus:border-brand-500"/>
            </Fld></div>
            <div className="rounded-xl bg-surf border border-line p-3 text-[12px] text-ink-500 mb-3">
              Se devuelve la venta <b className="text-ink-900">completa</b> y su stock vuelve al inventario.
            </div>
            {/* GateBtn pide PIN de supervisor si el cajero no tiene el permiso;
                el backend igual exige administrador y responde 403 si no. */}
            <GateBtn className="w-full" perm="process_return" onClick={busy?()=>{}:doReturn}>
              {busy?"Devolviendo…":"Devolver venta completa"}
            </GateBtn>
          </>:<div className="mt-3 rounded-xl bg-surf border border-line p-3 text-[12px] text-ink-500">
            Esta venta ya está <b className="text-ink-900">{sel.status==="RETURNED"?"devuelta":"cancelada"}</b>. Solo se puede revertir una venta cobrada.
          </div>}
        </>}
      </Card>
    </div></div>);
}
function Toggle({on,set}){return(<button onClick={()=>set(!on)} className={"w-11 h-6 rounded-full transition-colors relative "+(on?"bg-brand-600":"bg-line")}>
  <span className={"absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-all "+(on?"left-[22px]":"left-0.5")}/></button>);}
function SetRow({label,sub,children}){return(<div className="flex items-center justify-between py-3 border-t border-line first:border-0">
  <div><div className="text-[13px] font-medium text-ink-900">{label}</div>{sub&&<div className="text-[11px] text-ink-400">{sub}</div>}</div>{children}</div>);}
function TInput({v}){return <input defaultValue={v} className="h-9 px-3 rounded-lg border border-line text-[13px] outline-none focus:border-brand-500 min-w-[200px]"/>;}

function SettingsScreen({ theme, setTheme }) {
  const groups=[["Datos de tienda","store"],["Sucursales","store"],["Cajeros y roles","users"],["Impresora térmica","printer"],["Cajón de dinero","wallet"],["Lector de código","scan"],["Impuestos","file"],["Métodos de pago","card"],["Ticket y logo","tag"],["Apariencia","gear"],["Seguridad con PIN","gear"],["Acerca de","info"]];
  const [sel,setSel]=useState(0);
  const [tg,setTg]=useState({drawer:true,scan:true,dark:false,sound:true,cfdi:true,pin:true,iva:true,msi:true});
  const t=(k)=>setTg(s=>({...s,[k]:!s[k]}));
  const panels={
    0:<><SectionTitle t="Datos de tienda"/><SetRow label="Nombre comercial"><TInput v="Mi Tienda"/></SetRow><SetRow label="Razón social"><TInput v="Mi Empresa S.A. de C.V."/></SetRow><SetRow label="RFC"><TInput v="XAXX010101000"/></SetRow><SetRow label="Teléfono"><TInput v="55 1234 0000"/></SetRow><SetRow label="Dirección"><TInput v="Av. Principal 100, Centro"/></SetRow></>,
    3:<><SectionTitle t="Impresora térmica"/><SetRow label="Impresora" sub="Conectada por USB"><span className="text-[12px] text-brand-600 font-medium">EPSON TM-T20III ●</span></SetRow><SetRow label="Ancho de papel"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">80 mm ⌄</span></SetRow><SetRow label="Imprimir automáticamente" sub="Al completar la venta"><Toggle on={tg.sound} set={()=>t("sound")}/></SetRow><SetRow label="Copias por ticket"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">1 ⌄</span></SetRow><GhostBtn className="mt-4"><Icon n="printer" s={16}/>Imprimir página de prueba</GhostBtn></>,
    4:<><SectionTitle t="Cajón de dinero"/><SetRow label="Cajón conectado" sub="Pulso por impresora"><Toggle on={tg.drawer} set={()=>t("drawer")}/></SetRow><SetRow label="Abrir al cobrar en efectivo"><Toggle on={tg.drawer} set={()=>t("drawer")}/></SetRow><SetRow label="Requiere PIN para abrir manualmente"><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><GhostBtn className="mt-4"><Icon n="wallet" s={16}/>Probar apertura</GhostBtn></>,
    5:<><SectionTitle t="Lector de código de barras"/><SetRow label="Lector habilitado" sub="Modo teclado (HID)"><Toggle on={tg.scan} set={()=>t("scan")}/></SetRow><SetRow label="Prefijo de escaneo"><TInput v="(ninguno)"/></SetRow><SetRow label="Sonido al escanear"><Toggle on={tg.sound} set={()=>t("sound")}/></SetRow><div className="mt-4 p-3 rounded-xl bg-surf border border-line text-[12px] text-ink-500">Escanea cualquier código para probar la lectura…</div></>,
    6:<><SectionTitle t="Impuestos"/><SetRow label="IVA habilitado" sub="16% general"><Toggle on={tg.iva} set={()=>t("iva")}/></SetRow><SetRow label="Tasa de IVA"><TInput v="16%"/></SetRow><SetRow label="Precios incluyen IVA"><Toggle on={tg.iva} set={()=>t("iva")}/></SetRow><SetRow label="Facturación CFDI 4.0"><Toggle on={tg.cfdi} set={()=>t("cfdi")}/></SetRow></>,
    7:<><SectionTitle t="Métodos de pago"/>{[["Efectivo","cash",true],["Tarjeta (terminal)","card",true],["QR / Pago","qr",true],["Transferencia SPEI","swap",true],["Meses sin intereses","card",tg.msi]].map(([m,ic])=>(<SetRow key={m} label={<span className="flex items-center gap-2"><Icon n={ic} s={16} cls="text-ink-400"/>{m}</span>}><Toggle on={m==="Meses sin intereses"?tg.msi:true} set={()=>m==="Meses sin intereses"&&t("msi")}/></SetRow>))}</>,
    9:<><SectionTitle t="Apariencia"/><SetRow label="Tema oscuro" sub="Cambia toda la interfaz"><Toggle on={theme==="dark"} set={()=>setTheme(theme==="dark"?"light":"dark")}/></SetRow><SetRow label="Color de acento"><div className="flex gap-2">{["#f97316","#2563eb","#7c3aed","#dc2626"].map(c=><span key={c} style={{background:c}} className={"w-7 h-7 rounded-full border-2 "+(c==="#f97316"?"border-ink-900":"border-transparent")}/>)}</div></SetRow><SetRow label="Densidad de la interfaz"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">Cómoda ⌄</span></SetRow></>,
    10:<><SectionTitle t="Seguridad con PIN"/><SetRow label="Requiere PIN al iniciar" ><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><SetRow label="PIN para descuentos > 20%"><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><SetRow label="PIN para cancelaciones"><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><SetRow label="Cerrar sesión por inactividad"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">10 min ⌄</span></SetRow></>,
    11:<AboutPanel/>,
  };
  const generic=(name)=><><SectionTitle t={name}/><div className="py-10 text-center text-ink-400 text-sm">Configuración de <span className="font-medium text-ink-600">{name}</span> · pendiente.</div></>;
  return (<div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4 h-full">
    <Card className="p-2 overflow-y-auto">{groups.map(([g,ic],i)=>(<button key={g} onClick={()=>setSel(i)} className={"w-full flex items-center gap-3 h-11 px-3 rounded-xl text-left text-[13px] font-medium mb-0.5 "+(sel===i?"bg-brand-100 text-brand-700":"text-ink-600 hover:bg-surf")}>
      <Icon n={ic} s={18}/>{g}</button>))}</Card>
    <div className="overflow-y-auto"><ScreenHead icon="gear" title="Configuración"/>
      <Card className="p-6 max-w-3xl">{panels[sel]||generic(groups[sel][0])}
        {/* "Acerca de" es de solo lectura: no lleva Guardar/Cancelar. */}
        {sel!==11 && <div className="flex gap-2 mt-6 pt-4 border-t border-line"><PrimaryBtn>Guardar cambios</PrimaryBtn><GhostBtn>Cancelar</GhostBtn></div>}</Card></div>
  </div>);
}
function SectionTitle({t}){return <div className="text-base font-semibold text-ink-900 mb-2">{t}</div>;}

// Panel "Acerca de" de Configuración: verificar la versión y forzar una búsqueda
// de actualización a mano, sin esperar al chequeo automático del arranque.
function AboutPanel(){
  const { ota, checkOta }=useData();
  const s=OTA_UI[ota?.status];
  const busy=ota?.status==="checking"||ota?.status==="downloading";
  // En web/APK no hay updater de escritorio: se muestra la versión, pero no el
  // botón que no haría nada.
  const canUpdate=typeof checkOta==="function" && ota?.status!=="unsupported";
  return (
    <>
      <SectionTitle t="Acerca de"/>
      <div className="flex items-center gap-4 py-2">
        {/* Logo en pildora oscura (el PNG trae su fondo negro). */}
        <div className="shrink-0 rounded-xl px-3 py-2.5" style={{ background:"#0a090a" }}>
          <img src="/mrtpv-logo.png" alt="MRTPV Retail" className="h-8 w-auto block"/>
        </div>
        <div>
          <div className="text-[13px] font-semibold text-ink-500">Punto de venta</div>
          <div className="text-[12px] text-ink-400 tnum">Versión {APP_VERSION}</div>
        </div>
      </div>

      {s && (
        <div className="flex items-center gap-2 mt-2 text-[13px] text-ink-600">
          <span className={"w-2 h-2 rounded-full "+(s.pulse?"animate-pulse":"")} style={{ background:s.dot }}/>
          {s.label}
        </div>
      )}
      {ota?.status==="error" && ota?.error && (
        <div className="mt-1 text-[11px] text-ink-400">{ota.error}</div>
      )}

      <div className="mt-5 pt-4 border-t border-line">
        {canUpdate ? (
          <GhostBtn onClick={busy?undefined:checkOta} className={busy?"opacity-60 pointer-events-none":""}>
            {busy
              ? <><span className="w-4 h-4 rounded-full border-2 border-ink-300 border-t-brand-500 animate-spin"/>{ota.status==="downloading"?"Instalando…":"Buscando…"}</>
              : <><Icon n="info" s={16}/>Buscar actualización</>}
          </GhostBtn>
        ) : (
          <div className="text-[12px] text-ink-400">
            Las actualizaciones automáticas solo están disponibles en la app de escritorio.
          </div>
        )}
      </div>
    </>
  );
}

/* ============================== DATA LAYER (backend real) ============================== */
const DataCtx = createContext(null);
function useData(){ return useContext(DataCtx) || { products:[], online:false, session:null, giro:DEFAULT_GIRO }; }
// El catálogo es el que manda el backend, y punto. Sin productos ⇒ lista vacía:
// no hay catálogo de relleno. Inventarse uno cuando una tienda real se queda sin
// datos (fetch fallido o catálogo vacío) es peor que no mostrar nada — el cajero
// veía camisas de lino con "En stock: 68 pzas." que no existen.
// Constante a nivel de módulo, no un `[]` literal: `useProducts` alimenta un
// efecto con dependencia [products], y un array nuevo por render lo dispararía
// en cada uno.
const NO_PRODUCTS = [];
function useProducts(){
  const d=useContext(DataCtx);
  if(d && d.products && d.products.length) return d.products;
  return NO_PRODUCTS;
}
// Resuelve el skuId real de una variante color/talla.
function resolveSkuId(p, color, size){
  if(!p || !p.live || !p.skuByVariant) return undefined;
  return p.skuByVariant[color+"::"+size] || Object.values(p.skuByVariant)[0] || undefined;
}

function BootSplash(){
  return (<div className="h-full grid place-items-center bg-body">
    <div className="text-center">
      <div className="text-2xl font-bold tracking-tight text-ink-900">MRT<span className="text-brand-600">PV</span> Retail</div>
      <div className="text-[10px] tracking-[0.28em] text-ink-400 mt-1">SMART RETAIL FLOW</div>
      <div className="mt-5 w-6 h-6 mx-auto rounded-full border-2 border-line border-t-brand-500 animate-spin"/>
    </div></div>);
}

// Estado del auto-updater OTA en texto + color. `unsupported` (web/APK) y `idle`
// no pintan línea: ahí no hay updater de escritorio que reportar.
const OTA_UI = {
  checking:    { label:"Buscando actualización…",     dot:"var(--warn, #f59e0b)", pulse:true  },
  downloading: { label:"Instalando actualización…",   dot:"var(--brand-600, #ea580c)", pulse:true  },
  uptodate:    { label:"Estás en la última versión",  dot:"#22c55e", pulse:false },
  error:       { label:"Sin conexión para actualizar", dot:"#94a3b8", pulse:false },
};

// Pie de las pantallas de acceso: logo mrtpvrest + versión + estado del updater.
// Sirve para verificar en pantalla —sin abrir nada— en qué versión está la caja y
// si ya tomó la última. En web/APK muestra solo la versión (el updater de
// escritorio no aplica ahí).
function VersionBadge({ ota }){
  const s = OTA_UI[ota?.status];
  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      {/* Logo sobre pildora oscura: el PNG trae fondo negro propio, asi que la
          pildora del mismo tono lo enmarca sin bordes duros sobre el fondo claro
          — coherente con el sidebar oscuro del admin. */}
      <div className="rounded-xl px-2.5 py-1.5" style={{ background:"#0a090a" }}>
        <img src="/mrtpv-logo.png" alt="MRTPV Retail" className="h-6 w-auto block"/>
      </div>
      <div className="text-[11px] text-ink-400 tnum">MRTPV Retail v{APP_VERSION}</div>
      {s && (
        <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <span className={"w-1.5 h-1.5 rounded-full "+(s.pulse?"animate-pulse":"")} style={{ background:s.dot }}/>
          {s.label}
        </div>
      )}
    </div>
  );
}

// Setup de dispositivo (estilo TPV): login admin → elegir sucursal → vincular.
function SetupScreen({ ota, onLinked }){
  const [step,setStep]=useState("login");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [rName,setRName]=useState(""); const [oName,setOName]=useState("");
  const [rGiro,setRGiro]=useState(DEFAULT_GIRO);
  const [url,setUrl]=useState(""); const [cfg,setCfg]=useState(false);
  const [ws,setWs]=useState([]);
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  useEffect(()=>{ setUrl(getApiUrl()); },[]);
  const doLogin=async()=>{
    setErr("");
    if(!email.trim()||!password){ setErr("Ingresa correo y contraseña."); return; }
    setBusy(true);
    try{
      if(url.trim()) setApiUrl(url.trim());
      await Retail.adminLogin(email.trim(), password);
      const list=await Retail.fetchWorkspaces();
      if(!list.length){ setErr("Tu usuario no tiene sucursales."); setBusy(false); return; }
      setWs(list); setStep("location");
    }catch(e){ setErr(e?.status===401||e?.status===400?"Correo o contraseña incorrectos.":(e?.message||"No se pudo conectar.")); }
    finally{ setBusy(false); }
  };
  const doRegister=async()=>{
    setErr("");
    if(!rName.trim()||!oName.trim()||!email.trim()){ setErr("Completa todos los datos."); return; }
    if(password.length<8){ setErr("La contraseña debe tener mínimo 8 caracteres."); return; }
    setBusy(true);
    try{
      if(url.trim()) setApiUrl(url.trim());
      await Retail.registerTenant({ restaurantName:rName.trim(), ownerName:oName.trim(), email:email.trim(), password, giro:rGiro });
      onLinked();
    }catch(e){ setErr(e?.status===409?"Ese correo o nombre de tienda ya existe.":(e?.message||"No se pudo crear la cuenta.")); }
    finally{ setBusy(false); }
  };
  const pick=(w)=>{ Retail.linkLocation(w); onLinked(); };
  const fld=(label,el)=>(<div><div className="text-[11px] text-ink-500 mb-1">{label}</div>{el}</div>);
  const inputCls="w-full h-11 rounded-xl border border-line bg-surf px-3 text-sm outline-none focus:border-brand-500";
  return (<div className="h-full grid place-items-center bg-body p-6 overflow-y-auto">
    <div className="w-full max-w-[400px] py-6">
      <div className="text-center mb-6">
        <div className="text-3xl font-bold tracking-tight text-ink-900">MRT<span className="text-brand-600">PV</span> Retail</div>
        <div className="text-[10px] tracking-[0.28em] text-ink-400 mt-1">SMART RETAIL FLOW</div>
      </div>
      <div className="bg-card border border-line rounded-2xl shadow-sm p-6">
        {step==="login" && (<>
          <div className="text-[15px] font-semibold text-ink-900 text-center">Configurar dispositivo</div>
          <div className="text-[12px] text-ink-400 text-center mt-1 mb-5">Inicia sesión con tu cuenta de administrador</div>
          {err && <div className="text-[12px] text-red-500 text-center mb-3">{err}</div>}
          <div className="space-y-3">
            {fld("Correo",<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="admin@tunegocio.com" className={inputCls}/>)}
            {fld("Contraseña",<input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" onKeyDown={e=>{if(e.key==="Enter")doLogin();}} className={inputCls}/>)}
          </div>
          <button onClick={doLogin} disabled={busy} className="w-full h-12 mt-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy?<span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"/>:<><Icon n="check" s={16} c="#fff"/>Continuar</>}</button>
          <button onClick={()=>setCfg(c=>!c)} className="w-full mt-3 text-[11px] text-ink-400 hover:text-ink-700 flex items-center justify-center gap-1.5"><Icon n="gear" s={13}/>Configurar conexión</button>
          {cfg && <div className="mt-3 pt-3 border-t border-line">{fld("URL del backend",<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://api.mrtpvrest.com" className="w-full h-9 rounded-lg border border-line bg-surf px-3 text-[12px] outline-none focus:border-brand-500"/>)}</div>}
          <div className="text-center mt-4 pt-4 border-t border-line text-[12px] text-ink-400">¿Tienda nueva? <button onClick={()=>{setErr(""); setStep("register");}} className="text-brand-600 font-medium">Crear cuenta</button></div>
        </>)}
        {step==="register" && (<>
          <div className="text-[15px] font-semibold text-ink-900 text-center">Crear tu tienda</div>
          <div className="text-[12px] text-ink-400 text-center mt-1 mb-5">Hasta 6 meses gratis · sin tarjeta</div>
          {err && <div className="text-[12px] text-red-500 text-center mb-3">{err}</div>}
          <div className="space-y-3">
            {/* El giro se elige AQUÍ y no después: decide los labels de todo el
                catálogo, así que capturar SKUs antes de fijarlo obligaría a
                releer atributos con los nombres equivocados. Cambiable luego
                desde el admin. */}
            {fld("¿Qué vendes?",
              <div className="grid grid-cols-3 gap-2">
                {Object.values(GIROS_UI).map(g=>(
                  <button key={g.id} type="button" onClick={()=>setRGiro(g.id)}
                    className={"h-11 rounded-xl border text-[12px] font-medium transition-colors "+(rGiro===g.id?"border-brand-600 bg-brand-50 text-brand-700":"border-line text-ink-600 hover:bg-surf")}>
                    {g.label}
                  </button>))}
              </div>)}
            {fld("Nombre de la tienda",<input value={rName} onChange={e=>setRName(e.target.value)} placeholder={GIROS_UI[rGiro]?.storePlaceholder||"Boutique Aurora"} className={inputCls}/>)}
            {fld("Tu nombre",<input value={oName} onChange={e=>setOName(e.target.value)} placeholder="Tu nombre" className={inputCls}/>)}
            {fld("Correo",<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="tu@correo.com" className={inputCls}/>)}
            {fld("Contraseña",<input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="mínimo 8 caracteres" onKeyDown={e=>{if(e.key==="Enter")doRegister();}} className={inputCls}/>)}
          </div>
          <button onClick={doRegister} disabled={busy} className="w-full h-12 mt-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy?<span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"/>:<><Icon n="store" s={16} c="#fff"/>Crear cuenta</>}</button>
          <button onClick={()=>{setErr(""); setStep("login");}} className="w-full mt-3 text-[11px] text-ink-400 hover:text-ink-700">← Ya tengo cuenta</button>
        </>)}
        {step==="location" && (<>
          <div className="text-[15px] font-semibold text-ink-900 text-center">Elige la sucursal</div>
          <div className="text-[12px] text-ink-400 text-center mt-1 mb-4">Este dispositivo quedará ligado a la tienda seleccionada</div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {ws.map(w=>(
              <button key={w.id} onClick={()=>pick(w)} className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-line hover:border-brand-500 hover:bg-brand-50 text-left transition-colors">
                <div className="min-w-0"><div className="text-[14px] font-semibold text-ink-900 truncate">{w.name}</div>
                  <div className="text-[11px] text-ink-400 truncate">{w.restaurantName}</div></div>
                <span className={"text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 "+(w.businessType==="RETAIL"?"bg-brand-100 text-brand-700":"bg-surf text-ink-400")}>{w.businessType}</span>
              </button>))}
          </div>
          <button onClick={()=>setStep("login")} className="w-full mt-4 text-[11px] text-ink-400 hover:text-ink-700">← Volver</button>
        </>)}
      </div>
      <VersionBadge ota={ota}/>
    </div>
  </div>);
}

function LoginScreen({ ota, onLogin, onRelink }){
  const [pin,setPin]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [loc,setLoc]=useState({location:"",restaurant:""});
  const [hint,setHint]=useState(null);
  useEffect(()=>{ setLoc(Retail.getLinkedName()); setHint(Retail.takeDefaultPinHint()); },[]);
  const submit=async()=>{
    setErr("");
    if(pin.length<4){ setErr("Ingresa tu PIN de 4 dígitos."); return; }
    setBusy(true);
    try{
      const emp=await Retail.loginPin(pin, getTenant().locationId||"");
      await onLogin(emp);
    }catch(e){
      setErr(e?.status===401 || e?.status===400 ? "PIN incorrecto." : (e?.message||"No se pudo iniciar sesión."));
      setPin("");
    }finally{ setBusy(false); }
  };
  const key=(d)=>{ if(d==="del") setPin(p=>p.slice(0,-1)); else if(d==="ok") submit(); else setPin(p=>(p+d).slice(0,4)); };
  return (<div className="h-full grid place-items-center bg-body p-6">
    <div className="w-full max-w-[380px]">
      <div className="text-center mb-6">
        <div className="text-3xl font-bold tracking-tight text-ink-900">MRT<span className="text-brand-600">PV</span> Retail</div>
        <div className="text-[10px] tracking-[0.28em] text-ink-400 mt-1">SMART RETAIL FLOW</div>
      </div>
      <div className="bg-card border border-line rounded-2xl shadow-sm p-6">
        <div className="text-[14px] font-semibold text-ink-900 text-center">Ingresa tu PIN</div>
        <div className="text-[12px] text-ink-400 text-center mt-1">{loc.location ? loc.location : "Acceso de empleado"}</div>
        {hint && <div className="text-[11px] text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 text-center mt-3">¡Tienda creada! Tu PIN inicial es <span className="font-bold tnum">{hint}</span> — cámbialo en Configuración.</div>}
        <div className="flex justify-center gap-3 my-5">
          {[0,1,2,3].map(i=>(<div key={i} className={"w-3.5 h-3.5 rounded-full border "+(pin.length>i?"bg-brand-500 border-brand-500":"border-line")}/>))}
        </div>
        {err && <div className="text-[12px] text-red-500 text-center mb-3">{err}</div>}
        <div className="grid grid-cols-3 gap-2.5">
          {["1","2","3","4","5","6","7","8","9"].map(d=>(
            <button key={d} onClick={()=>key(d)} className="h-12 rounded-xl border border-line bg-surf hover:bg-card tnum text-lg text-ink-900 transition-colors">{d}</button>))}
          {/* Botones de solo icono: sin aria-label un lector de pantalla no
              anuncia nada y no hay forma de referirlos por su nombre. */}
          <button onClick={()=>key("del")} aria-label="Borrar" className="h-12 rounded-xl border border-line hover:bg-surf grid place-items-center text-ink-400"><Icon n="x" s={18}/></button>
          <button onClick={()=>key("0")} className="h-12 rounded-xl border border-line bg-surf hover:bg-card tnum text-lg text-ink-900">0</button>
          <button onClick={()=>key("ok")} disabled={busy} aria-label="Entrar" className="h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white grid place-items-center disabled:opacity-50">{busy?<span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"/>:<Icon n="check" s={18} c="#fff"/>}</button>
        </div>
        <button onClick={onRelink} className="w-full mt-4 text-[11px] text-ink-400 hover:text-ink-700 flex items-center justify-center gap-1.5"><Icon n="store" s={13}/>Cambiar sucursal</button>
      </div>
      <VersionBadge ota={ota}/>
    </div>
  </div>);
}

function Root(){
  const [products,setProducts]=useState([]);
  const [online,setOnline]=useState(false);
  const [session,setSession]=useState(null);
  const [linked,setLinked]=useState(false);
  const [ready,setReady]=useState(false);
  // Arranca en el default para que SSR e hidratación coincidan; el valor real
  // (cacheado o del catálogo) entra en el efecto de abajo y en loadCatalog.
  const [giro,setGiroState]=useState(DEFAULT_GIRO);
  // Listas de precio (tipo de cliente) y la seleccionada para la venta en curso.
  const [priceLists,setPriceLists]=useState([]);
  const [priceListId,setPriceListId]=useState(null);
  // Estado del auto-updater (OTA de escritorio). Antes el updater corría mudo;
  // ahora su estado se pinta en el badge de la pantalla de acceso y en Ajustes,
  // para poder verificar en pantalla que la caja está en la última versión.
  //   status: "idle" | "checking" | "downloading" | "uptodate" | "error" | "unsupported"
  const [ota,setOta]=useState({ status:"idle", version:null, error:null });

  const loadCatalog=async()=>{
    try{
      const { products:ps, priceLists:pls }=await Retail.fetchCatalog(); // también cachea el giro
      setProducts(ps);
      setPriceLists(pls);
      // Preselecciona la lista default del tenant (p.ej. "Público"); si no hay
      // ninguna marcada, se cotiza a precio de catálogo.
      setPriceListId(prev=>prev ?? (pls.find(l=>l.isDefault)?.id || null));
      setGiroState(getGiro()); // propaga a la UI sin esperar un reload
      setOnline(true);
      return ps;
    }
    catch{ setOnline(false); return []; }
  };

  useEffect(()=>{ (async()=>{
    // Handoff desde el hub del TPV (?api/restaurantId/locationId) — la terminal
    // RETAIL hereda backend + sucursal sin reconfigurar. Limpiamos la URL luego.
    if(typeof window!=="undefined"){
      const sp=new URLSearchParams(window.location.search);
      const api=sp.get("api"), rid=sp.get("restaurantId"), lid=sp.get("locationId");
      if(api) setApiUrl(api);
      if(rid||lid) setTenant({ restaurantId:rid||undefined, locationId:lid||undefined });
      if(api||rid||lid) window.history.replaceState({}, "", window.location.pathname);
    }
    setLinked(Retail.isLinked());
    // Giro cacheado de la última sesión: evita que la caja arranque en ropa y
    // salte a ferretería cuando resuelve el catálogo. Si no hay cache, queda en
    // el default hasta que loadCatalog traiga el del backend.
    setGiroState(getGiro());
    try{ const s=Retail.getSession(); if(s && getToken()){ setSession(s); await loadCatalog(); } }
    catch{ /* sesión corrupta → login */ }
    setReady(true);
  })(); },[]);

  // OTA (Capgo): avisa que el bundle cargó OK. Si no se llama (default 10s), el
  // plugin asume bundle roto y revierte al anterior al próximo arranque — la
  // salvaguarda que evita que un mal release deje el APK muerto. Solo nativo.
  useEffect(()=>{ (async()=>{
    try{
      const { Capacitor }=await import("@capacitor/core");
      if(!Capacitor.isNativePlatform?.()) return;
      const { CapacitorUpdater }=await import("@capgo/capacitor-updater");
      await CapacitorUpdater.notifyAppReady();
    }catch{ /* web o plugin ausente */ }
  })(); },[]);

  // OTA de escritorio (Tauri): busca un instalador firmado más nuevo en GitHub
  // Releases, lo descarga, instala y relanza. Solo aplica dentro de la app Tauri;
  // en web/APK no hay updater de escritorio (el APK usa Capgo, arriba).
  //
  // Reutilizable: el arranque la llama sola, y el botón "Buscar actualización" de
  // Ajustes la vuelve a llamar. Va publicando su estado en `ota` para que el badge
  // y el panel muestren qué está pasando en vez de actualizar a escondidas.
  const checkOta=useCallback(async()=>{
    if(!(typeof window!=="undefined" && (window.__TAURI__ || window.__TAURI_INTERNALS__))){
      setOta({ status:"unsupported", version:null, error:null });
      return;
    }
    setOta({ status:"checking", version:null, error:null });
    try{
      const { check }=await import("@tauri-apps/plugin-updater");
      const update=await check();
      if(update){
        // La app se reinicia al final de downloadAndInstall→relaunch: el estado
        // "downloading" es lo último que se ve antes de que arranque la versión nueva.
        setOta({ status:"downloading", version:update.version||null, error:null });
        await update.downloadAndInstall();
        const { relaunch }=await import("@tauri-apps/plugin-process");
        await relaunch();
      }else{
        setOta({ status:"uptodate", version:null, error:null });
      }
    }catch(e){
      // Sin red / sin release / fuera de Tauri: no es fatal, la caja sigue operando.
      setOta({ status:"error", version:null, error:e?.message||"No se pudo buscar la actualización." });
    }
  },[]);
  useEffect(()=>{ checkOta(); },[checkOta]);

  /* ---- Cola de ventas offline ----
     Una venta cobrada sin red se guarda en disco y sale sola al reconectar. El
     drenado se dispara por tres vías porque ninguna basta: el evento `online`
     del navegador miente a menudo (dice "hay red" con el router sin internet),
     y el intervalo solo no reacciona rápido cuando la red vuelve. */
  const [outbox,setOutbox]=useState({ pending:0, rejected:0 });
  const refreshOutbox=useCallback(()=>{
    setOutbox({ pending:Outbox.pendingCount(), rejected:Outbox.rejectedCount() });
  },[]);
  const flushing=useRef(false);
  const doFlush=useCallback(async()=>{
    // Un solo drenado a la vez: si el intervalo dispara mientras el evento
    // `online` ya estaba drenando, el segundo pase reenviaría ventas que el
    // primero tiene en vuelo. El backend las dedupea por clientSaleId, pero el
    // reintento igual es tráfico inútil sobre una red que apenas volvió.
    if(flushing.current) return;
    if(Outbox.pendingCount()===0){ refreshOutbox(); return; }
    flushing.current=true;
    try{
      const r=await Outbox.flushOutbox();
      setOutbox({ pending:r.pending, rejected:r.rejected });
      if(r.sent>0 && loadCatalog) loadCatalog(); // el stock cambió en el servidor
    } finally { flushing.current=false; }
  },[refreshOutbox,loadCatalog]);
  useEffect(()=>{ refreshOutbox(); },[refreshOutbox]);
  useEffect(()=>{
    if(!session) return;           // sin sesión no hay token con que reenviar
    doFlush();
    const onOnline=()=>doFlush();
    window.addEventListener("online",onOnline);
    const t=setInterval(doFlush,30000);
    return ()=>{ window.removeEventListener("online",onOnline); clearInterval(t); };
  },[session,doFlush]);

  if(!ready) return <div className="h-screen"><BootSplash/></div>;
  if(!linked){
    return <div className="h-screen"><SetupScreen ota={ota} onLinked={()=>setLinked(true)}/></div>;
  }
  if(!session){
    return <div className="h-screen"><LoginScreen ota={ota}
      onLogin={async(emp)=>{ setSession(emp); await loadCatalog(); }}
      onRelink={()=>{ Retail.unlink(); setSession(null); setLinked(false); }}/></div>;
  }
  const value={ products, online, session, giro, priceLists, priceListId, setPriceListId,
    outbox, refreshOutbox, flushOutbox:doFlush,
    refreshCatalog:loadCatalog, ota, checkOta,
    logout:()=>{ Retail.logout(); setSession(null); setOnline(false); setProducts([]); } };
  return (<DataCtx.Provider value={value}><App/></DataCtx.Provider>);
}

/* ===================================================== MULTITICKET ===================================================== */
// Varias ventas en curso a la vez (tickets en espera) + persistencia local para
// que un ticket apartado sobreviva a un refresh/cierre accidental de la caja.
const TICKETS_KEY = "moda-pos-tickets";
const mkTicketId = () => (globalThis.crypto?.randomUUID?.() || ("tk-" + Date.now() + "-" + Math.floor(Math.random() * 1e6)));
const freshTicket = () => ({ id: mkTicketId(), cart: [], createdAt: Date.now() });
function readTicketStore() {
  if (typeof window === "undefined") return null;
  try { const raw = window.localStorage.getItem(TICKETS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function loadTickets() {
  const o = readTicketStore();
  if (o && Array.isArray(o.tickets) && o.tickets.length) {
    return o.tickets.map(t => ({ id: t.id || mkTicketId(), cart: Array.isArray(t.cart) ? t.cart : [], createdAt: t.createdAt || Date.now() }));
  }
  return [freshTicket()];
}
function loadActiveId(tickets) {
  const o = readTicketStore();
  if (o && o.activeId && tickets.some(t => t.id === o.activeId)) return o.activeId;
  return tickets[0]?.id;
}
function saveTickets(tickets, activeId) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(TICKETS_KEY, JSON.stringify({ tickets, activeId })); } catch { /* cuota llena: ignorar */ }
}

// Barra de pestañas de tickets (ventas en espera). Click = cambiar; ✕ = cerrar;
// "Nuevo ticket" = abrir uno vacío. Se muestra arriba de la venta activa.
function TicketTabs({ tickets, activeId, onSwitch, onAdd, onClose }) {
  const { priceListId }=useData();
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 shrink-0">
      {tickets.map((t, i) => {
        const a = t.id === activeId;
        const count = t.cart.reduce((s, l) => s + l.qty, 0);
        const total = cartTotal(t.cart, priceListId);
        return (
          <div key={t.id} onClick={() => onSwitch(t.id)} role="button" tabIndex={0}
            className={"group flex items-center gap-2 h-11 pl-2.5 pr-1.5 rounded-xl border shrink-0 cursor-pointer transition-colors " + (a ? "bg-brand-100 border-brand-500" : "bg-card border-line hover:bg-surf")}>
            <span className={"w-6 h-6 grid place-items-center rounded-lg text-[11px] font-bold shrink-0 " + (a ? "bg-brand-600 text-white" : "bg-surf text-ink-500")}>{i + 1}</span>
            <div className="leading-tight pr-1">
              <div className={"text-[12px] font-semibold " + (a ? "text-brand-700" : "text-ink-800")}>Ticket {i + 1}</div>
              <div className="tnum text-[10px] text-ink-400">{count} art · {mx(total)}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onClose(t.id); }} aria-label={"Cerrar ticket " + (i + 1)}
              className="w-6 h-6 grid place-items-center rounded-md text-ink-300 hover:text-red-500 hover:bg-red-50 shrink-0"><Icon n="x" s={13} /></button>
          </div>
        );
      })}
      <button onClick={onAdd} aria-label="Nuevo ticket"
        className="flex items-center gap-1.5 h-11 px-3 rounded-xl border border-dashed border-line text-ink-500 hover:text-brand-600 hover:border-brand-500 shrink-0 text-[12px] font-semibold">
        <Icon n="plus" s={15} />Nuevo ticket <span className="tnum opacity-70 text-[10px]">F1</span>
      </button>
    </div>
  );
}

/* ===================================================== APP ===================================================== */
function App() {
  const data=useData();
  const products=useProducts();
  const [screen,setScreen]=useState("venta");
  const [query,setQuery]=useState("");
  // El catálogo llega DESPUÉS de montar App: onLogin hace setSession(emp) y solo
  // luego `await loadCatalog()`. Al primer render products está vacío, así que un
  // useState con inicial se quedaba clavado en lo que hubiera entonces —
  // PRODUCTS[0], una camisa— y NUNCA se re-sincronizaba: el catálogo real podía
  // estar cargado y el panel seguía mostrando ropa. Por eso se sincroniza por
  // efecto, conservando la selección si sigue existiendo en el catálogo nuevo.
  const [sel,setSel]=useState(null);
  useEffect(()=>{
    setSel(s=>(s && products.some(p=>p.id===s.id)) ? s : (products[0]||null));
  },[products]);
  // Multiticket: varias ventas en curso a la vez. El carrito activo es el del
  // ticket seleccionado; setCart mapea el updater sobre ese ticket.
  const [tickets,setTickets]=useState(loadTickets);
  const [activeId,setActiveId]=useState(()=>loadActiveId(tickets));
  const [confirmClose,setConfirmClose]=useState(null);
  const activeTicket=tickets.find(t=>t.id===activeId)||tickets[0];
  const cart=activeTicket?activeTicket.cart:[];
  const setCart=(updater)=>setTickets(ts=>ts.map(t=>t.id===activeId?{...t,cart:typeof updater==="function"?updater(t.cart):updater}:t));
  // Si el activo dejó de existir (cierre), reapunta al primero.
  useEffect(()=>{ if(tickets.length && !tickets.some(t=>t.id===activeId)) setActiveId(tickets[0].id); },[tickets,activeId]);
  // Persistir tickets + activo (sobreviven a refresh/crash de la caja).
  useEffect(()=>{ saveTickets(tickets,activeId); },[tickets,activeId]);
  const ticketIndex=Math.max(0,tickets.findIndex(t=>t.id===activeId));
  const [sale,setSale]=useState(null);
  const [grants,setGrants]=useState({});
  const [ov,setOv]=useState(null);
  const [toast,setToast]=useState("");
  const [theme,setTheme]=useState("light");
  const [navOpen,setNavOpen]=useState(false);
  // RBAC real: permisos del empleado logueado (backend) + rol. El override de
  // supervisor concede temporalmente.
  const sessionPerms=useMemo(()=> new Set(data.session?.permissions||[]), [data.session]);
  const isAdminRole=ADMIN_ROLES_UI.includes((data.session?.role||"").toUpperCase());
  useEffect(()=>{ setGrants({}); },[data.session]);
  useEffect(()=>{ document.documentElement.setAttribute("data-theme",theme); },[theme]);
  const can=(p)=>{ if(isAdminRole) return true; if(grants[p]) return true; return sessionPerms.has(CANON_PERM[p]||p); };
  const gate=(perm,fn)=>{ if(can(perm)){ fn&&fn(); } else { setOv({perm,fn}); } };
  const titles={venta:"Venta activa",catalogo:"Catálogo de productos",devoluciones:"Devoluciones y cambios",caja:"Caja / corte de caja",config:"Configuración",checkout:"Checkout y métodos de pago",success:"Venta completada"};

  const cobrar=()=>{ if(cart.length) setScreen("checkout"); };
  /* Llave de idempotencia del intento de cobro. Se deriva del ticket + su
     contenido, así que un reintento tras un timeout de red manda la MISMA
     llave y el backend devuelve la venta ya creada (`idempotent:true`) en vez
     de cobrar otra vez; cambiar el carrito genera una llave nueva. */
  const attemptKey=useMemo(()=>{
    const sig=cart.map(l=>`${l.skuId||l.id}:${l.qty}`).join("|");
    let h=0; for(let i=0;i<sig.length;i++){ h=(h*31+sig.charCodeAt(i))|0; }
    return `moda-${activeId}-${(h>>>0).toString(36)}`;
  },[cart,activeId]);
  const approve=async(total,method,payLines,changeGiven=0)=>{
    // La cantidad de granel se captura a mano y puede quedar vacía o en 0 mientras
    // el cajero teclea; el backend la rechaza con 400. Se normaliza aquí y se
    // aborta antes de cobrar en vez de mandar una venta que va a fallar.
    const qtyOf=(l)=>Number(l.qty);
    const badQty=cart.find(l=>!Number.isFinite(qtyOf(l))||qtyOf(l)<=0);
    if(badQty){ alert(`Cantidad inválida en "${badQty.name}".`); return; }
    // cartTotal (no Σ l.price×qty): tiene que aplicar lista y escalón igual que
    // el backend. Con el precio de catálogo, el pago no cuadraría con el total
    // del servidor y POST /sales rechazaría la venta.
    const subtotal=cartTotal(cart,data.priceListId);
    const desc=0; // sin descuento automático; el precio de catálogo ya incluye IVA
    const totalCobro=Math.round((subtotal-desc)*100)/100;
    // Sin skuId no hay nada que vender: son líneas que no existen en el catálogo
    // del backend. Eso no se encola — nunca lo va a aceptar.
    if(!cart.length || !cart.every(l=>l.skuId)){
      setToast("No se puede cobrar: hay productos que no están en el catálogo. Recarga el catálogo e inténtalo de nuevo.");
      return;
    }
    const payments=(payLines&&payLines.length?payLines:[{method,amount:totalCobro}])
      .map(pl=>({method:Retail.toPaymentMethod(pl.method||method),amount:Math.round(pl.amount*100)/100}));
    // tax:0 → el precio de catálogo ya incluye IVA; el backend cobra Σ precio − descuento.
    // priceListId viaja para que el backend resuelva la MISMA lista que se
    // cotizó; él recalcula y rechaza si su total no cuadra con los pagos.
    const payload={ lines:cart.map(l=>({skuId:l.skuId,quantity:qtyOf(l)})), payments, discount:desc, tax:0, priceListId:data.priceListId };
    const finish=(extra)=>{
      setSale({ total:totalCobro, method, items:cart, subtotal, desc, priceListId:data.priceListId, change:changeGiven, ...extra });
      closeTicket(activeId); // la venta ya se cobró → descartar el ticket de inmediato
      setScreen("success");
    };
    // Offline conocido: ni intentarlo. Un fetch a una red caída se come los 15s
    // del timeout con el cajero esperando, y el resultado sería el mismo.
    if(!data.online){
      Outbox.enqueue({ clientSaleId:attemptKey, payload, total:totalCobro, createdAt:Date.now() });
      data.refreshOutbox&&data.refreshOutbox();
      finish({ folio:null, pending:true });
      return;
    }
    try{
      const r=await Retail.createSale({ ...payload, clientSaleId:attemptKey });
      finish({ total:Number(r.sale.total), folio:r.sale.folio });
      if(data.refreshCatalog) data.refreshCatalog();
    }catch(e){
      if(Outbox.isTransient(e)){
        // La red se cayó DURANTE el cobro. El dinero ya se recibió, así que la
        // venta se guarda en disco con su llave de idempotencia y sale sola al
        // reconectar; reintentarla no puede duplicar el cobro.
        Outbox.enqueue({ clientSaleId:attemptKey, payload, total:totalCobro, createdAt:Date.now() });
        data.refreshOutbox&&data.refreshOutbox();
        finish({ folio:null, pending:true });
        return;
      }
      // Rechazo de negocio (stock, totales, sesión): encolarlo sería mentir, va a
      // fallar igual siempre. Se avisa y el cajero se queda en el cobro.
      setToast("No se pudo cobrar: "+(e?.message||e));
    }
  };
  // Nuevo ticket: reusa uno vacío si ya existe (no acumula vacíos) y lo activa.
  const addTicket=()=>{
    const empty=tickets.find(t=>t.cart.length===0);
    if(empty){ setActiveId(empty.id); setScreen("venta"); return; }
    const t=freshTicket();
    setTickets(ts=>[...ts,t]); setActiveId(t.id); setScreen("venta");
  };
  const switchTicket=(id)=>{ setActiveId(id); setScreen("venta"); };
  // Cerrar un ticket; si era el último, deja uno vacío. Siempre ≥1 ticket.
  const closeTicket=(id)=>{
    const rest=tickets.filter(t=>t.id!==id);
    if(rest.length===0){ const t=freshTicket(); setTickets([t]); setActiveId(t.id); }
    else { setTickets(rest); if(id===activeId) setActiveId(rest[0].id); }
    setConfirmClose(null);
  };
  // ✕ en una pestaña: si tiene artículos pide confirmación, si está vacío cierra directo.
  const requestCloseTicket=(id)=>{ const t=tickets.find(x=>x.id===id); if(!t||t.cart.length===0) closeTicket(id); else setConfirmClose(id); };
  // Cierra la pantalla de éxito (el ticket vendido ya se descartó al cobrar) y
  // vuelve a la venta activa (el siguiente ticket en espera o uno nuevo vacío).
  const finishSale=()=>{ setSale(null); setScreen("venta"); };

  useEffect(()=>{ const h=(e)=>{
    if(e.key==="F1"){e.preventDefault();addTicket();}
    else if(e.key==="F2"){e.preventDefault();document.getElementById("globalsearch")?.focus();}
    else if(e.key==="F5"){e.preventDefault();cobrar();}
    else if(e.key==="F7"){e.preventDefault();setScreen("devoluciones");}
    else if(e.key==="F8"){e.preventDefault();setScreen("caja");}
    else if(e.key==="Escape"&&["checkout","success"].includes(screen)){setScreen("venta");}
  };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h); },[tickets,activeId,screen]);

  return (
    <PermCtx.Provider value={{can,gate}}>
    <div className="h-full flex flex-col w-full max-w-[1680px] mx-auto bg-surf shadow-2xl overflow-hidden" style={{borderRadius:0}}>
      <TitleBar screen={titles[screen]}/>
      <TopBar query={query} setQuery={setQuery} theme={theme} setTheme={setTheme} navOpen={navOpen} setNavOpen={setNavOpen}/>
      <div className="flex-1 flex min-h-0 relative">
        <Sidebar screen={["checkout","success"].includes(screen)?"venta":screen} go={setScreen} navOpen={navOpen} setNavOpen={setNavOpen}/>
        <main className="flex-1 min-w-0 p-3 lg:p-4 overflow-y-auto lg:overflow-hidden">
          {screen==="venta"&&<SaleScreen cart={cart} setCart={setCart} sel={sel} setSel={setSel} go={setScreen}
            tickets={tickets} activeId={activeId} ticketIndex={ticketIndex} onSwitch={switchTicket} onAddTicket={addTicket} onCloseTicket={requestCloseTicket}/>}
          {screen==="checkout"&&<CheckoutScreen cart={cart} setCart={setCart} go={setScreen} onApprove={approve}/>}
          {screen==="success"&&sale&&<SuccessScreen sale={sale} go={setScreen} newSale={finishSale}/>}
          {screen==="catalogo"&&<CatalogScreen setSel={setSel} go={setScreen}/>}
          {screen==="devoluciones"&&<ReturnsScreen/>}
          {screen==="caja"&&<CashScreen/>}
          {screen==="config"&&(can("manage_settings")?<SettingsScreen theme={theme} setTheme={setTheme}/>:<LockedScreen perm="manage_settings" icon="gear" title="Configuración"/>)}
        </main>
      </div>
      <BottomBar go={setScreen} onCobrar={cobrar} onNewTicket={addTicket}/>
      {ov && <OverrideModal perm={ov.perm} onClose={()=>setOv(null)} onOk={(who)=>{ const f=ov.fn; const p=ov.perm; setOv(null); setGrants(g=>({...g,[p]:true})); f&&f(); setToast("Autorizado por "+who); }}/>}
      {confirmClose && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={()=>setConfirmClose(null)}>
          <Card className="w-full max-w-sm">
            <div className="p-5" onClick={(e)=>e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 grid place-items-center text-red-500 shrink-0"><Icon n="alert" s={20}/></div>
                <div className="font-semibold text-ink-900">¿Cerrar este ticket?</div>
              </div>
              <p className="text-[13px] text-ink-500 mt-3">Se descartarán {(tickets.find(t=>t.id===confirmClose)?.cart||[]).reduce((s,l)=>s+l.qty,0)} artículo(s) en espera. Esta acción no se puede deshacer.</p>
              <div className="flex gap-2 mt-5">
                <GhostBtn className="flex-1" onClick={()=>setConfirmClose(null)}>Cancelar</GhostBtn>
                <button onClick={()=>closeTicket(confirmClose)} className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm inline-flex items-center justify-center gap-2"><Icon n="trash" s={16}/>Cerrar ticket</button>
              </div>
            </div>
          </Card>
        </div>
      )}
      {toast && <Toast msg={toast} onClose={()=>setToast("")}/>}
    </div>
    </PermCtx.Provider>
  );
}

export default function Page(){ return <Root/>; }
