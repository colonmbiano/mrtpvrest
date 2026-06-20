"use client";
import { useState, useEffect, useRef, useMemo, createContext, useContext } from "react";
import * as Retail from "@/lib/retail";
import { getApiUrl, setApiUrl } from "@/lib/config";
import { getTenant, setTenant } from "@/lib/tenant";
import { getToken } from "@/lib/token-vault";
import { buildReceipt, buildLabel, printEscpos, getPrinterConfig, setPrinterIp } from "@/lib/printer";

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

/* ---------------- helpers + demo data ---------------- */
const mx = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
const SIZES = ["XS","S","M","L","XL"];
const swatch = { Beige:"#d8c4ab", Blanco:"#f1f1ee", "Verde Olivo":"#5a6b3e", Negro:"#23262a", Gris:"#9aa0a3", "Azul Claro":"#9db7d4", Camel:"#b08456", Perla:"#e8e3d8", Canela:"#9a5b33" };

const PRODUCTS = [
  { id:"p1", name:"Camisa Lino Oversize", sku:"SKU-CAM-LIN-001", cat:"Mujer", price:899, cost:360, season:"Primavera", prov:"Textiles del Valle",
    desc:"Camisa oversize de lino con cuello clásico, manga larga con puño y botón. Corte relajado.", detail:"100% Lino · Hecho en México",
    colors:["Beige","Blanco","Verde Olivo","Negro"], color:"Beige", size:"M", tone:"#efe7da",
    matrix:{ Beige:[6,12,24,18,8], Blanco:[4,8,16,12,6], "Verde Olivo":[3,6,12,8,4], Negro:[2,4,8,6,3] } },
  { id:"p2", name:"Pantalón Sastre Recto", sku:"SKU-PAN-SAS-002", cat:"Mujer", price:1199, cost:520, season:"Primavera", prov:"Atelier MX",
    desc:"Pantalón de vestir corte recto, pinzas frontales y caída fluida.", detail:"Poliéster-viscosa · Hecho en México",
    colors:["Negro","Gris","Beige"], color:"Negro", size:"32", tone:"#e7e8ea",
    matrix:{ Negro:[5,9,11,7,3], Gris:[4,7,9,6,2], Beige:[2,5,6,4,1] } },
  { id:"p3", name:"Bláser Cruzado", sku:"SKU-BLA-CRU-003", cat:"Mujer", price:1599, cost:740, season:"Otoño", prov:"Atelier MX",
    desc:"Bláser cruzado estructurado con solapa de pico y botones forrados.", detail:"Lana-mezcla · Forro satinado",
    colors:["Gris","Negro","Camel"], color:"Gris", size:"L", tone:"#e9eaec",
    matrix:{ Gris:[3,6,9,7,2], Negro:[2,5,8,6,3], Camel:[1,3,5,4,2] } },
  { id:"p4", name:"Vestido Midi Satén", sku:"SKU-VES-MID-004", cat:"Mujer", price:1890, cost:820, season:"Verano", prov:"Seda & Co.",
    desc:"Vestido midi de satén con tirantes ajustables y abertura lateral.", detail:"Satén de poliéster · Hecho en México",
    colors:["Beige","Negro","Verde Olivo"], color:"Beige", size:"M", tone:"#efe6d8",
    matrix:{ Beige:[4,7,10,6,3], Negro:[3,6,9,5,2], "Verde Olivo":[2,4,6,4,1] } },
  { id:"p5", name:"Jeans Straight Fit", sku:"SKU-JEA-STR-036", cat:"Mujer", price:1450, cost:560, season:"Continua", prov:"Denim House",
    desc:"Jeans de mezclilla rígida, corte recto y tiro medio.", detail:"98% Algodón · 2% Elastano",
    colors:["Azul Claro","Negro"], color:"Azul Claro", size:"36", tone:"#dde6f0",
    matrix:{ "Azul Claro":[5,8,12,9,4], Negro:[3,6,10,7,3] } },
  { id:"p6", name:"Bolso Piel Luxe", sku:"SKU-BOL-PIE-002", cat:"Accesorios", price:2650, cost:1180, season:"Continua", prov:"Marroquinería Fina",
    desc:"Bolso estructurado de piel genuina con asa superior y bandolera.", detail:"Piel vacuna · Herrajes dorados",
    colors:["Camel","Negro"], color:"Camel", size:"Única", tone:"#e9d8c2",
    matrix:{ Camel:[14], Negro:[9] } },
  { id:"p7", name:"Top Tirantes Satinado", sku:"SKU-TOP-SAT-005", cat:"Mujer", price:399, cost:150, season:"Verano", prov:"Seda & Co.",
    desc:"Top de tirantes en satén con escote en V.", detail:"Satén · Hecho en México",
    colors:["Perla","Negro"], color:"Perla", size:"M", tone:"#efece2",
    matrix:{ Perla:[8,12,15,9,5], Negro:[6,10,12,8,4] } },
  { id:"p8", name:"Sandalia Tiras Finas", sku:"SKU-SAN-TIR-006", cat:"Calzado", price:799, cost:320, season:"Verano", prov:"Calzado Premium",
    desc:"Sandalia de tacón medio con tiras finas.", detail:"Piel sintética · Tacón 6cm",
    colors:["Beige","Negro"], color:"Beige", size:"25", tone:"#efe6d6",
    matrix:{ Beige:[5,7,9,6,2], Negro:[4,6,8,5,2] } },
  { id:"p9", name:"Cinturón Piel Canela", sku:"SKU-CIN-PIE-007", cat:"Accesorios", price:399, cost:140, season:"Continua", prov:"Marroquinería Fina",
    desc:"Cinturón de piel con hebilla metálica.", detail:"Piel genuina",
    colors:["Canela","Negro"], color:"Canela", size:"Única", tone:"#e6cdb2",
    matrix:{ Canela:[20], Negro:[16] } },
  { id:"p10", name:"Suéter Tejido Perla", sku:"SKU-SUE-TEJ-008", cat:"Mujer", price:1099, cost:430, season:"Otoño", prov:"Tejidos del Norte",
    desc:"Suéter de punto fino, cuello redondo y manga caída.", detail:"Algodón-acrílico",
    colors:["Perla","Gris"], color:"Perla", size:"M", tone:"#eeebe2",
    matrix:{ Perla:[6,9,12,8,4], Gris:[5,8,10,7,3] } },
];
const totalStock = (p) => Object.values(p.matrix).reduce((a,r)=>a+r.reduce((x,y)=>x+y,0),0);

const CUSTOMER = { name:"María Fernanda López", phone:"55 1234 5678", email:"maria.lopez@email.com",
  since:"14/01/2023", pts:1280, level:"Oro", total:18450, count:23, avg:802.17, last:"10/05/2024",
  note:"Prefiere tonos neutros y telas naturales. Interesada en nuevas colecciones de lino." };

const CLIENTS = [
  { name:CUSTOMER.name, init:"MF", phone:CUSTOMER.phone, email:CUSTOMER.email, since:CUSTOMER.since, pts:CUSTOMER.pts,
    level:"Oro", total:CUSTOMER.total, count:CUSTOMER.count, avg:CUSTOMER.avg, last:CUSTOMER.last, note:CUSTOMER.note,
    prefs:["Tallas M / S","Tonos neutros","Lino y algodón"],
    history:[["VTA-000012345","10/05/2024",2,3327],["VTA-000011980","22/04/2024",1,899],["VTA-000011455","03/04/2024",4,5210]] },
  { name:"Isabella Mendoza", init:"IM", phone:"55 2233 4455", email:"isa.mendoza@email.com", since:"08/03/2022",
    pts:3140, level:"Platino", total:42300, count:51, avg:829.41, last:"12/05/2024",
    note:"VIP. Compra colecciones completas cada temporada.", prefs:["Talla S","Negro y camel","Sastrería"],
    history:[["VTA-000012402","12/05/2024",3,4890],["VTA-000012100","28/04/2024",5,8200],["VTA-000011700","10/04/2024",2,3100]] },
  { name:"Valentina Ruiz", init:"VR", phone:"55 9988 7766", email:"vale.ruiz@email.com", since:"19/11/2023",
    pts:480, level:"Plata", total:6200, count:9, avg:688.88, last:"02/05/2024",
    note:"Cliente nueva, interesada en calzado.", prefs:["Talla 25","Sandalias","Verano"],
    history:[["VTA-000012050","02/05/2024",2,1598]] },
  { name:"Andrea Torres", init:"AT", phone:"55 4455 6677", email:"andrea.t@email.com", since:"14/07/2023",
    pts:1620, level:"Oro", total:21800, count:27, avg:807.40, last:"08/05/2024",
    note:"Prefiere recibir avisos de nueva colección.", prefs:["Talla L","Vestidos","Satén"],
    history:[["VTA-000012310","08/05/2024",2,2680],["VTA-000011890","18/04/2024",1,1890]] },
];
const RETURNS = [
  ["DEV-000231","19/05/2024","María Fernanda López",PRODUCTS[0],"Cambio de talla","Procesada",0],
  ["DEV-000230","18/05/2024","Andrea Torres",PRODUCTS[7],"Devolución de dinero","Procesada",-799],
  ["DEV-000229","16/05/2024","Mostrador",PRODUCTS[6],"Nota de crédito","Procesada",-399],
];

const ROLES = ["Cajera","Encargada","Gerente"];
const ROLE_PERMS = {
  Cajera: [],
  Encargada: ["apply_discount","override_price","cancel_items","process_return","refund_cash","cancel_hold","manage_cash_shift","view_cash_count","adjust_inventory","manage_transfers","open_cash_drawer"],
  Gerente: ["*"],
};
const PERM_LABEL = { apply_discount:"Aplicar descuento", override_price:"Cambiar precio de venta", cancel_items:"Anular venta",
  process_return:"Procesar devolución", refund_cash:"Devolver efectivo", cancel_hold:"Cancelar apartado",
  manage_cash_shift:"Cerrar turno / corte", view_cash_count:"Ver corte de caja", open_cash_drawer:"Abrir cajón",
  adjust_inventory:"Ajustar inventario", manage_transfers:"Traspaso entre sucursales", manage_catalog:"Editar catálogo",
  view_reports:"Ver reportes", manage_settings:"Configuración", manage_users:"Gestionar usuarios" };
const SUP_PINS = { "1234":"Gerente", "2468":"Encargada" };
const SUP_NAME = { Gerente:"Diana Sosa", Encargada:"Laura Cano" };
function hasPerm(role,perm){ const p=ROLE_PERMS[role]||[]; return p.indexOf("*")>=0||p.indexOf(perm)>=0; }
const PermCtx = createContext(null);
function usePerm(){ return useContext(PermCtx); }

const NAV = [
  ["venta","Venta","cart"],["catalogo","Catálogo","tag"],["clientes","Clientes","users"],
  ["inventario","Inventario","box"],["apartados","Apartados","bookmark"],["devoluciones","Devoluciones","return"],
  ["caja","Caja","wallet"],["reportes","Reportes","chart"],["config","Configuración","gear"],
];
const SHORTCUTS = [["F1","Nueva venta","plus"],["F2","Buscar","search"],["F5","Cobrar","card"],
  ["F6","Apartar","bookmark"],["F7","Devolución","return"],["F8","Abrir cajón","wallet"]];

