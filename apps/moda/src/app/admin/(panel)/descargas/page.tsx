"use client";

import { Monitor, Smartphone, Download, Info, type LucideIcon } from "lucide-react";
import { DOWNLOADS, type DownloadTarget } from "@/lib/downloads";

const ICON: Record<DownloadTarget["platform"], LucideIcon> = {
  windows: Monitor,
  android: Smartphone,
};

export default function DescargasPage() {
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="mb-6">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">MODA+ Admin</div>
        <h1
          className="mt-1.5 text-3xl font-black tracking-tight text-[var(--tx-hi)] md:text-4xl"
          style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
        >
          Descargar la caja
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--tx-mut)]">
          Instala la app de punto de venta MODA+ en tu computadora o tablet. Tus cajeros entran con su PIN; tú
          administras todo desde aquí.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {DOWNLOADS.map((d) => {
          const Icon = ICON[d.platform];
          const qr =
            d.platform === "android"
              ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=12241b&color=34c988&qzone=1&data=${encodeURIComponent(d.url)}`
              : null;
          return (
            <section
              key={d.platform}
              className="flex flex-col rounded-3xl p-5"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--iris-soft)", color: "var(--brand-primary)" }}>
                  <Icon size={24} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-[var(--tx-hi)]">{d.label}</h2>
                  <div className="font-mono text-[11px] text-[var(--tx-mut)]">
                    v{d.version}
                    {d.size ? ` · ${d.size}` : ""}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[13px] text-[var(--tx-mut)]">{d.hint}</p>

              {qr && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--surf-2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Código QR para descargar el APK" width={84} height={84} className="rounded-xl" style={{ border: "1px solid var(--bd-1)" }} />
                  <div className="text-[12px] text-[var(--tx-mut)]">Escanea con la cámara del celular o tablet para descargar el APK directo.</div>
                </div>
              )}

              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black text-[#06140d] transition-all active:scale-[.98]"
                style={{ background: "var(--brand-primary)", boxShadow: "0 10px 30px var(--iris-glow)" }}
              >
                <Download size={18} /> Descargar {d.platform === "windows" ? ".exe" : ".apk"}
              </a>
            </section>
          );
        })}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl p-4" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
        <Info size={18} className="mt-0.5 shrink-0 text-[var(--brand-primary)]" />
        <div className="text-[13px] text-[var(--tx-mut)]">
          <span className="font-bold text-[var(--tx-hi)]">¿Primera vez?</span> Instala la app, ábrela y elige{" "}
          <span className="font-bold text-[var(--tx-hi)]">“Configurar dispositivo”</span> con tu correo de dueño, o{" "}
          <span className="font-bold text-[var(--tx-hi)]">“Crear cuenta”</span> si aún no tienes tienda. Después tus
          cajeros entran solo con su PIN.
        </div>
      </div>
    </div>
  );
}
