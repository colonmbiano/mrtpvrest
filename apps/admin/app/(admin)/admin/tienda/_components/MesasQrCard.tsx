"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";

// `qrToken` lo firma el backend (GET /api/tables/qr). Opcional: el listado
// legacy (GET /api/tables) no lo trae y el enlace cae al número del nombre.
type Table = { id: string; name: string; locationId: string; qrToken?: string };

/* Hoja de impresión: al imprimir se ocultan TODOS los hermanos de <body> y solo
   queda el portal con los QR. Así «Imprimir» saca la hoja de códigos y no las
   demás secciones de la página (cupones, puntos, horarios…). */
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
.qr-print-root { display: none; }
@media print {
  html, body {
    background: #fff !important;
    height: auto !important;
    overflow: visible !important;
  }
  body > *:not(.qr-print-root) { display: none !important; }
  .qr-print-root { display: block !important; }
  .qr-print-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8mm;
  }
  .qr-print-card {
    break-inside: avoid;
    page-break-inside: avoid;
    border: 1px dashed #94a3b8;
    border-radius: 4mm;
    padding: 8mm 4mm;
    text-align: center;
    color: #000;
  }
  .qr-print-card svg {
    width: 45mm;
    height: 45mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .qr-print-name {
    font-size: 16pt;
    font-weight: 800;
    margin: 0 0 4mm;
  }
  .qr-print-hint {
    font-size: 9pt;
    margin: 4mm 0 0;
    color: #334155;
  }
}
`;

function QrPrintSheet({ tables, linkFor }: { tables: Table[]; linkFor: (t: Table) => string }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  // El portal cuelga directo de <body> para que la regla `body > *` lo respete.
  useEffect(() => {
    const el = document.createElement("div");
    el.className = "qr-print-root";
    el.style.display = "none"; // el `!important` de la regla @media print gana sobre esto
    document.body.appendChild(el);
    setHost(el);
    return () => { el.remove(); };
  }, []);

  if (!host) return null;
  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="qr-print-grid">
        {tables.map((t) => (
          <div key={t.id} className="qr-print-card">
            <p className="qr-print-name">{t.name}</p>
            <QRCodeSVG value={linkFor(t)} size={170} marginSize={1} />
            <p className="qr-print-hint">Escanea para ver el menú y pedir desde tu mesa</p>
          </div>
        ))}
      </div>
    </>,
    host,
  );
}

// QR por mesa: el comensal escanea → abre el menú en DINE_IN con su mesa fija.
//
// El enlace lleva `?t=<token firmado>&l=<sucursal>`: el token ata el pedido al
// tableId REAL (lo firma el backend en GET /api/tables/qr, ver lib/table-qr.js),
// así que renombrar una mesa no reasigna el papel ya pegado y nadie puede pedir
// a nombre de otra mesa editando la URL.
//
// Si la instancia no tiene llave configurada, el backend devuelve qrToken vacío
// y caemos al esquema legacy `?mesa=<número>` — los QR ya impresos con ese
// formato siguen funcionando, el backend acepta los dos.
export function MesasQrCard({ storeUrl }: { storeUrl: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    api.get("/api/tables/qr")
      .then((r) => setTables(Array.isArray(r.data) ? r.data : []))
      // Backend viejo (sin /qr desplegado aún) → caemos al listado normal y al
      // enlace por número, en vez de dejar la tarjeta vacía.
      .catch(() => api.get("/api/tables")
        .then((r) => setTables(Array.isArray(r.data) ? r.data : []))
        .catch(() => {}))
      .finally(() => setLoading(false));
  }, []);

  // La hoja se monta solo al imprimir: así un Ctrl+P normal sigue imprimiendo
  // la página completa y no cargamos el DOM con QR duplicados.
  useEffect(() => {
    if (!printing) return;
    let closed = false;
    const done = () => { if (!closed) { closed = true; setPrinting(false); } };
    window.addEventListener("afterprint", done);
    // Dos frames: garantiza que el portal ya pintó antes de abrir el diálogo.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    // Red de seguridad para navegadores que no disparan afterprint (móvil).
    const timer = window.setTimeout(done, 30000);
    return () => {
      closed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const mesaNum = (name: string) => (String(name).match(/\d+/) || [])[0] || "";
  const linkFor = (t: Table) => {
    if (!storeUrl) return "";
    const sep = storeUrl.includes("?") ? "&" : "?";
    const loc = `&l=${encodeURIComponent(t.locationId)}`;
    // Preferido: token firmado (no depende del nombre ni del número).
    if (t.qrToken) return `${storeUrl}${sep}t=${encodeURIComponent(t.qrToken)}${loc}`;
    // Legacy: sin llave en el backend, se sigue usando el número del nombre.
    const num = mesaNum(t.name);
    if (!num) return "";
    return `${storeUrl}${sep}mesa=${encodeURIComponent(num)}${loc}`;
  };
  // Con token, una mesa sin número en el nombre (ej. "Barra") también sirve.
  const usable = tables.filter((t) => linkFor(t));

  return (
    <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold text-tx-hi">QR de mesas (autoservicio)</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-tx-mut">
            Pega un QR en cada mesa. El comensal escanea, ve el menú y su pedido entra al TPV con la mesa ya puesta.
          </p>
        </div>
        {usable.length > 0 && (
          <button type="button" onClick={() => setPrinting(true)} disabled={printing} className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>
            {printing ? "Preparando…" : "Imprimir"}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[12px] text-tx-mut">Cargando mesas…</p>
      ) : usable.length === 0 ? (
        <p className="text-[12px] text-tx-mut">
          No hay mesas activas en esta sucursal. Créalas desde el mapa de piso del TPV y aquí aparecerá el QR de cada una.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {usable.map((t) => {
            const link = linkFor(t);
            return (
              <div key={t.id} className="flex flex-col items-center gap-2 rounded-2xl p-3" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
                <div className="rounded-xl bg-white p-2">
                  <QRCodeSVG value={link} size={112} marginSize={1} />
                </div>
                <p className="text-[12px] font-extrabold text-tx-hi">{t.name}</p>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); }}
                  className="text-[11px] font-bold text-tx-mut hover:text-tx-hi"
                >
                  Copiar enlace
                </button>
              </div>
            );
          })}
        </div>
      )}

      {printing && <QrPrintSheet tables={usable} linkFor={linkFor} />}
    </div>
  );
}