/* ---------------- shell ---------------- */
function TitleBar({ screen }) {
  const data=useData();
  return (
    <div className="hidden lg:flex items-center justify-between h-9 px-3 bg-titlebar border-b border-line select-none">
      <div className="text-[12px] text-ink-500 font-medium">MODA+ <span className="text-ink-400">•</span> {screen}</div>
      <div className="flex items-center gap-2 text-ink-400">
        <span className={"flex items-center gap-1.5 text-[11px] px-2 h-6 rounded-full border "+(data.online?"border-brand-200 text-brand-700 bg-brand-50":"border-line text-ink-400")} title={data.online?"Conectado al backend":"Sin conexión · modo demo"}>
          <span className="w-1.5 h-1.5 rounded-full" style={{background:data.online?"#16a34a":"#cbd5cf"}}/>{data.online?(data.session?.name||"En línea"):"Demo"}</span>
        {(data.session||data.demo)&&<button onClick={()=>data.logout&&data.logout()} title="Cerrar sesión" className="text-[11px] px-2 h-6 rounded-full border border-line hover:bg-black/5 text-ink-500">Salir</button>}
        <button className="w-7 h-7 grid place-items-center rounded hover:bg-black/5"><Icon n="min" s={14}/></button>
        <button className="w-7 h-7 grid place-items-center rounded hover:bg-black/5"><Icon n="max" s={12}/></button>
        <button className="w-7 h-7 grid place-items-center rounded hover:bg-red-500 hover:text-white"><Icon n="x" s={14}/></button>
      </div>
    </div>
  );
}
function TopBar({ query, setQuery, role, setRole, theme, setTheme, setNavOpen }) {
  const [t,setT]=useState("11:36 AM");
  return (
    <header className="flex items-center gap-2 lg:gap-4 px-3 lg:px-5 h-[60px] lg:h-[68px] bg-card border-b border-line">
      <button onClick={()=>setNavOpen&&setNavOpen(true)} aria-label="Menú" className="lg:hidden w-10 h-10 grid place-items-center rounded-lg hover:bg-surf text-ink-600 shrink-0"><Icon n="menu" s={20}/></button>
      <div className="flex items-baseline gap-2 lg:w-[200px] shrink-0">
        <span className="text-xl lg:text-2xl font-bold tracking-tight text-ink-900">MODA<span className="text-brand-600">+</span></span>
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
        <div className="hidden md:block"><RoleSwitcher role={role} setRole={setRole}/></div>
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-semibold text-sm">CM</div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-ink-900">Carla Méndez</div>
            <div className="text-[11px] text-ink-400">{role}</div>
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
  return (<>
    {navOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={close}/>}
    <aside className={"bg-card border-r border-line flex-col w-[264px] shrink-0 fixed inset-y-0 left-0 z-50 lg:static lg:w-[224px] lg:z-auto "+(navOpen?"flex":"hidden lg:flex")}>
      <div className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-line">
        <span className="text-lg font-bold tracking-tight text-ink-900">MODA<span className="text-brand-600">+</span></span>
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
      <div className="p-4 border-t border-line space-y-2 text-[12px]">
        <Row k="Tienda" v="Polanco" icon="store"/>
        <div className="flex gap-4">
          <span className="text-ink-400">Caja: <span className="text-ink-700 font-medium">01</span></span>
          <span className="text-ink-400">Turno: <span className="text-brand-600 font-medium">Abierto</span></span>
        </div>
        <Row k="Conexión" v={<span className="text-brand-600 font-medium">Online</span>} icon="wifi"/>
      </div>
    </aside>
  </>);
}
function Row({k,v,icon}){return(<div className="flex items-center gap-2 text-ink-400"><Icon n={icon} s={14}/><span>{k}: <span className="text-ink-700 font-medium">{v}</span></span></div>);}

function BottomBar({ go, onCobrar }) {
  return (
    <footer className="flex items-center gap-2 px-3 lg:px-4 h-[58px] lg:h-[60px] bg-card border-t border-line overflow-x-auto">
      {SHORTCUTS.map(([k,label,icon])=>(
        <button key={k} onClick={()=>{ if(k==="F5")onCobrar(); else if(k==="F7")go("devoluciones"); else if(k==="F8")go("caja"); else if(k==="F6")go("apartados"); else if(k==="F1")go("venta"); else document.getElementById("globalsearch")?.focus(); }}
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
function PrimaryBtn({ children, onClick, className="" }) {
  return <button onClick={onClick} className={"inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors active:scale-[.99] "+className}>{children}</button>;
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

function RoleSwitcher({ role, setRole }) {
  return (<div className="flex items-center gap-1.5">
    <Icon n="shield" s={14} cls="text-ink-400"/>
    <div className="flex items-center gap-1 p-1 rounded-xl bg-surf border border-line">
      {ROLES.map(r=><button key={r} onClick={()=>setRole(r)} title={"Cambiar rol a "+r}
        className={"h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors "+(role===r?"bg-card shadow-sm text-ink-900":"text-ink-500 hover:text-ink-900")}>{r}</button>)}
    </div></div>);
}

function OverrideModal({ perm, onClose, onOk }) {
  const [pin,setPin]=useState(""); const [err,setErr]=useState("");
  const submit=()=>{ const r=SUP_PINS[pin];
    if(!r){ setErr("PIN incorrecto"); return; }
    if(!hasPerm(r,perm)){ setErr(SUP_NAME[r]+" no tiene este permiso"); return; }
    onOk(SUP_NAME[r]+" · "+r); };
  return (<Modal title="Autorización de supervisor" onClose={onClose}>
    <div className="text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 grid place-items-center text-amber-500 mb-3"><Icon n="lock" s={26}/></div>
      <div className="text-[14px] text-ink-700">Se requiere permiso:</div>
      <div className="text-[15px] font-semibold text-ink-900">{PERM_LABEL[perm]||perm}</div>
      <div className="text-[12px] text-ink-400 mt-1">Un supervisor con este permiso debe autorizar con su PIN.</div>
      <input value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,"").slice(0,4));setErr("");}} type="password" inputMode="numeric" placeholder="••••" autoFocus
        className="mt-4 w-44 mx-auto block text-center tnum text-2xl tracking-[0.5em] h-14 rounded-xl border border-line outline-none focus:border-brand-500"
        onKeyDown={e=>{ if(e.key==="Enter") submit(); }}/>
      {err && <div className="text-[12px] text-red-500 mt-2">{err}</div>}
      <div className="text-[11px] text-ink-400 mt-3">Demo: <span className="tnum">1234</span> (Gerente) · <span className="tnum">2468</span> (Encargada)</div>
      <div className="flex gap-2 mt-5"><GhostBtn className="flex-1" onClick={onClose}>Cancelar</GhostBtn><PrimaryBtn className="flex-1" onClick={submit}><Icon n="check" s={16}/>Autorizar</PrimaryBtn></div>
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
  useEffect(()=>{ if(ref.current && window.JsBarcode){ try{ window.JsBarcode(ref.current, String(value||" "), {format:"CODE128", height, width, displayValue:false, margin:0, background:"transparent", lineColor:"#1b2520"}); }catch(e){} } }, [value, height, width]);
  return <svg ref={ref} className={className}></svg>;
}
function Dash(){ return <div className="border-t border-dashed border-ink-400 my-2"/>; }
function RcLine({l,r}){ return <div className="flex justify-between gap-2"><span className="text-ink-600">{l}</span><span>{r}</span></div>; }

function ReceiptModal({ sale, onClose }) {
  const data = useData();
  const iva = Math.round((sale.subtotal - (sale.desc||0)) * 0.16 * 100)/100;
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
          <div className="text-[16px] font-bold tracking-tight">MODA+</div>
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
        <RcLine l="IVA (16%)" r={mx(iva)}/>
        <div className="flex justify-between font-bold text-[14px] mt-1.5"><span>TOTAL</span><span>{mx(sale.total)}</span></div>
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

function LabelModal({ sku, onClose }) {
  const [qty,setQty]=useState(1);
  const code = sku.barcode || sku.sku;
  const [ip,setIp]=useState(""); const [status,setStatus]=useState("");
  useEffect(()=>{ setIp(getPrinterConfig().ip||""); },[]);
  const doPrint=async()=>{
    if(ip.trim()) setPrinterIp(ip.trim());
    setStatus("Imprimiendo…");
    const escpos=buildLabel({ name:sku.name, color:sku.color, size:sku.size, price:sku.price, code, sku:sku.sku }, qty);
    const res=await printEscpos(escpos);
    if(res.ok) setStatus("Enviado a la impresora ✓");
    else if(res.channel==="web"){ if(window.print) window.print(); setStatus("Sin impresora nativa — impresión del sistema"); }
    else setStatus("Error: "+(res.error||"revisa la IP")); };
  return (<Modal title="Etiqueta de código de barras" onClose={onClose}>
    <div className="flex gap-6 items-start">
      <div className="mx-auto">
        <div className="w-[236px] bg-card border border-ink-300 rounded-md p-3 text-center shadow-sm">
          <div className="text-[11px] font-semibold text-ink-900 truncate">MODA+ · {sku.name}</div>
          <div className="text-[10px] text-ink-500">{[sku.color, SIZES.includes(sku.size)?sku.size:sku.size].filter(Boolean).join(" / ")}</div>
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
function SaleScreen({ cart, setCart, sel, setSel, go }) {
  const products=useProducts();
  const setQty=(id,d)=>setCart(c=>c.map(l=>l.key===id?{...l,qty:Math.max(1,l.qty+d)}:l));
  const del=(id)=>setCart(c=>c.filter(l=>l.key!==id));
  const [scan,setScan]=useState("");
  const addProduct=(p)=>{ const size=SIZES.includes(p.size)?p.size:(p.live?p.size:"M"); setCart(c=>[...c,{key:p.id+"-"+Date.now(),id:p.id,name:p.name,sku:p.sku,price:p.price,color:p.color,size,tone:p.tone,cat:p.cat,qty:1,skuId:resolveSkuId(p,p.color,p.size)}]); };
  const doScan=(e)=>{ e.preventDefault(); const q=scan.trim().toLowerCase(); if(!q)return;
    const m=products.find(p=>p.sku.toLowerCase()===q)||products.find(p=>(p.sku+" "+p.name).toLowerCase().indexOf(q)>=0);
    if(m){ addProduct(m); setSel(m); } setScan(""); };
  const subtotal=cart.reduce((s,l)=>s+l.price*l.qty,0);
  const desc=Math.round(subtotal*0.10*100)/100;
  const iva=Math.round((subtotal-desc)*0.16*100)/100;
  const total=subtotal-desc+iva;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-4 h-full">
      <div className="flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 h-14 border-b border-line">
            <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-brand-100 grid place-items-center text-brand-600"><Icon n="cart" s={18}/></div>
              <span className="font-semibold text-ink-900">Venta activa</span></div>
            <span className="tnum text-[12px] text-ink-400">Folio: VTA-00012345</span>
          </div>
          <div className="grid grid-cols-[1fr_120px_56px_56px_90px_84px_40px] px-5 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wide border-b border-line">
            <span>Producto</span><span>SKU</span><span className="text-center">Talla</span><span className="text-center">Color</span><span className="text-right">Precio</span><span className="text-center">Cant.</span><span></span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {cart.map(l=>(
              <div key={l.key} className="grid grid-cols-[1fr_120px_56px_56px_90px_84px_40px] items-center px-5 py-3 border-b border-line/70 hover:bg-surf/60">
                <div className="flex items-center gap-3 min-w-0"><Thumb p={l}/>
                  <div className="min-w-0"><div className="text-[13px] font-semibold text-ink-900 truncate">{l.name}</div>
                    <div className="text-[11px] text-ink-400">{l.color} / {l.size}</div></div></div>
                <span className="tnum text-[11px] text-ink-500">{l.sku}</span>
                <span className="text-center text-[13px] text-ink-700">{l.size}</span>
                <span className="flex justify-center"><span style={{background:swatch[l.color]||"#ccc"}} className="w-5 h-5 rounded-full border border-black/10"/></span>
                <span className="tnum text-right text-[13px] text-ink-900">{mx(l.price)}</span>
                <span className="flex items-center justify-center gap-1.5">
                  <button onClick={()=>setQty(l.key,-1)} className="w-7 h-7 grid place-items-center rounded-lg border border-line hover:bg-surf text-ink-500"><Icon n="minus" s={13}/></button>
                  <span className="tnum w-5 text-center text-[13px]">{l.qty}</span>
                  <button onClick={()=>setQty(l.key,1)} className="w-7 h-7 grid place-items-center rounded-lg border border-line hover:bg-surf text-ink-500"><Icon n="plus" s={13}/></button>
                </span>
                <button onClick={()=>del(l.key)} className="justify-self-center w-8 h-8 grid place-items-center rounded-lg hover:bg-red-50 text-ink-400 hover:text-red-500"><Icon n="trash" s={15}/></button>
              </div>
            ))}
            {cart.length===0&&<div className="py-16 text-center text-ink-400 text-sm">Escanea o agrega un producto para iniciar la venta.</div>}
          </div>
          <div className="flex gap-2 px-5 py-3 border-t border-line">
            <GhostBtn onClick={()=>go("catalogo")}><Icon n="plus" s={16}/>Agregar producto</GhostBtn>
            <GhostBtn onClick={()=>go("clientes")}><Icon n="users" s={16}/>Buscar cliente</GhostBtn>
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
            <TotRow k={<span className="flex items-center gap-1">Descuento <Icon n="info" s={13} cls="text-ink-400"/></span>} v={<span className="text-brand-600">-{mx(desc)}</span>}/>
            <TotRow k="IVA (16%)" v={mx(iva)}/>
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-line">
              <span className="font-semibold text-ink-900">Total</span>
              <span className="tnum text-2xl font-bold text-ink-900">{mx(total)}</span></div>
            <PrimaryBtn onClick={()=>go("checkout")} className="w-full mt-1"><Icon n="card" s={18}/>Cobrar <span className="tnum opacity-80">F5</span></PrimaryBtn>
          </div>
        </Card>
      </div>
      <ProductDetailPanel p={sel} onAdd={(p,color,size)=>setCart(c=>[...c,{key:p.id+color+size+Date.now(),id:p.id,name:p.name,sku:p.sku,price:p.price,color,size,tone:p.tone,cat:p.cat,qty:1,skuId:resolveSkuId(p,color,size)}])}/>
    </div>
  );
}
function TotRow({k,v}){return(<div className="flex items-center justify-between text-[13px]"><span className="text-ink-500">{k}</span><span className="tnum text-ink-900">{v}</span></div>);}

function ProductDetailPanel({ p, onAdd }) {
  const [color,setColor]=useState(p.color);
  const [size,setSize]=useState(SIZES.includes(p.size)?p.size:"M");
  const [label,setLabel]=useState(false);
  useEffect(()=>{ setColor(p.color); setSize(SIZES.includes(p.size)?p.size:"M"); },[p.id]);
  const row=p.matrix[color]||p.matrix[p.colors[0]]||[];
  const stock=row.reduce((a,b)=>a+b,0);
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
            <div className="text-[12px] text-brand-600 font-medium mt-0.5">En stock: {stock} pzas.</div></div></div>
        <div className="mt-5">
          <div className="text-[12px] text-ink-500 mb-2">Color: <span className="text-ink-900 font-medium">{color}</span></div>
          <div className="flex gap-2">{p.colors.map(c=>(
            <button key={c} onClick={()=>setColor(c)} title={c}
              style={{background:swatch[c]||"#ccc"}}
              className={"w-9 h-9 rounded-full border-2 "+(color===c?"border-brand-600 ring-2 ring-brand-100":"border-black/10")}/>))}</div>
        </div>
        <div className="mt-5">
          <div className="text-[12px] text-ink-500 mb-2">Talla:</div>
          <div className="flex gap-2">{SIZES.map(s=>(
            <button key={s} onClick={()=>setSize(s)}
              className={"flex-1 h-10 rounded-xl border text-[13px] font-medium "+(size===s?"border-brand-600 bg-brand-100 text-brand-700":"border-line text-ink-700 hover:bg-surf")}>{s}</button>))}</div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-1.5 text-[12px] text-ink-700 font-medium"><Icon n="box" s={15} cls="text-brand-600"/>Stock por talla</div>
            <button className="text-[12px] text-brand-600 font-medium">Ver inventario completo</button></div>
          <div className="grid grid-cols-5 rounded-xl border border-line overflow-hidden text-center">
            {SIZES.map((s,i)=>(<div key={s} className="border-r border-line last:border-0 py-2"><div className="text-[11px] text-ink-400">{s}</div>
              <div className={"tnum text-sm font-semibold "+(s===size?"text-brand-600":"text-ink-900")}>{row[i]??0}</div></div>))}</div>
        </div>
        <button onClick={()=>onAdd(p,color,size)} className="w-full h-12 mt-5 rounded-xl border-2 border-brand-200 text-brand-700 font-semibold text-sm hover:bg-brand-50 inline-flex items-center justify-center gap-2"><Icon n="plus" s={18}/>Agregar a la venta</button>
        <Acc title="Descripción" body={p.desc}/>
        <Acc title="Detalles" body={"Composición: "+p.detail}/>
      </div>
      {label && <LabelModal sku={p} onClose={()=>setLabel(false)}/>}
    </Card>
  );
}
function Acc({title,body}){const[o,setO]=useState(true);return(<div className="border-t border-line mt-4 pt-3">
  <button onClick={()=>setO(!o)} className="w-full flex items-center justify-between text-[13px] font-medium text-ink-900"><span>{title}</span><Icon n="chev" s={16} cls={"text-ink-400 transition-transform "+(o?"":"-rotate-90")}/></button>
  {o&&<p className="text-[12px] text-ink-500 mt-2 leading-relaxed">{body}</p>}</div>);}

/* ===================================================== CHECKOUT ===================================================== */
function CheckoutScreen({ cart, go, onApprove }) {
  const [method,setMethod]=useState("Efectivo");
  const [amt,setAmt]=useState("");
  const [lines,setLines]=useState([]);
  const [changeDue,setChangeDue]=useState(0);
  const [rcpt,setRcpt]=useState(false);
  const subtotal=cart.reduce((s,l)=>s+l.price*l.qty,0);
  const desc=Math.round(subtotal*0.15*100)/100;
  const iva=Math.round((subtotal-desc)*0.16*100)/100;
  const total=subtotal-desc+iva;
  const methods=[["Tarjeta","Débito o crédito","card"],["Efectivo","Paga con efectivo","cash"],["QR / Pago","Escanea y paga","qr"],["Transferencia","SPEI / Transferencia bancaria","swap"],["Meses sin intereses","Paga a meses sin intereses","card"]];
  const paid=Math.round(lines.reduce((s,l)=>s+l.amount,0)*100)/100;
  const remaining=Math.max(0,Math.round((total-paid)*100)/100);
  const amtNum=Number(amt||0);
  const liveChange=method==="Efectivo"?Math.max(0,Math.round((amtNum-remaining)*100)/100):0;
  const addPay=()=>{ if(remaining<=0)return; const want=amtNum>0?amtNum:remaining; const applied=Math.min(want,remaining); if(applied<=0)return;
    if(method==="Efectivo"&&want>remaining) setChangeDue(c=>Math.round((c+(want-remaining))*100)/100);
    setLines(l=>[...l,{method,amount:Math.round(applied*100)/100}]); setAmt(""); };
  const removePay=(i)=>{ setLines(l=>l.filter((_,j)=>j!==i)); setChangeDue(0); };
  const payLabel=lines.length>1?"Pago mixto":(lines[0]?lines[0].method:method);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px_minmax(0,1fr)] gap-4 h-auto lg:h-full">
      <Card className="flex flex-col overflow-hidden">
        <div className="px-5 h-14 flex items-center border-b border-line font-semibold text-ink-900">Carrito de compra ({cart.length})</div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {cart.map(l=>(<div key={l.key} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surf">
            <Thumb p={l} size={48}/>
            <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink-900 truncate">{l.name}</div>
              <div className="tnum text-[11px] text-ink-400">{l.sku}</div><div className="text-[11px] text-ink-400">{l.color} / {l.size}</div></div>
            <div className="text-right"><div className="tnum text-[13px] font-semibold text-ink-900">{mx(l.price)}</div>
              <div className="inline-flex items-center gap-1.5 mt-1"><button className="w-6 h-6 grid place-items-center rounded border border-line text-ink-400"><Icon n="minus" s={12}/></button><span className="tnum text-xs w-4 text-center">{l.qty}</span><button className="w-6 h-6 grid place-items-center rounded border border-line text-ink-400"><Icon n="plus" s={12}/></button></div></div>
          </div>))}
        </div>
        <div className="p-3 border-t border-line"><GhostBtn onClick={()=>go("venta")} className="w-full"><Icon n="trash" s={16}/>Vaciar carrito</GhostBtn></div>
      </Card>

      <div className="flex flex-col gap-4 min-h-0">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4"><span className="font-semibold text-ink-900">Cliente</span><button className="text-[12px] text-brand-600 font-medium">Editar</button></div>
          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-semibold">MF</div>
            <div><div className="text-[14px] font-semibold text-ink-900">{CUSTOMER.name}</div><span className="inline-block mt-1 text-[10px] font-semibold text-brand-700 bg-brand-100 px-2 py-0.5 rounded">CLIENTE FRECUENTE</span></div></div>
          <div className="text-[12px] text-ink-500 mt-3 space-y-0.5"><div>{CUSTOMER.email}</div><div className="tnum">+52 {CUSTOMER.phone}</div></div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-line text-[13px]"><span className="flex items-center gap-1.5 text-ink-500"><Icon n="star" s={15} cls="text-brand-600"/>Puntos acumulados:</span><span className="tnum font-semibold text-ink-900">{CUSTOMER.pts} pts</span></div>
        </Card>
        <Card className="p-5 flex-1">
          <TotRow k="Subtotal" v={mx(subtotal)}/>
          <div className="my-2"/>
          <TotRow k="Descuento" v={<span className="text-brand-600">-{mx(desc)}</span>}/>
          <div className="flex items-center justify-between mt-2 text-[12px]"><span className="text-ink-400">Descuento por membresía</span><span className="tnum text-ink-500 border border-line rounded px-2 py-0.5">15% ⌄</span></div>
          <div className="my-2"/><TotRow k="IVA (16%)" v={mx(iva)}/>
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-line"><span className="text-xl font-bold text-ink-900">Total</span><span className="tnum text-3xl font-bold text-ink-900">{mx(total)}</span></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-h-0">
        <Card className="p-3 overflow-y-auto">
          <div className="px-2 py-2 font-semibold text-ink-900">Método de pago</div>
          <div className="space-y-2">{methods.map(([m,sub,icon])=>{const a=method===m;return(
            <button key={m} onClick={()=>{setMethod(m);setAmt("");}} className={"w-full flex items-center gap-3 p-2.5 rounded-xl border text-left "+(a?"border-brand-500 bg-brand-50 ring-1 ring-brand-100":"border-line hover:bg-surf")}>
              <div className={"w-9 h-9 rounded-lg grid place-items-center "+(a?"bg-brand-100 text-brand-600":"bg-surf text-ink-400")}><Icon n={icon} s={18}/></div>
              <div className="flex-1"><div className="text-[13px] font-semibold text-ink-900">{m}</div><div className="text-[11px] text-ink-400">{sub}</div></div>
              {a&&<Icon n="check" s={18} cls="text-brand-600"/>}</button>);})}</div>
        </Card>
        <Card className="p-5 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between"><span className="font-semibold text-ink-900">Cobrar con {method.toLowerCase()}</span>
            <span className="text-[12px] text-ink-400">Restante <span className="tnum font-semibold text-ink-900">{mx(remaining)}</span></span></div>
          <div className="text-[12px] text-ink-500 mt-4 mb-1">{method==="Efectivo"?"Importe recibido":"Monto"}</div>
          <input value={amt} onChange={(e)=>setAmt(e.target.value.replace(/[^\d.]/g,""))} inputMode="decimal" placeholder={String(remaining)}
            className="h-12 rounded-xl bg-surf border border-line text-right px-4 tnum text-lg font-semibold outline-none focus:border-brand-500"/>
          {method==="Efectivo"&&<>
            <div className="grid grid-cols-4 gap-2 mt-3">{[100,200,500,1000].map(v=><button key={v} type="button" onClick={()=>setAmt(String(Number(amt||0)+v))} className="h-9 rounded-lg border border-line hover:bg-surf tnum text-[12px]">+${v}</button>)}</div>
            <button type="button" onClick={()=>setAmt(String(remaining))} className="w-full h-9 mt-2 rounded-lg border border-line hover:bg-surf text-[12px]">Importe exacto {mx(remaining)}</button>
            <div className="flex items-center justify-between mt-3 text-[13px]"><span className="text-ink-500">Cambio</span><span className="tnum font-semibold text-brand-600">{mx(liveChange)}</span></div></>}
          {method==="Tarjeta"&&<div className="flex items-center justify-between mt-3 text-[12px]"><span className="text-ink-500">Terminal</span><span className="text-ink-700 border border-line rounded-lg px-2 py-1 tnum">BBVA - 1234 ⌄</span></div>}
          <button type="button" onClick={addPay} disabled={remaining<=0} className="h-11 mt-4 rounded-xl border-2 border-brand-200 text-brand-700 font-semibold text-sm hover:bg-brand-50 disabled:opacity-40 inline-flex items-center justify-center gap-2"><Icon n="plus" s={16}/>Agregar pago</button>
          {lines.length>0&&<div className="mt-3 space-y-1.5">{lines.map((l,i)=>(<div key={i} className="flex items-center justify-between text-[12px] bg-surf rounded-lg px-3 py-2">
            <span className="text-ink-700">{l.method}</span><span className="flex items-center gap-2"><span className="tnum font-medium text-ink-900">{mx(l.amount)}</span><button onClick={()=>removePay(i)} className="text-ink-400 hover:text-red-500"><Icon n="x" s={14}/></button></span></div>))}</div>}
        </Card>
      </div>

      <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px_minmax(0,1fr)] gap-4">
        <Card className="p-4"><div className="text-[12px] text-ink-500 mb-1">Pagado</div><div className="h-12 rounded-xl bg-surf border border-line flex items-center justify-end px-4 tnum text-xl font-bold text-ink-900">{mx(paid)}</div></Card>
        <Card className="p-4"><div className="text-[12px] text-ink-500 mb-1">{remaining>0?"Restante":"Cambio"}</div>
          <div className={"h-12 rounded-xl border flex items-center justify-end px-4 tnum text-xl font-bold "+(remaining>0?"bg-amber-50 border-amber-100 text-amber-700":"bg-brand-50 border-brand-100 text-brand-700")}>{remaining>0?mx(remaining):mx(changeDue)}</div></Card>
        <div className="flex gap-3 items-end">
          <PrimaryBtn onClick={()=>{ if(remaining<=0) onApprove(total,payLabel,lines.length?lines:[{method:payLabel,amount:total}]); }} className={"flex-1 h-14 text-base "+(remaining>0?"opacity-50 pointer-events-none":"")}><Icon n="check" s={20}/>{remaining>0?"Falta "+mx(remaining):"Cobrar "+mx(total)} <span className="tnum opacity-80">(F5)</span></PrimaryBtn>
          <GhostBtn className="h-14" onClick={()=>setRcpt(true)}><Icon n="printer" s={18}/>Imprimir ticket</GhostBtn>
        </div>
      </div>
      {rcpt && <ReceiptModal sale={{items:cart,subtotal,desc,total,method:payLabel,folio:"VTA-000012346"}} onClose={()=>setRcpt(false)}/>}
    </div>
  );
}

/* ===================================================== SUCCESS ===================================================== */
function SuccessScreen({ sale, go, newSale }) {
  const [rcpt,setRcpt]=useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 h-full">
      <Card className="p-8 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-full border-4 border-brand-500 grid place-items-center text-brand-600 mb-4"><Icon n="check" s={40} sw={2.4}/></div>
        <h1 className="text-2xl font-bold text-ink-900">¡Pago aprobado!</h1>
        <p className="text-ink-500 mt-1">La venta ha sido completada correctamente.</p>
        <div className="grid grid-cols-3 gap-px bg-line rounded-2xl overflow-hidden mt-6 w-full max-w-xl border border-line">
          {[["Total pagado",mx(sale.total)],["Método de pago",sale.method],["Folio de venta",sale.folio||"—"]].map(([k,v])=>(
            <div key={k} className="bg-card p-4 text-center"><div className="text-[11px] text-ink-400 mb-1">{k}</div><div className="tnum font-semibold text-ink-900 text-sm">{v}</div></div>))}
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
          <div className="tnum text-[13px] font-semibold text-ink-900">{mx(l.price*l.qty)}</div></div>))}</div>
        <div className="mt-5 pt-4 border-t border-line space-y-2">
          <TotRow k="Subtotal" v={mx(sale.subtotal)}/><TotRow k="Descuento" v={<span className="text-brand-600">- {mx(sale.desc)}</span>}/>
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

