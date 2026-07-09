"use client";
// Mi Cuenta — un solo lugar para el perfil, la región (moneda, zona horaria,
// país) y la apariencia (tema claro/oscuro). Antes estaban dispersos entre
// Ajustes de tienda y el pie del menú lateral.
//
// Región → se guarda en RestaurantConfig (PUT /api/admin/config, parcial: solo
// mandamos estos campos, el backend hace merge por whitelist). Tema → es por
// DISPOSITIVO (localStorage mb-theme vía ThemeProvider), no viaja al servidor.

import { useEffect, useState } from "react";
import { User, Globe, Clock, Coins, Palette, Save, Mail, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { useTheme } from "@/components/ThemeProvider";
import { PageShell, PageHeader, Card, Button, Segmented } from "@/components/ds";

// Mismos catálogos que Ajustes de tienda (código ISO 4217 + locale; zona IANA).
const CURRENCIES = [
  { code: "MXN", locale: "es-MX", label: "Peso mexicano (MXN)" },
  { code: "USD", locale: "en-US", label: "Dólar estadounidense (USD)" },
  { code: "EUR", locale: "es-ES", label: "Euro (EUR)" },
  { code: "COP", locale: "es-CO", label: "Peso colombiano (COP)" },
  { code: "ARS", locale: "es-AR", label: "Peso argentino (ARS)" },
  { code: "CLP", locale: "es-CL", label: "Peso chileno (CLP)" },
  { code: "PEN", locale: "es-PE", label: "Sol peruano (PEN)" },
  { code: "GTQ", locale: "es-GT", label: "Quetzal (GTQ)" },
  { code: "BRL", locale: "pt-BR", label: "Real brasileño (BRL)" },
];

const TIMEZONES = [
  { value: "America/Mexico_City", label: "Ciudad de México (Centro)" },
  { value: "America/Cancun", label: "Cancún (Este)" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Chihuahua", label: "Chihuahua (Pacífico)" },
  { value: "America/Hermosillo", label: "Hermosillo (sin horario de verano)" },
  { value: "America/Tijuana", label: "Tijuana (Noroeste)" },
  { value: "America/Bogota", label: "Bogotá / Lima" },
  { value: "America/Buenos_Aires", label: "Buenos Aires" },
  { value: "America/Santiago", label: "Santiago de Chile" },
  { value: "America/Guatemala", label: "Guatemala" },
];

const COUNTRIES = [
  { code: "MX", name: "México (+52)" },
  { code: "US", name: "Estados Unidos (+1)" },
  { code: "CO", name: "Colombia (+57)" },
  { code: "AR", name: "Argentina (+54)" },
  { code: "CL", name: "Chile (+56)" },
  { code: "PE", name: "Perú (+51)" },
  { code: "EC", name: "Ecuador (+593)" },
  { code: "GT", name: "Guatemala (+502)" },
  { code: "BR", name: "Brasil (+55)" },
];

const INPUT_CLS = "min-h-12 w-full rounded-xl px-4 text-sm font-medium outline-none transition-colors focus:border-[var(--brand-primary)]";
const INPUT_STYLE = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

function Label({ icon: Icon, children }: { icon: typeof Globe; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
      <Icon size={12} /> {children}
    </div>
  );
}

export default function MiCuentaPage() {
  const { theme, setTheme } = useTheme();
  const [me, setMe] = useState<{ name?: string; email?: string; role?: string } | null>(null);
  const [cfg, setCfg] = useState({ currency: "MXN", currencyLocale: "es-MX", timezone: "America/Mexico_City", countryCode: "MX" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => { setMe(getUser()); }, []);

  useEffect(() => {
    api.get("/api/admin/config")
      .then(({ data }) => {
        setCfg({
          currency: data.currency || "MXN",
          currencyLocale: data.currencyLocale || "es-MX",
          timezone: data.timezone || "America/Mexico_City",
          countryCode: data.countryCode || "MX",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      // Envío parcial: solo los campos de región (el backend hace merge por whitelist).
      await api.put("/api/admin/config", cfg);
      showToast("Cambios guardados");
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "No se pudo guardar", false);
    } finally {
      setSaving(false);
    }
  }

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: "Super administrador", ADMIN: "Administrador", OWNER: "Dueño",
    MANAGER: "Gerente", CASHIER: "Cajero", WAITER: "Mesero", KITCHEN: "Cocina", DELIVERY: "Repartidor",
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Ajustes"
        title="Mi Cuenta"
        subtitle="Tu perfil, región y apariencia en un solo lugar"
        actions={<Button icon={Save} full={false} disabled={saving || loading} onClick={save}>{saving ? "Guardando…" : "Guardar"}</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Perfil */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-lg font-extrabold text-white"
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}>
              {(me?.name || "?").trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-extrabold text-tx-hi">{me?.name || "—"}</p>
              <p className="text-[12px] text-tx-mut">{me?.role ? roleLabel[me.role] || me.role : "Usuario"}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <Mail size={14} className="text-tx-mut" /> <span className="truncate text-tx">{me?.email || "—"}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <ShieldCheck size={14} className="text-tx-mut" /> <span className="text-tx">{me?.role ? roleLabel[me.role] || me.role : "—"}</span>
            </div>
          </div>
        </Card>

        {/* Apariencia */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Palette size={16} className="text-primary" />
            <span className="font-display text-sm font-extrabold text-tx-hi">Apariencia</span>
          </div>
          <Label icon={Palette}>Tema del panel</Label>
          <Segmented
            value={theme}
            onChange={(v) => setTheme(v)}
            options={[{ value: "light", label: "☀️ Claro" }, { value: "dark", label: "🌙 Oscuro" }] as const}
          />
          <p className="ml-1 mt-2 text-[11px] text-tx-dim">Se guarda en este dispositivo (no afecta a otros usuarios ni a la tienda pública).</p>
        </Card>

        {/* Región */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Globe size={16} className="text-primary" />
            <span className="font-display text-sm font-extrabold text-tx-hi">Región</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label icon={Coins}>Moneda</Label>
              <select
                value={cfg.currency}
                onChange={(e) => {
                  const c = CURRENCIES.find(x => x.code === e.target.value) ?? { code: "MXN", locale: "es-MX" };
                  setCfg(p => ({ ...p, currency: c.code, currencyLocale: c.locale }));
                }}
                className={INPUT_CLS} style={INPUT_STYLE}
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label icon={Clock}>Zona horaria</Label>
              <select
                value={cfg.timezone}
                onChange={(e) => setCfg(p => ({ ...p, timezone: e.target.value }))}
                className={INPUT_CLS} style={INPUT_STYLE}
              >
                {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label icon={Globe}>País</Label>
              <select
                value={cfg.countryCode}
                onChange={(e) => setCfg(p => ({ ...p, countryCode: e.target.value }))}
                className={INPUT_CLS} style={INPUT_STYLE}
              >
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <p className="ml-1 mt-3 text-[11px] text-tx-dim">
            La moneda cambia cómo se muestran los precios en la tienda pública; la zona horaria afecta reportes y horarios; el país define el prefijo telefónico de WhatsApp.
          </p>
        </Card>
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
          style={{ background: toast.ok ? "var(--ok)" : "var(--err)" }}
        >
          {toast.msg}
        </div>
      )}
    </PageShell>
  );
}
