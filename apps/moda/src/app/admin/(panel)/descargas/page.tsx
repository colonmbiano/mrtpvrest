"use client";

import { Monitor, Smartphone, Download, ShieldCheck, type LucideIcon } from "lucide-react";
import { DOWNLOADS, type DownloadTarget } from "@/lib/downloads";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { DataCard, StatusBadge } from "@/components/admin/atoms";

const ICON: Record<DownloadTarget["platform"], LucideIcon> = { windows: Monitor, android: Smartphone };

const STEPS = [
  ["1", "Descarga la app", "Elige Windows o Android."],
  ["2", "Instala la aplicación", "Doble clic o abre el .apk."],
  ["3", "Configura tu sucursal", "Inicia sesión y elige la tienda."],
  ["4", "Conéctate y listo", "Tus cajeros entran con su PIN."],
];

const DEVICES = [
  { name: "Caja Principal", code: "DESKTOP-7K9F2L", type: "Windows", last: "Hoy, 09:42 a. m.", status: "en_linea" },
  { name: "POS Móvil", code: "SM-A536E", type: "Android", last: "Ayer, 08:15 p. m.", status: "en_linea" },
  { name: "Caja Auxiliar", code: "Pixel 6a", type: "Android", last: "25 may. 2024, 11:33 a. m.", status: "sin_conexion" },
];

export default function DescargasPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <AdminTopbar title="Descargar caja" subtitle="Instala MODA+ en tu computadora o dispositivo móvil para comenzar a vender." />

      <div className="grid gap-4 md:grid-cols-2">
        {DOWNLOADS.map((d) => {
          const Icon = ICON[d.platform];
          const qr = d.platform === "android"
            ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=0f172a&qzone=1&data=${encodeURIComponent(d.url)}`
            : null;
          return (
            <section key={d.platform} className="flex flex-col rounded-[20px] border bg-[var(--surf-1)] p-5" style={{ borderColor: "var(--bd-1)", boxShadow: "var(--shadow-soft)" }}>
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}><Icon size={24} strokeWidth={2} /></span>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-bold text-[var(--tx-hi)]">{d.label}</h2>
                  <div className="font-mono text-[11px] text-[var(--tx-mut)]">v{d.version}{d.size ? ` · ${d.size}` : ""}</div>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-[var(--tx-mut)]">{d.hint}</p>
              {qr && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--surf-2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Código QR para descargar el APK" width={84} height={84} className="rounded-xl bg-white p-1" />
                  <div className="text-[12px] text-[var(--tx-mut)]">Escanea con la cámara para descargar el APK directo.</div>
                </div>
              )}
              <a href={d.url} target="_blank" rel="noopener noreferrer" aria-label={`Descargar ${d.platform === "windows" ? "instalador de Windows" : "APK de Android"}`}
                className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white transition-colors hover:opacity-95" style={{ background: "var(--brand-primary)" }}>
                <Download size={18} /> Descargar {d.platform === "windows" ? ".exe" : ".apk"}
              </a>
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[var(--tx-dim)]"><ShieldCheck size={13} /> Archivo seguro verificado</div>
            </section>
          );
        })}
      </div>

      <DataCard title="Primera instalación" className="mt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, t, s]) => (
            <div key={n} className="rounded-[16px] border p-3.5" style={{ borderColor: "var(--bd-1)" }}>
              <span className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>{n}</span>
              <div className="mt-2 text-[13px] font-bold text-[var(--tx-hi)]">{t}</div>
              <div className="text-[11px] text-[var(--tx-mut)]">{s}</div>
            </div>
          ))}
        </div>
      </DataCard>

      <DataCard title="Dispositivos recientes" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-dim)]" style={{ borderColor: "var(--bd-1)" }}>
                <th className="py-2.5 pr-3">Dispositivo</th><th className="py-2.5 pr-3">Tipo</th><th className="py-2.5 pr-3">Última conexión</th><th className="py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {DEVICES.map((d) => (
                <tr key={d.code} className="border-b text-[13px]" style={{ borderColor: "var(--bd-1)" }}>
                  <td className="py-3 pr-3"><div className="font-semibold text-[var(--tx-hi)]">{d.name}</div><div className="font-mono text-[11px] text-[var(--tx-dim)]">{d.code}</div></td>
                  <td className="py-3 pr-3 text-[var(--tx-mut)]">{d.type}</td>
                  <td className="py-3 pr-3 text-[var(--tx-mut)]">{d.last}</td>
                  <td className="py-3"><StatusBadge status={d.status} label={d.status === "en_linea" ? "En línea" : "Sin conexión"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </div>
  );
}