/* ===================================================== INVENTORY ===================================================== */
function InventoryScreen() {
  const p=PRODUCTS[0];
  const [color,setColor]=useState("Beige");
  const cell=(v)=>{const cls=v===0?"text-red-500 font-semibold":v<5?"bg-red-50 text-red-600":v<=10?"bg-amber-50 text-amber-700":v>20?"bg-brand-50 text-brand-700":"text-ink-700";
    return <td className={"tnum text-center py-2.5 text-sm "+cls}>{v}</td>;};
  const colTotal=(i)=>p.colors.reduce((a,c)=>a+(p.matrix[c][i]||0),0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 h-full">
      <div className="overflow-y-auto pr-1">
        <ScreenHead icon="box" title="Inventario por talla y color" folio="INV-2024-00012345"/>
        <Card className="p-5">
          <div className="grid grid-cols-[200px_1fr_repeat(3,150px)] gap-4 items-start">
            <div style={{background:p.tone}} className="h-44 rounded-2xl grid place-items-center border border-black/5"><Icon n="tag" s={52} cls="text-black/15"/></div>
            <div>
              <h2 className="text-lg font-semibold text-ink-900">{p.name}</h2>
              <div className="tnum text-[12px] text-ink-400">{p.sku}</div>
              <div className="tnum text-xl font-bold text-ink-900 mt-2">{mx(p.price)}</div>
              <div className="text-[12px] text-brand-600 font-medium">En stock: 24 pzas.</div>
              <p className="text-[12px] text-ink-500 mt-2 leading-relaxed">{p.desc}</p>
              <div className="text-[12px] text-ink-500 mt-3">Color: <span className="font-medium text-ink-900">{color}</span></div>
              <div className="flex gap-2 mt-2">{p.colors.map(c=><button key={c} onClick={()=>setColor(c)} style={{background:swatch[c]}} className={"w-8 h-8 rounded-full border-2 "+(color===c?"border-brand-600":"border-black/10")}/>)}</div>
            </div>
            <Stat icon="box" label="Total disponible" val="128" sub="pzas." money="$115,072.00"/>
            <Stat icon="bookmark" label="Reservado" val="15" sub="pzas." money="$13,485.00"/>
            <Stat icon="truck" label="En tránsito" val="8" sub="pzas." money="$7,192.00"/>
          </div>
          <table className="w-full mt-6 border border-line rounded-xl overflow-hidden">
            <thead><tr className="bg-surf text-[11px] text-ink-400 uppercase">
              <th className="text-left py-2.5 px-4 font-semibold">Talla / Color</th>{SIZES.map(s=><th key={s} className="font-semibold">{s}</th>)}<th className="font-semibold">Total</th></tr></thead>
            <tbody>{p.colors.map(c=>(<tr key={c} className="border-t border-line">
              <td className="py-2.5 px-4 text-[13px] text-ink-700 flex items-center gap-2"><span style={{background:swatch[c]}} className="w-4 h-4 rounded-full border border-black/10"/>{c}</td>
              {p.matrix[c].map((v,i)=>cell(v))}<td className="tnum text-center font-semibold text-ink-900">{p.matrix[c].reduce((a,b)=>a+b,0)}</td></tr>))}
              <tr className="border-t border-line bg-surf/50"><td className="py-2.5 px-4 text-[13px] font-semibold text-ink-900">Total</td>
              {SIZES.map((s,i)=><td key={s} className="tnum text-center font-semibold text-ink-900">{colTotal(i)}</td>)}
              <td className="tnum text-center font-bold text-ink-900">{p.colors.reduce((a,c)=>a+p.matrix[c].reduce((x,y)=>x+y,0),0)}</td></tr></tbody>
          </table>
          <div className="flex gap-5 mt-3 text-[11px]">
            <Leg c="bg-brand-100" t="Alto inventario (>20 pzas.)"/><Leg c="bg-amber-100" t="Stock bajo (5-10 pzas.)"/><Leg c="bg-red-100" t="Crítico (<5 pzas.)"/></div>
        </Card>
        <Card className="p-5 mt-4">
          <div className="font-semibold text-ink-900 mb-3">Alertas de inventario</div>
          {[["Stock crítico en variaciones","2 variantes con menos de 5 pzas.","alert","text-red-500"],["Stock bajo en variaciones","5 variantes con menos de 10 pzas.","alert","text-amber-500"],["Reabastecimiento sugerido","3 variantes sin stock disponible.","info","text-brand-600"]].map(([t,s,ic,col])=>(
            <div key={t} className="flex items-center gap-3 py-2.5 border-t border-line first:border-0">
              <Icon n={ic} s={18} cls={col}/><div className="flex-1"><div className="text-[13px] text-ink-900">{t}</div><div className="text-[11px] text-ink-400">{s}</div></div>
              <button className="text-[12px] text-brand-600 font-medium">Ver detalle</button></div>))}
        </Card>
      </div>
      <div className="space-y-4 overflow-y-auto">
        <Card className="p-5"><div className="flex items-center gap-2 font-semibold text-ink-900 mb-4"><Icon n="swap" s={18} cls="text-brand-600"/>Transferir entre sucursales</div>
          <Fld label="Desde"><Sel v="Tienda Polanco (Actual)"/></Fld><Fld label="Hacia"><Sel v="Seleccionar sucursal"/></Fld>
          <Fld label="Variantes"><Sel v="Seleccionar color y talla"/></Fld>
          <Fld label="Cantidad"><Stepper/></Fld>
          <GateBtn className="w-full mt-2" perm="manage_transfers">Preparar transferencia</GateBtn></Card>
        <Card className="p-5"><div className="flex items-center gap-2 font-semibold text-ink-900 mb-4"><Icon n="bookmark" s={18} cls="text-brand-600"/>Apartado de mercancía</div>
          <Fld label="Cliente (opcional)"><Sel v="Buscar cliente"/></Fld><Fld label="Variantes"><Sel v="Seleccionar color y talla"/></Fld>
          <div className="grid grid-cols-2 gap-3"><Fld label="Cantidad"><Stepper/></Fld><Fld label="Tiempo de reserva"><Sel v="24 horas"/></Fld></div>
          <Fld label="Nota (opcional)"><input placeholder="Agregar nota" className="w-full h-10 px-3 rounded-lg border border-line text-sm outline-none focus:border-brand-500"/></Fld>
          <PrimaryBtn className="w-full mt-2">Apartar mercancía</PrimaryBtn></Card>
      </div>
    </div>
  );
}
function Stat({icon,label,val,sub,money}){return(<Card className="p-3"><div className="flex items-center gap-1.5 text-[11px] text-ink-400"><Icon n={icon} s={14} cls="text-brand-600"/>{label}</div>
  <div className="tnum text-2xl font-bold text-ink-900 mt-1">{val} <span className="text-[11px] font-normal text-ink-400">{sub}</span></div>
  <div className="tnum text-[11px] text-ink-400 mt-1">{money}</div></Card>);}
