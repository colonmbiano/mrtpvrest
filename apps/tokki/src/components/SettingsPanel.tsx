"use client";

import { useEffect, useState } from "react";
import { Cloud, Moon, Palette, Printer, ReceiptText, RefreshCw, Settings2, Sun, Unlink, X } from "lucide-react";
import useOfflineStore from "../store/useOfflineStore";
import { useSettingsStore } from "../store/settingsStore";
import { useThemeStore } from "../store/themeStore";
import type { TokkiPaymentMethod } from "./PaymentModal";

const paymentLabels: Array<{ id: TokkiPaymentMethod; label: string }> = [
  { id: "CASH", label: "Efectivo" }, { id: "CARD_PRESENT", label: "Tarjeta" }, { id: "TRANSFER", label: "Transferencia" },
];

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "Desconocida";
const otaEnabled = process.env.NEXT_PUBLIC_OTA_ENABLED === "true";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`settings-toggle ${checked ? "on" : ""}`}><span /></button>;
}

export default function SettingsPanel({ onClose, onPrinters, onRelink }: { onClose: () => void; onPrinters: () => void; onRelink: () => void }) {
  const settings = useSettingsStore();
  const { mode, toggleMode } = useThemeStore();
  const queue = useOfflineStore((state) => state.queue);
  const syncInProgress = useOfflineStore((state) => state.syncInProgress);
  const lastSync = useOfflineStore((state) => state.lastSync);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const pending = queue.filter((item) => !item.synced && !item.failed).length;
  const failed = queue.filter((item) => !item.synced && item.failed).length;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <aside className="settings-panel">
        <header><div><Settings2 size={20} /><span><h2 id="settings-title">Configuración</h2><small>Tokki Boba · esta tablet</small></span></div><button onClick={onClose} className="modal-close" aria-label="Cerrar configuración"><X size={19} /></button></header>
        <div className="settings-scroll">
          <section><h3><ReceiptText size={16} /> Cobro</h3>
            <div className="setting-row"><span><b>Desglosar IVA incluido</b><small>Los precios del menú ya son finales</small></span><Toggle checked={settings.taxEnabled} onChange={settings.setTaxEnabled} label="Desglosar IVA incluido" /></div>
            {settings.taxEnabled && <label className="setting-row"><span><b>Porcentaje de IVA</b><small>De 0% a 30%</small></span><div className="percent-input"><input type="number" min="0" max="30" value={settings.taxRate} onChange={(event) => settings.setTaxRate(Number(event.target.value))} /><b>%</b></div></label>}
            <div className="settings-choice"><b>Métodos disponibles</b><div>{paymentLabels.map((method) => <button key={method.id} aria-pressed={settings.paymentMethods.includes(method.id)} onClick={() => settings.togglePaymentMethod(method.id)}>{method.label}</button>)}</div></div>
          </section>
          <section><h3><Printer size={16} /> Impresión</h3>
            <button className="settings-link" onClick={onPrinters}><span><b>Impresoras locales</b><small>Red, dirección IP y puerto</small></span><Printer size={18} /></button>
            <div className="setting-row"><span><b>Imprimir recibo automáticamente</b><small>Después de confirmar el cobro</small></span><Toggle checked={settings.autoPrintReceipt} onChange={settings.setAutoPrintReceipt} label="Imprimir recibo automáticamente" /></div>
            <div className="settings-choice"><b>Copias del recibo</b><div>{([1,2] as const).map((copies) => <button key={copies} aria-pressed={settings.receiptCopies === copies} onClick={() => settings.setReceiptCopies(copies)}>{copies}</button>)}</div></div>
          </section>
          <section><h3><Palette size={16} /> Apariencia</h3>
            <div className="setting-row"><span><b>Tema {mode === "dark" ? "oscuro" : "claro"}</b><small>Preferencia guardada en la tablet</small></span><button className="theme-button" onClick={toggleMode} aria-label="Cambiar tema">{mode === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button></div>
            <div className="setting-row"><span><b>Sonido al agregar</b><small>Confirmación corta del producto</small></span><Toggle checked={settings.soundEnabled} onChange={settings.setSoundEnabled} label="Sonido al agregar productos" /></div>
            <div className="settings-choice"><b>Tamaño del catálogo</b><div><button aria-pressed={settings.density === "comfortable"} onClick={() => settings.setDensity("comfortable")}>Normal</button><button aria-pressed={settings.density === "compact"} onClick={() => settings.setDensity("compact")}>Compacto</button></div></div>
          </section>
          <section><h3><Cloud size={16} /> Sistema</h3>
            <div className="sync-card"><span className={online ? "online" : "offline"} /><div><b>{online ? "Con conexión" : "Sin conexión"}</b><small>{syncInProgress ? "Sincronizando…" : `${pending} pendientes · ${failed} con error`}{lastSync ? ` · Última ${new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</small></div><RefreshCw size={17} className={syncInProgress ? "animate-spin" : ""} /></div>
            <div className="setting-row"><span><b>Versión de Tokki POS</b><small>Aplicación instalada en esta tablet</small></span><strong className="settings-value">v{appVersion}</strong></div>
            <div className="setting-row"><span><b>Actualizaciones OTA</b><small>{otaEnabled ? "La app puede actualizarse automáticamente" : "Las actualizaciones requieren instalar una APK"}</small></span><strong className={`settings-status ${otaEnabled ? "enabled" : "disabled"}`}>{otaEnabled ? "Activas" : "No activadas"}</strong></div>
            <button className="settings-danger" onClick={onRelink}><Unlink size={17} /><span><b>Volver a vincular</b><small>Cambiar negocio o sucursal</small></span></button>
          </section>
        </div>
      </aside>
    </div>
  );
}