function Leg({c,t}){return(<span className="flex items-center gap-1.5 text-ink-500"><span className={"w-3 h-3 rounded "+c}/>{t}</span>);}
function Fld({label,children}){return(<label className="block mb-3"><span className="text-[12px] text-ink-500 mb-1 block">{label}</span>{children}</label>);}
function Sel({v}){return(<div className="w-full h-10 px-3 rounded-lg border border-line text-sm text-ink-600 flex items-center justify-between">{v}<Icon n="chev" s={15} cls="text-ink-400"/></div>);}
function Stepper(){const[n,setN]=useState(0);return(<div className="flex items-center justify-between h-10 px-2 rounded-lg border border-line"><button onClick={()=>setN(Math.max(0,n-1))} className="w-7 h-7 grid place-items-center text-ink-400"><Icon n="minus" s={14}/></button><span className="tnum">{n}</span><button onClick={()=>setN(n+1)} className="w-7 h-7 grid place-items-center text-brand-600"><Icon n="plus" s={14}/></button></div>);}

/* ===================================================== HOLDS / APARTADOS ===================================================== */
function HoldsScreen() {
  const { can, gate } = usePerm();
  const holds=[["APT-000124","15/05/2024",PRODUCTS[0],"M","Beige",300,599,"29/05/2024","14 días","Activo"],
    ["APT-000123","10/05/2024",PRODUCTS[1],"32","Negro",500,699,"24/05/2024","9 días","Activo"],
    ["APT-000118","02/05/2024",PRODUCTS[2],"L","Gris",400,1199,"16/05/2024","1 día","Por vencer"]];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-4 h-full overflow-hidden">
      <div className="overflow-y-auto pr-1">
        <ScreenHead icon="bookmark" title="Apartados y cliente frecuente"/>
        <Card className="p-5">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-6 items-center">
            <div className="w-16 h-16 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold text-xl">MF</div>
            <div><div className="text-base font-semibold text-ink-900">{CUSTOMER.name}</div>
              <span className="inline-block my-1 text-[10px] font-semibold text-brand-700 bg-brand-100 px-2 py-0.5 rounded">Cliente frecuente</span>
              <div className="text-[12px] text-ink-500 space-y-0.5 mt-1"><div className="tnum">{CUSTOMER.phone}</div><div>{CUSTOMER.email}</div><div>Cliente desde: {CUSTOMER.since}</div></div></div>
            <div className="text-center px-6 border-l border-line"><div className="text-[11px] text-ink-400">Puntos acumulados</div>
              <div className="tnum text-2xl font-bold text-brand-600 mt-1">{CUSTOMER.pts} <span className="text-[12px] font-normal">pts</span></div>
              <div className="text-[11px] text-ink-500 mt-1">Nivel: {CUSTOMER.level} ●</div><button className="text-[12px] text-brand-600 font-medium mt-1">Ver beneficios</button></div>
            <div className="px-6 border-l border-line text-[12px]"><div className="font-semibold text-ink-900 mb-2">Resumen de compras</div>
              {[["Compras totales",mx(CUSTOMER.total)],["Número de compras",CUSTOMER.count],["Ticket promedio",mx(CUSTOMER.avg)],["Última compra",CUSTOMER.last]].map(([k,v])=>(
                <div key={k} className="flex justify-between gap-8 py-0.5"><span className="text-ink-400">{k}</span><span className="tnum text-ink-700">{v}</span></div>))}</div>
          </div>
        </Card>
        <div className="font-semibold text-ink-900 mt-5 mb-2">Apartados activos</div>
        <Card className="overflow-hidden">
          <table className="w-full text-[12px]">
            <thead><tr className="bg-surf text-ink-400 uppercase text-[10px]">{["Folio","Producto","Talla","Color","Anticipo","Saldo pendiente","Fecha límite","Estatus",""].map(h=><th key={h} className="text-left py-2.5 px-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{holds.map(([f,d,p,sz,col,ant,saldo,lim,dias,st])=>(<tr key={f} className="border-t border-line">
              <td className="px-3 py-3"><div className="tnum font-medium text-ink-900">{f}</div><div className="tnum text-ink-400">{d}</div></td>
              <td className="px-3"><div className="flex items-center gap-2"><Thumb p={p} size={34}/><div><div className="font-medium text-ink-900">{p.name}</div><div className="tnum text-ink-400">{p.sku}</div></div></div></td>
              <td className="px-3 text-ink-700">{sz}</td><td className="px-3"><span style={{background:swatch[col]}} className="w-4 h-4 rounded-full border border-black/10 inline-block"/></td>
              <td className="px-3 tnum text-ink-900">{mx(ant)}</td><td className="px-3 tnum text-ink-900">{mx(saldo)}</td>
              <td className="px-3"><div className="tnum text-ink-700">{lim}</div><div className={"text-[10px] "+(st==="Por vencer"?"text-amber-600":"text-ink-400")}>{dias}</div></td>
              <td className="px-3"><span className={"text-[11px] font-medium px-2 py-0.5 rounded "+(st==="Activo"?"bg-brand-100 text-brand-700":"bg-amber-100 text-amber-700")}>{st}</span></td>
              <td className="px-3 text-ink-400">⋮</td></tr>))}
              <tr className="border-t border-line bg-surf/50 text-[12px]"><td colSpan={4} className="px-3 py-3"><span className="text-ink-400">Anticipo total </span><span className="tnum font-semibold">{mx(1200)}</span></td>
                <td colSpan={3} className="px-3"><span className="text-ink-400">Saldo pendiente total </span><span className="tnum font-semibold">{mx(2497)}</span></td>
                <td colSpan={2} className="px-3"><span className="text-ink-400">Activos </span><span className="tnum font-semibold">3</span></td></tr></tbody>
          </table>
        </Card>
        <div className="flex gap-3 mt-4">
          <button className="flex-1 h-11 rounded-xl border-2 border-brand-200 text-brand-700 font-medium inline-flex items-center justify-center gap-2"><Icon n="card" s={16}/>Cobrar anticipo</button>
          <GhostBtn className="flex-1"><Icon n="dollar" s={16}/>Abonar</GhostBtn>
          <GhostBtn className="flex-1"><Icon n="box" s={16}/>Entregar</GhostBtn>
          <button onClick={()=>gate("cancel_hold",()=>{})} className="flex-1 h-11 rounded-xl border border-red-200 text-red-500 font-medium inline-flex items-center justify-center gap-2">{!can("cancel_hold")&&<Icon n="lock" s={15}/>}<Icon n="x" s={16}/>Cancelar apartado</button>
        </div>
      </div>
      <div className="space-y-4 overflow-y-auto">
        <Card className="p-5"><div className="flex items-center justify-between mb-3"><span className="font-semibold text-ink-900">Notas del cliente</span><button className="text-[12px] text-brand-600">Editar</button></div>
          <div className="p-3 rounded-xl bg-brand-50 border border-brand-100 text-[12px] text-ink-700 leading-relaxed">{CUSTOMER.note}</div>
          <button className="flex items-center gap-1.5 text-[12px] text-brand-600 font-medium mt-3"><Icon n="plus" s={14}/>Agregar nota</button></Card>
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Productos recomendados</div>
          {[PRODUCTS[3],PRODUCTS[6],PRODUCTS[7]].map(p=>(<div key={p.id} className="flex items-center gap-3 py-2 border-t border-line first:border-0">
            <Thumb p={p} size={40}/><div className="flex-1 min-w-0"><div className="text-[12px] font-medium text-ink-900 truncate">{p.name}</div><div className="tnum text-[11px] text-ink-400">{mx(p.price)}</div></div>
            <button className="w-8 h-8 grid place-items-center rounded-lg border border-line text-brand-600"><Icon n="plus" s={15}/></button></div>))}
          <button className="text-[12px] text-brand-600 font-medium mt-3 w-full text-center">Ver más productos</button></Card>
      </div>
    </div>
  );
}

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
  const inicial=2000, efectivo=8450, tarjeta=14320, qr=1890, entradas=500, salidas=300, gastos=450;
  const esperado=inicial+efectivo+entradas-salidas-gastos;
  const denoms=[1000,500,200,100,50,20,10,5,2,1];
  const [count,setCount]=useState({});
  const contado=denoms.reduce((a,d)=>a+d*(count[d]||0),0);
  const diff=contado-esperado;
  const moves=[["Apertura de caja","Monto inicial",inicial,"wallet"],["Entradas de efectivo","Cambio / feria",entradas,"plus"],["Salida de efectivo","Pago a proveedor",-salidas,"minus"],["Gasto","Limpieza de tienda",-gastos,"file"]];
  return (<div className="h-full overflow-y-auto">
    <ScreenHead icon="wallet" title="Caja / corte de caja" folio="CRT-000045" right={<div className="flex gap-2"><GateBtn ghost perm="open_cash_drawer"><Icon n="wallet" s={16}/>Abrir cajón</GateBtn><span className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl bg-brand-50 text-brand-700 text-[13px] font-medium border border-brand-100"><Icon n="clock" s={15}/>Turno abierto · 08:00</span></div>}/>
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[["Efectivo",efectivo,"cash"],["Tarjeta",tarjeta,"card"],["QR / Pago",qr,"qr"],["Total ventas",efectivo+tarjeta+qr,"chart"]].map(([k,v,ic])=>(
            <Card key={k} className="p-4 min-w-0"><div className="flex items-center gap-1.5 text-[11px] text-ink-400 min-w-0"><Icon n={ic} s={14} cls="text-brand-600 shrink-0"/><span className="truncate">{k}</span></div>
              <div className="tnum text-base font-bold text-ink-900 mt-1">{mx(v)}</div></Card>))}
        </div>
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Movimientos del turno</div>
          {moves.map(([k,sub,v,ic])=>(<div key={k} className="flex items-center gap-3 py-2.5 border-t border-line first:border-0">
            <div className={"w-8 h-8 rounded-lg grid place-items-center "+(v<0?"bg-red-50 text-red-500":"bg-brand-50 text-brand-600")}><Icon n={ic} s={15}/></div>
            <div className="flex-1"><div className="text-[13px] text-ink-900">{k}</div><div className="text-[11px] text-ink-400">{sub}</div></div>
            <span className={"tnum font-medium "+(v<0?"text-red-500":"text-ink-900")}>{v<0?"- ":""}{mx(Math.abs(v))}</span></div>))}
          <div className="flex gap-2 mt-3"><GhostBtn className="flex-1"><Icon n="plus" s={15}/>Entrada</GhostBtn><GhostBtn className="flex-1"><Icon n="minus" s={15}/>Salida</GhostBtn><GhostBtn className="flex-1"><Icon n="file" s={15}/>Gasto</GhostBtn></div>
          <div className="flex items-center justify-between py-3 mt-3 border-t-2 border-line"><span className="font-semibold text-ink-900">Total esperado en efectivo</span><span className="tnum text-xl font-bold text-brand-600">{mx(esperado)}</span></div>
        </Card>
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Conteo de efectivo</div>
          <div className="grid grid-cols-5 gap-3">{denoms.map(d=>(<div key={d}><div className="text-[11px] text-ink-400 mb-1 tnum">${d}</div>
            <input type="number" min="0" value={count[d]||""} onChange={e=>setCount(c=>({...c,[d]:Math.max(0,parseInt(e.target.value)||0)}))} placeholder="0"
              className="w-full h-10 px-2 rounded-lg border border-line text-center tnum text-sm outline-none focus:border-brand-500"/></div>))}</div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Cierre de turno</div>
          <div className="flex items-center justify-between text-[13px] py-1"><span className="text-ink-500">Esperado</span><span className="tnum font-medium">{mx(esperado)}</span></div>
          <div className="flex items-center justify-between text-[13px] py-1"><span className="text-ink-500">Contado</span><span className="tnum font-medium">{mx(contado)}</span></div>
          <div className={"flex items-center justify-between p-3 rounded-xl mt-2 text-[13px] "+(diff===0?"bg-brand-50 border border-brand-100":"bg-amber-50 border border-amber-100")}>
            <span className={"font-medium "+(diff===0?"text-brand-700":"text-amber-700")}>Diferencia</span>
            <span className={"tnum font-bold "+(diff===0?"text-brand-700":"text-amber-700")}>{diff<0?"- ":diff>0?"+ ":""}{mx(Math.abs(diff))}</span></div>
          <GateBtn className="w-full mt-4" perm="manage_cash_shift">Cerrar turno</GateBtn>
          <GhostBtn className="w-full mt-2"><Icon n="printer" s={16}/>Imprimir ticket de corte</GhostBtn>
          <GateBtn ghost className="w-full mt-2" perm="manage_cash_shift"><Icon n="dollar" s={16}/>Corte parcial</GateBtn>
        </Card>
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Ticket de corte</div>
          <div className="rounded-xl bg-surf border border-line p-4 text-[12px] tnum text-ink-600 leading-relaxed">
            <div className="text-center font-semibold text-ink-900 mb-2">MODA+ · Polanco</div>
            <div className="flex justify-between"><span>Corte</span><span>CRT-000045</span></div>
            <div className="flex justify-between"><span>Cajero</span><span>Carla Méndez</span></div>
            <div className="border-t border-dashed border-line my-2"/>
            <div className="flex justify-between"><span>Efectivo</span><span>{mx(efectivo)}</span></div>
            <div className="flex justify-between"><span>Tarjeta</span><span>{mx(tarjeta)}</span></div>
            <div className="flex justify-between"><span>QR</span><span>{mx(qr)}</span></div>
            <div className="border-t border-dashed border-line my-2"/>
            <div className="flex justify-between font-semibold text-ink-900"><span>Esperado</span><span>{mx(esperado)}</span></div>
          </div>
        </Card>
      </div>
    </div>
  </div>);
}

/* ===================================================== REPORTS ===================================================== */
function ReportsScreen() {
  const [range,setRange]=useState("Hoy");
  const kpis=[["Ventas del día","$42,580.00","+12% vs ayer","chart"],["Tickets","53","+5","cart"],["Ticket promedio","$803.40","+3%","dollar"],["Utilidad estimada","$18,940.00","44% margen","tag"]];
  const top=[[PRODUCTS[0],18,16182],[PRODUCTS[3],11,20790],[PRODUCTS[2],9,14391],[PRODUCTS[4],8,11600],[PRODUCTS[9],7,7693]];
  const hours=[3,5,8,12,18,22,28,24,19,14,9,5];
  const pays=[["Tarjeta",24320,"card","bg-brand-500"],["Efectivo",12450,"cash","bg-emerald-400"],["QR / Pago",4310,"qr","bg-teal-400"],["Transferencia",1500,"swap","bg-lime-400"]];
  const payTotal=pays.reduce((a,p)=>a+p[1],0);
  const cats=[["Mujer",62,28400],["Accesorios",18,8200],["Calzado",12,3980],["Hombre",8,2000]];
  const cajeros=[["Carla Méndez",53,42580],["Luis Ortega",37,29100],["Diana Sosa",24,18650]];
  const low=[[PRODUCTS[2],"Gris / XL",2],[PRODUCTS[4],"Azul Claro / 34",3],[PRODUCTS[0],"Negro / XS",2],[PRODUCTS[7],"Negro / 27",1]];
  return (<div className="h-full overflow-y-auto">
    <ScreenHead icon="chart" title="Reportes de ventas" right={<div className="flex gap-2 items-center">
      <div className="flex gap-1 p-1 rounded-xl bg-surf border border-line">{["Hoy","Semana","Mes"].map(r=><button key={r} onClick={()=>setRange(r)} className={"h-8 px-3 rounded-lg text-[12px] font-medium "+(range===r?"bg-card shadow-sm text-ink-900":"text-ink-500")}>{r}</button>)}</div>
      <GhostBtn><Icon n="file" s={16}/>Exportar CSV</GhostBtn><GhostBtn><Icon n="printer" s={16}/>Imprimir</GhostBtn></div>}/>
    <div className="grid grid-cols-4 gap-4 mb-4">{kpis.map(([k,v,d,ic])=>(<Card key={k} className="p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-400"><Icon n={ic} s={14} cls="text-brand-600"/>{k}</div>
      <div className="tnum text-2xl font-bold text-ink-900 mt-1">{v}</div><div className="text-[12px] text-brand-600 font-medium mt-1">{d}</div></Card>))}</div>
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 mb-4">
      <Card className="p-5"><div className="font-semibold text-ink-900 mb-4">Ventas por hora</div>
        <div className="flex items-end gap-2 h-48">{hours.map((h,i)=>(<div key={i} className="flex-1 flex flex-col items-center gap-1 group">
          <span className="tnum text-[9px] text-ink-400 opacity-0 group-hover:opacity-100">{h}</span>
          <div style={{height:(h/28*100)+"%"}} className="w-full rounded-t-lg bg-brand-500/80 hover:bg-brand-600 min-h-[4px] transition-colors"/><span className="tnum text-[9px] text-ink-400">{9+i}h</span></div>))}</div></Card>
      <Card className="p-5"><div className="font-semibold text-ink-900 mb-4">Ventas por método de pago</div>
        {pays.map(([m,v,ic,bar])=>{const pct=Math.round(v/payTotal*100);return(<div key={m} className="mb-3">
          <div className="flex items-center justify-between text-[12px] mb-1"><span className="flex items-center gap-1.5 text-ink-600"><Icon n={ic} s={14} cls="text-ink-400"/>{m}</span><span className="tnum text-ink-900 font-medium">{mx(v)} <span className="text-ink-400">· {pct}%</span></span></div>
          <div className="h-2 rounded-full bg-surf overflow-hidden"><div style={{width:pct+"%"}} className={"h-full rounded-full "+bar}/></div></div>);})}</Card>
    </div>
    <div className="grid grid-cols-3 gap-4">
      <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Productos más vendidos</div>
        {top.map(([p,u,t])=>(<div key={p.id} className="flex items-center gap-3 py-2 border-t border-line first:border-0"><Thumb p={p} size={36}/>
          <div className="flex-1 min-w-0"><div className="text-[12px] font-medium text-ink-900 truncate">{p.name}</div><div className="tnum text-[11px] text-ink-400">{u} pzas.</div></div>
          <div className="tnum text-[12px] font-semibold text-ink-900">{mx(t)}</div></div>))}</Card>
      <div className="space-y-4">
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Top categorías</div>
          {cats.map(([c,pct,v])=>(<div key={c} className="mb-2.5"><div className="flex justify-between text-[12px] mb-1"><span className="text-ink-600">{c}</span><span className="tnum text-ink-900">{mx(v)}</span></div>
            <div className="h-2 rounded-full bg-surf overflow-hidden"><div style={{width:pct+"%"}} className="h-full rounded-full bg-brand-500"/></div></div>))}</Card>
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Ventas por cajero</div>
          {cajeros.map(([n,t,v])=>(<div key={n} className="flex items-center gap-3 py-1.5 text-[12px]"><div className="w-7 h-7 rounded-full bg-brand-100 grid place-items-center text-brand-700 text-[10px] font-semibold">{n.split(" ").map(x=>x[0]).join("")}</div>
            <span className="flex-1 text-ink-700">{n}</span><span className="tnum text-ink-400">{t} tk</span><span className="tnum font-semibold text-ink-900 w-20 text-right">{mx(v)}</span></div>))}</Card>
      </div>
      <Card className="p-5"><div className="flex items-center gap-1.5 font-semibold text-ink-900 mb-3"><Icon n="alert" s={16} cls="text-amber-500"/>Stock bajo</div>
        {low.map(([p,v,n])=>(<div key={p.id+v} className="flex items-center gap-3 py-2 border-t border-line first:border-0"><Thumb p={p} size={34}/>
          <div className="flex-1 min-w-0"><div className="text-[12px] font-medium text-ink-900 truncate">{p.name}</div><div className="text-[11px] text-ink-400">{v}</div></div>
          <span className={"tnum text-[12px] font-semibold px-2 py-0.5 rounded "+(n<3?"bg-red-100 text-red-600":"bg-amber-100 text-amber-700")}>{n} pz</span></div>))}
        <GhostBtn className="w-full mt-3 text-[12px]">Generar orden de reabasto</GhostBtn></Card>
    </div>
  </div>);
}

/* ===================================================== SIMPLE SCREENS ===================================================== */
function ClientsScreen({ go }) {
  const [q,setQ]=useState(""); const [idx,setIdx]=useState(0);
  const list=CLIENTS.filter(c=>!q||(c.name+c.phone).toLowerCase().includes(q.toLowerCase()));
  const c=list[idx]||CLIENTS[0];
  const lvlColor={Platino:"bg-slate-100 text-slate-700",Oro:"bg-amber-100 text-amber-700",Plata:"bg-zinc-100 text-zinc-600"};
  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4 h-full">
      <Card className="flex flex-col overflow-hidden">
        <div className="p-3 border-b border-line">
          <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-surf border border-line"><Icon n="search" s={16} cls="text-ink-400"/>
            <input value={q} onChange={e=>{setQ(e.target.value);setIdx(0);}} placeholder="Buscar por nombre o teléfono" className="flex-1 bg-transparent outline-none text-[13px]"/></label>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {list.map((cl,i)=>(<button key={cl.name} onClick={()=>setIdx(i)} className={"w-full flex items-center gap-3 p-2.5 rounded-xl text-left mb-1 "+(i===idx?"bg-brand-100":"hover:bg-surf")}>
            <div className="w-10 h-10 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-semibold text-[13px]">{cl.init}</div>
            <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink-900 truncate">{cl.name}</div><div className="tnum text-[11px] text-ink-400">{cl.phone}</div></div>
            <span className={"text-[10px] font-medium px-2 py-0.5 rounded "+(lvlColor[cl.level]||"bg-surf text-ink-500")}>{cl.level}</span></button>))}
        </div>
        <div className="p-3 border-t border-line"><GhostBtn className="w-full"><Icon n="plus" s={16}/>Nuevo cliente</GhostBtn></div>
      </Card>
      <div className="overflow-y-auto pr-1 space-y-4">
        <ScreenHead icon="users" title="Clientes frecuentes"/>
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold text-xl">{c.init}</div>
            <div className="flex-1"><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-ink-900">{c.name}</h2>
              <span className={"text-[11px] font-medium px-2 py-0.5 rounded "+(lvlColor[c.level]||"bg-surf")}>Nivel {c.level}</span></div>
              <div className="text-[12px] text-ink-500 mt-1 space-y-0.5"><div className="tnum">{c.phone} · {c.email}</div><div>Cliente desde: {c.since}</div></div></div>
            <div className="flex gap-2"><button onClick={()=>go("venta")} className="h-10 px-4 rounded-xl bg-brand-600 text-white text-[13px] font-medium">Iniciar venta</button>
              <GhostBtn className="h-10"><Icon n="tag" s={15}/>Descuento VIP</GhostBtn></div>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-5">
            {[["Compras totales",mx(c.total)],["N° de compras",c.count],["Ticket promedio",mx(c.avg)],["Puntos de lealtad",c.pts+" pts"]].map(([k,v])=>(
              <div key={k} className="p-3 rounded-xl bg-surf"><div className="text-[11px] text-ink-400">{k}</div><div className="tnum text-lg font-bold text-ink-900 mt-0.5">{v}</div></div>))}
          </div>
        </Card>
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-4">
          <Card className="p-5">
            <div className="font-semibold text-ink-900 mb-3">Historial de compras</div>
            <table className="w-full text-[12px]"><thead><tr className="text-ink-400 uppercase text-[10px] border-b border-line">
              <th className="text-left py-2 font-semibold">Folio</th><th className="text-left font-semibold">Fecha</th><th className="text-center font-semibold">Artículos</th><th className="text-right font-semibold">Total</th></tr></thead>
              <tbody>{c.history.map(([f,d,n,t])=>(<tr key={f} className="border-b border-line/70"><td className="tnum py-2.5 text-ink-700">{f}</td><td className="tnum text-ink-500">{d}</td><td className="tnum text-center text-ink-700">{n}</td><td className="tnum text-right font-semibold text-ink-900">{mx(t)}</td></tr>))}</tbody></table>
          </Card>
          <div className="space-y-4">
            <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Preferencias</div>
              <div className="flex flex-wrap gap-2">{c.prefs.map(p=><span key={p} className="text-[12px] text-brand-700 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-lg">{p}</span>)}</div></Card>
            <Card className="p-5"><div className="flex items-center justify-between mb-2"><span className="font-semibold text-ink-900">Notas del vendedor</span><button className="text-[12px] text-brand-600">Editar</button></div>
              <p className="text-[12px] text-ink-600 leading-relaxed">{c.note}</p></Card>
          </div>
        </div>
      </div>
    </div>
  );
}
function ReturnsScreen() {
  const ticket={folio:"VTA-000012339",date:"18/05/2024",client:"María Fernanda López",items:[PRODUCTS[0],PRODUCTS[4],PRODUCTS[6]]};
  const [sel,setSel]=useState({}); const [tipo,setTipo]=useState("Cambio por talla"); const [motivo,setMotivo]=useState("Talla incorrecta");
  const toggle=(id)=>setSel(s=>({...s,[id]:!s[id]}));
  const chosen=ticket.items.filter(p=>sel[p.id]);
  const monto=chosen.reduce((a,p)=>a+p.price,0);
  const esCambio=tipo.startsWith("Cambio");
  return (<div className="h-full overflow-y-auto"><ScreenHead icon="return" title="Devoluciones y cambios" folio="DEV nueva"/>
    <Card className="p-4 mb-4"><div className="flex gap-3 items-center"><label className="flex items-center gap-3 h-12 px-4 rounded-xl bg-surf border border-line flex-1 max-w-2xl"><Icon n="search" s={18} cls="text-ink-400"/><input defaultValue={ticket.folio} placeholder="Buscar ticket por folio, cliente o código" className="flex-1 bg-transparent outline-none text-sm"/><Icon n="scan" s={18} cls="text-ink-400"/></label><GhostBtn>Buscar ticket</GhostBtn></div></Card>
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3"><div className="font-semibold text-ink-900">Ticket {ticket.folio}</div><div className="text-[12px] text-ink-400">{ticket.client} · {ticket.date}</div></div>
          {ticket.items.map(p=>{const on=sel[p.id];return(<label key={p.id} className={"flex items-center gap-3 py-3 border-t border-line first:border-0 cursor-pointer "+(on?"":"")}>
            <input type="checkbox" checked={!!on} onChange={()=>toggle(p.id)} className="w-4 h-4 accent-brand-600"/><Thumb p={p}/>
            <div className="flex-1"><div className="text-[13px] font-medium text-ink-900">{p.name}</div><div className="tnum text-[11px] text-ink-400">{p.sku} · {p.color} / {p.size}</div></div>
            <div className="tnum text-[13px] font-semibold">{mx(p.price)}</div></label>);})}
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 py-3 font-semibold text-ink-900 border-b border-line">Historial de devoluciones</div>
          <table className="w-full text-[12px]"><thead><tr className="bg-surf text-ink-400 uppercase text-[10px]">{["Folio","Fecha","Cliente","Producto","Tipo","Estatus","Monto"].map(h=><th key={h} className="text-left py-2.5 px-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{RETURNS.map(([f,d,cl,p,t,st,m])=>(<tr key={f} className="border-t border-line"><td className="tnum px-3 py-2.5 text-ink-700">{f}</td><td className="tnum px-3 text-ink-500">{d}</td><td className="px-3 text-ink-700">{cl}</td><td className="px-3 text-ink-700">{p.name}</td><td className="px-3 text-ink-500">{t}</td><td className="px-3"><span className="text-[11px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded">{st}</span></td><td className={"tnum px-3 font-medium "+(m<0?"text-red-500":"text-ink-500")}>{m===0?"—":mx(m)}</td></tr>))}</tbody></table>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-5"><div className="font-semibold text-ink-900 mb-3">Tipo de devolución</div>
          {[["Cambio por talla","swap"],["Cambio por color","swap"],["Devolución de dinero","cash"],["Nota de crédito","file"]].map(([t,ic])=>{const on=tipo===t;return(
            <button key={t} onClick={()=>setTipo(t)} className={"w-full flex items-center gap-3 p-3 rounded-xl border mb-2 text-left "+(on?"border-brand-500 bg-brand-50":"border-line hover:bg-surf")}>
              <Icon n={ic} s={18} cls={on?"text-brand-600":"text-ink-400"}/><span className="text-[13px] text-ink-900">{t}</span>{on&&<Icon n="check" s={16} cls="text-brand-600 ml-auto"/>}</button>);})}
        </Card>
        <Card className="p-5">
          <Fld label="Motivo"><select value={motivo} onChange={e=>setMotivo(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-line text-sm outline-none focus:border-brand-500">
            {["Talla incorrecta","Color no deseado","Defecto de fábrica","No le gustó","Otro"].map(o=><option key={o}>{o}</option>)}</select></Fld>
          {esCambio&&<Fld label="Nueva variante"><Sel v="Seleccionar color y talla"/></Fld>}
          <div className="rounded-xl bg-surf border border-line p-3 mt-1 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><span className="text-ink-500">Artículos</span><span className="tnum">{chosen.length}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Monto</span><span className="tnum">{mx(monto)}</span></div>
            <div className="flex justify-between pt-1.5 border-t border-line"><span className="font-medium text-ink-900">{esCambio?"Diferencia a cobrar":"A devolver"}</span><span className={"tnum font-bold "+(esCambio?"text-ink-900":"text-red-500")}>{esCambio?mx(0):"- "+mx(monto)}</span></div>
          </div>
          <GateBtn className="w-full mt-3" perm={tipo==="Devolución de dinero"?"refund_cash":"process_return"} onClick={()=>{}}>{esCambio?"Procesar cambio":"Procesar devolución"}</GateBtn>
        </Card>
      </div>
    </div></div>);
}
function Toggle({on,set}){return(<button onClick={()=>set(!on)} className={"w-11 h-6 rounded-full transition-colors relative "+(on?"bg-brand-600":"bg-line")}>
  <span className={"absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-all "+(on?"left-[22px]":"left-0.5")}/></button>);}
function SetRow({label,sub,children}){return(<div className="flex items-center justify-between py-3 border-t border-line first:border-0">
  <div><div className="text-[13px] font-medium text-ink-900">{label}</div>{sub&&<div className="text-[11px] text-ink-400">{sub}</div>}</div>{children}</div>);}
function TInput({v}){return <input defaultValue={v} className="h-9 px-3 rounded-lg border border-line text-[13px] outline-none focus:border-brand-500 min-w-[200px]"/>;}

function SettingsScreen({ theme, setTheme }) {
  const groups=[["Datos de tienda","store"],["Sucursales","store"],["Cajeros y roles","users"],["Impresora térmica","printer"],["Cajón de dinero","wallet"],["Lector de código","scan"],["Impuestos","file"],["Métodos de pago","card"],["Ticket y logo","tag"],["Apariencia","gear"],["Seguridad con PIN","gear"]];
  const [sel,setSel]=useState(0);
  const [tg,setTg]=useState({drawer:true,scan:true,dark:false,sound:true,cfdi:true,pin:true,iva:true,msi:true});
  const t=(k)=>setTg(s=>({...s,[k]:!s[k]}));
  const panels={
    0:<><SectionTitle t="Datos de tienda"/><SetRow label="Nombre comercial"><TInput v="MODA+ Boutique"/></SetRow><SetRow label="Razón social"><TInput v="Moda Plus S.A. de C.V."/></SetRow><SetRow label="RFC"><TInput v="MPL230114AB1"/></SetRow><SetRow label="Teléfono"><TInput v="55 1234 0000"/></SetRow><SetRow label="Dirección"><TInput v="Av. Presidente Masaryk 100, Polanco"/></SetRow></>,
    3:<><SectionTitle t="Impresora térmica"/><SetRow label="Impresora" sub="Conectada por USB"><span className="text-[12px] text-brand-600 font-medium">EPSON TM-T20III ●</span></SetRow><SetRow label="Ancho de papel"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">80 mm ⌄</span></SetRow><SetRow label="Imprimir automáticamente" sub="Al completar la venta"><Toggle on={tg.sound} set={()=>t("sound")}/></SetRow><SetRow label="Copias por ticket"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">1 ⌄</span></SetRow><GhostBtn className="mt-4"><Icon n="printer" s={16}/>Imprimir página de prueba</GhostBtn></>,
    4:<><SectionTitle t="Cajón de dinero"/><SetRow label="Cajón conectado" sub="Pulso por impresora"><Toggle on={tg.drawer} set={()=>t("drawer")}/></SetRow><SetRow label="Abrir al cobrar en efectivo"><Toggle on={tg.drawer} set={()=>t("drawer")}/></SetRow><SetRow label="Requiere PIN para abrir manualmente"><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><GhostBtn className="mt-4"><Icon n="wallet" s={16}/>Probar apertura</GhostBtn></>,
    5:<><SectionTitle t="Lector de código de barras"/><SetRow label="Lector habilitado" sub="Modo teclado (HID)"><Toggle on={tg.scan} set={()=>t("scan")}/></SetRow><SetRow label="Prefijo de escaneo"><TInput v="(ninguno)"/></SetRow><SetRow label="Sonido al escanear"><Toggle on={tg.sound} set={()=>t("sound")}/></SetRow><div className="mt-4 p-3 rounded-xl bg-surf border border-line text-[12px] text-ink-500">Escanea cualquier código para probar la lectura…</div></>,
    6:<><SectionTitle t="Impuestos"/><SetRow label="IVA habilitado" sub="16% general"><Toggle on={tg.iva} set={()=>t("iva")}/></SetRow><SetRow label="Tasa de IVA"><TInput v="16%"/></SetRow><SetRow label="Precios incluyen IVA"><Toggle on={tg.iva} set={()=>t("iva")}/></SetRow><SetRow label="Facturación CFDI 4.0"><Toggle on={tg.cfdi} set={()=>t("cfdi")}/></SetRow></>,
    7:<><SectionTitle t="Métodos de pago"/>{[["Efectivo","cash",true],["Tarjeta (terminal)","card",true],["QR / Pago","qr",true],["Transferencia SPEI","swap",true],["Meses sin intereses","card",tg.msi]].map(([m,ic,on])=>(<SetRow key={m} label={<span className="flex items-center gap-2"><Icon n={ic} s={16} cls="text-ink-400"/>{m}</span>}><Toggle on={m==="Meses sin intereses"?tg.msi:true} set={()=>m==="Meses sin intereses"&&t("msi")}/></SetRow>))}</>,
    9:<><SectionTitle t="Apariencia"/><SetRow label="Tema oscuro" sub="Cambia toda la interfaz"><Toggle on={theme==="dark"} set={()=>setTheme(theme==="dark"?"light":"dark")}/></SetRow><SetRow label="Color de acento"><div className="flex gap-2">{["#3c7d5d","#2563eb","#7c3aed","#dc2626"].map(c=><span key={c} style={{background:c}} className={"w-7 h-7 rounded-full border-2 "+(c==="#3c7d5d"?"border-ink-900":"border-transparent")}/>)}</div></SetRow><SetRow label="Densidad de la interfaz"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">Cómoda ⌄</span></SetRow></>,
    10:<><SectionTitle t="Seguridad con PIN"/><SetRow label="Requiere PIN al iniciar" ><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><SetRow label="PIN para descuentos > 20%"><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><SetRow label="PIN para cancelaciones"><Toggle on={tg.pin} set={()=>t("pin")}/></SetRow><SetRow label="Cerrar sesión por inactividad"><span className="text-[13px] text-ink-700 border border-line rounded-lg px-3 py-1.5">10 min ⌄</span></SetRow></>,
  };
  const generic=(name)=><><SectionTitle t={name}/><div className="py-10 text-center text-ink-400 text-sm">Configuración de <span className="font-medium text-ink-600">{name}</span> · panel de demo.</div></>;
  return (<div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4 h-full">
    <Card className="p-2 overflow-y-auto">{groups.map(([g,ic],i)=>(<button key={g} onClick={()=>setSel(i)} className={"w-full flex items-center gap-3 h-11 px-3 rounded-xl text-left text-[13px] font-medium mb-0.5 "+(sel===i?"bg-brand-100 text-brand-700":"text-ink-600 hover:bg-surf")}>
      <Icon n={ic} s={18}/>{g}</button>))}</Card>
    <div className="overflow-y-auto"><ScreenHead icon="gear" title="Configuración"/>
      <Card className="p-6 max-w-3xl">{panels[sel]||generic(groups[sel][0])}
        <div className="flex gap-2 mt-6 pt-4 border-t border-line"><PrimaryBtn>Guardar cambios</PrimaryBtn><GhostBtn>Cancelar</GhostBtn></div></Card></div>
  </div>);
}
function SectionTitle({t}){return <div className="text-base font-semibold text-ink-900 mb-2">{t}</div>;}

/* ============================== DATA LAYER (backend real) ============================== */
const DataCtx = createContext(null);
function useData(){ return useContext(DataCtx) || { products:[], online:false, demo:true, session:null }; }
// Catálogo en vivo si existe; si no (sin login / sin productos retail), cae al demo.
function useProducts(){ const d=useContext(DataCtx); return (d && d.products && d.products.length) ? d.products : PRODUCTS; }
// Resuelve el skuId real de una variante color/talla; undefined en productos demo.
function resolveSkuId(p, color, size){
  if(!p || !p.live || !p.skuByVariant) return undefined;
  return p.skuByVariant[color+"::"+size] || Object.values(p.skuByVariant)[0] || undefined;
}

function BootSplash(){
  return (<div className="h-full grid place-items-center bg-body">
    <div className="text-center">
      <div className="text-2xl font-bold tracking-tight text-ink-900">MODA<span className="text-brand-600">+</span></div>
      <div className="text-[10px] tracking-[0.28em] text-ink-400 mt-1">SMART RETAIL FLOW</div>
      <div className="mt-5 w-6 h-6 mx-auto rounded-full border-2 border-line border-t-brand-500 animate-spin"/>
    </div></div>);
}

function LoginScreen({ onLogin, onDemo }){
  const [pin,setPin]=useState("");
  const [loc,setLoc]=useState("");
  const [url,setUrl]=useState("");
  const [cfg,setCfg]=useState(false);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  useEffect(()=>{ setUrl(getApiUrl()); const t=getTenant(); setLoc(t.locationId||""); },[]);
  const submit=async()=>{
    setErr("");
    if(pin.length<4){ setErr("Ingresa tu PIN de 4 dígitos."); return; }
    if(!loc.trim()){ setErr("Configura la sucursal (locationId) antes de entrar."); setCfg(true); return; }
    setBusy(true);
    try{
      if(url.trim()) setApiUrl(url.trim());
      setTenant({ locationId: loc.trim() });
      const emp=await Retail.loginPin(pin, loc.trim());
      await onLogin(emp);
    }catch(e){
      setErr(e?.status===401 || e?.status===400 ? "PIN o sucursal incorrectos." : (e?.message||"No se pudo iniciar sesión."));
      setPin("");
    }finally{ setBusy(false); }
  };
  const key=(d)=>{ if(d==="del") setPin(p=>p.slice(0,-1)); else if(d==="ok") submit(); else setPin(p=>(p+d).slice(0,4)); };
  return (<div className="h-full grid place-items-center bg-body p-6">
    <div className="w-full max-w-[380px]">
      <div className="text-center mb-6">
        <div className="text-3xl font-bold tracking-tight text-ink-900">MODA<span className="text-brand-600">+</span></div>
        <div className="text-[10px] tracking-[0.28em] text-ink-400 mt-1">SMART RETAIL FLOW</div>
      </div>
      <div className="bg-card border border-line rounded-2xl shadow-sm p-6">
        <div className="text-[14px] font-semibold text-ink-900 text-center">Ingresa tu PIN</div>
        <div className="text-[12px] text-ink-400 text-center mt-1">Acceso de empleado</div>
        <div className="flex justify-center gap-3 my-5">
          {[0,1,2,3].map(i=>(<div key={i} className={"w-3.5 h-3.5 rounded-full border "+(pin.length>i?"bg-brand-500 border-brand-500":"border-line")}/>))}
        </div>
        {err && <div className="text-[12px] text-red-500 text-center mb-3">{err}</div>}
        <div className="grid grid-cols-3 gap-2.5">
          {["1","2","3","4","5","6","7","8","9"].map(d=>(
            <button key={d} onClick={()=>key(d)} className="h-12 rounded-xl border border-line bg-surf hover:bg-card tnum text-lg text-ink-900 transition-colors">{d}</button>))}
          <button onClick={()=>key("del")} className="h-12 rounded-xl border border-line hover:bg-surf grid place-items-center text-ink-400"><Icon n="x" s={18}/></button>
          <button onClick={()=>key("0")} className="h-12 rounded-xl border border-line bg-surf hover:bg-card tnum text-lg text-ink-900">0</button>
          <button onClick={()=>key("ok")} disabled={busy} className="h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white grid place-items-center disabled:opacity-50">{busy?<span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"/>:<Icon n="check" s={18} c="#fff"/>}</button>
        </div>
        <button onClick={()=>setCfg(c=>!c)} className="w-full mt-4 text-[11px] text-ink-400 hover:text-ink-700 flex items-center justify-center gap-1.5"><Icon n="gear" s={13}/>Configurar conexión</button>
        {cfg && <div className="mt-3 space-y-2 pt-3 border-t border-line">
          <div><div className="text-[11px] text-ink-500 mb-1">URL del backend</div>
            <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://api.mrtpvrest.com" className="w-full h-9 rounded-lg border border-line bg-surf px-3 text-[12px] outline-none focus:border-brand-500"/></div>
          <div><div className="text-[11px] text-ink-500 mb-1">Sucursal (locationId)</div>
            <input value={loc} onChange={e=>setLoc(e.target.value)} placeholder="cmp53hk1l…" className="w-full h-9 rounded-lg border border-line bg-surf px-3 text-[12px] tnum outline-none focus:border-brand-500"/></div>
        </div>}
      </div>
      <button onClick={onDemo} className="w-full mt-4 text-[12px] text-ink-400 hover:text-brand-600 transition-colors">Explorar en modo demostración →</button>
    </div>
  </div>);
}

function Root(){
  const [products,setProducts]=useState([]);
  const [online,setOnline]=useState(false);
  const [session,setSession]=useState(null);
  const [demo,setDemo]=useState(false);
  const [ready,setReady]=useState(false);

  const loadCatalog=async()=>{
    try{ const ps=await Retail.fetchCatalog(); setProducts(ps); setOnline(true); return ps; }
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
    try{ const s=Retail.getSession(); if(s && getToken()){ setSession(s); await loadCatalog(); } }
    catch{ /* sesión corrupta → login */ }
    setReady(true);
  })(); },[]);

  if(!ready) return <div className="h-screen"><BootSplash/></div>;
  if(!session && !demo){
    return <div className="h-screen"><LoginScreen onDemo={()=>setDemo(true)} onLogin={async(emp)=>{ setSession(emp); await loadCatalog(); }}/></div>;
  }
  const value={ products, online, demo, session,
    refreshCatalog:loadCatalog,
    logout:()=>{ Retail.logout(); setSession(null); setDemo(false); setOnline(false); setProducts([]); } };
  return (<DataCtx.Provider value={value}><App/></DataCtx.Provider>);
}

/* ===================================================== APP ===================================================== */
function App() {
  const data=useData();
  const products=useProducts();
  const [screen,setScreen]=useState("venta");
  const [query,setQuery]=useState("");
  const [sel,setSel]=useState(()=>products[0]||PRODUCTS[0]);
  // POS real: el carrito arranca vacío (el cajero escanea/agrega productos).
  const [cart,setCart]=useState([]);
  const [sale,setSale]=useState(null);
  const [role,setRole]=useState("Cajera");
  const [grants,setGrants]=useState({});
  const [ov,setOv]=useState(null);
  const [toast,setToast]=useState("");
  const [theme,setTheme]=useState("light");
  const [navOpen,setNavOpen]=useState(false);
  useEffect(()=>{ setGrants({}); },[role]);
  useEffect(()=>{ document.documentElement.setAttribute("data-theme",theme); },[theme]);
  const can=(p)=>hasPerm(role,p)||!!grants[p];
  const gate=(perm,fn)=>{ if(hasPerm(role,perm)||grants[perm]){ fn&&fn(); } else { setOv({perm,fn}); } };
  const titles={venta:"Venta activa",catalogo:"Catálogo de productos",clientes:"Clientes frecuentes",inventario:"Inventario por talla y color",apartados:"Apartados y cliente frecuente",devoluciones:"Devoluciones y cambios",caja:"Caja / corte de caja",reportes:"Reportes",config:"Configuración",checkout:"Checkout y métodos de pago",success:"Venta completada"};

  const cobrar=()=>{ if(cart.length) setScreen("checkout"); };
  const approve=async(total,method,payLines)=>{
    const subtotal=cart.reduce((s,l)=>s+l.price*l.qty,0);
    const desc=Math.round(subtotal*0.15*100)/100;
    const iva=Math.round((subtotal-desc)*0.16*100)/100;
    // Venta real al backend solo si hay sesión online y TODAS las líneas tienen skuId
    // (catálogo en vivo). Demo / offline → se completa localmente con folio temporal.
    const canOnline=data.online && cart.length>0 && cart.every(l=>l.skuId);
    if(canOnline){
      try{
        const payments=(payLines&&payLines.length?payLines:[{method,amount:total}])
          .map(pl=>({method:Retail.toPaymentMethod(pl.method||method),amount:Math.round(pl.amount*100)/100}));
        const r=await Retail.createSale({ lines:cart.map(l=>({skuId:l.skuId,quantity:l.qty})), payments, discount:desc, tax:iva });
        setSale({ total:Number(r.sale.total), method, items:cart, subtotal, desc, folio:r.sale.folio });
        setScreen("success");
        if(data.refreshCatalog) data.refreshCatalog();
        return;
      }catch(e){ setToast("No se pudo cobrar en línea ("+(e.message||e)+"). Registrada localmente."); }
    }
    setSale({ total, method, items:cart, subtotal, desc, folio:"VTA-"+String(Date.now()).slice(-9) });
    setScreen("success");
  };
  const newSale=()=>{ setCart([]); setSale(null); setScreen("venta"); };

  useEffect(()=>{ const h=(e)=>{
    if(e.key==="F1"){e.preventDefault();newSale();}
    else if(e.key==="F2"){e.preventDefault();document.getElementById("globalsearch")?.focus();}
    else if(e.key==="F3"){e.preventDefault();setScreen("clientes");}
    else if(e.key==="F5"){e.preventDefault();cobrar();}
    else if(e.key==="F6"){e.preventDefault();setScreen("apartados");}
    else if(e.key==="F7"){e.preventDefault();setScreen("devoluciones");}
    else if(e.key==="F8"){e.preventDefault();setScreen("caja");}
    else if(e.key==="Escape"&&["checkout","success"].includes(screen)){setScreen("venta");}
  };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h); },[cart,screen]);

  return (
    <PermCtx.Provider value={{role,can,gate}}>
    <div className="h-full flex flex-col w-full max-w-[1680px] mx-auto bg-surf shadow-2xl overflow-hidden" style={{borderRadius:0}}>
      <TitleBar screen={titles[screen]}/>
      <TopBar query={query} setQuery={setQuery} role={role} setRole={setRole} theme={theme} setTheme={setTheme} navOpen={navOpen} setNavOpen={setNavOpen}/>
      <div className="flex-1 flex min-h-0 relative">
        <Sidebar screen={["checkout","success"].includes(screen)?"venta":screen} go={setScreen} navOpen={navOpen} setNavOpen={setNavOpen}/>
        <main className="flex-1 min-w-0 p-3 lg:p-4 overflow-y-auto lg:overflow-hidden">
          {screen==="venta"&&<SaleScreen cart={cart} setCart={setCart} sel={sel} setSel={setSel} go={setScreen}/>}
          {screen==="checkout"&&<CheckoutScreen cart={cart} go={setScreen} onApprove={approve}/>}
          {screen==="success"&&sale&&<SuccessScreen sale={sale} go={setScreen} newSale={newSale}/>}
          {screen==="catalogo"&&<CatalogScreen setSel={setSel} go={setScreen}/>}
          {screen==="inventario"&&<InventoryScreen/>}
          {screen==="apartados"&&<HoldsScreen/>}
          {screen==="clientes"&&<ClientsScreen go={setScreen}/>}
          {screen==="devoluciones"&&<ReturnsScreen/>}
          {screen==="caja"&&<CashScreen/>}
          {screen==="reportes"&&(can("view_reports")?<ReportsScreen/>:<LockedScreen perm="view_reports" icon="chart" title="Reportes de ventas"/>)}
          {screen==="config"&&(can("manage_settings")?<SettingsScreen theme={theme} setTheme={setTheme}/>:<LockedScreen perm="manage_settings" icon="gear" title="Configuración"/>)}
        </main>
      </div>
      <BottomBar go={setScreen} onCobrar={cobrar}/>
      {ov && <OverrideModal perm={ov.perm} onClose={()=>setOv(null)} onOk={(who)=>{ const f=ov.fn; const p=ov.perm; setOv(null); setGrants(g=>({...g,[p]:true})); f&&f(); setToast("Autorizado por "+who); }}/>}
      {toast && <Toast msg={toast} onClose={()=>setToast("")}/>}
    </div>
    </PermCtx.Provider>
  );
}

export default function Page(){ return <Root/>; }
