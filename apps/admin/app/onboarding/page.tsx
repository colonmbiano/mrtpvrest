"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Employee { name: string; pin: string; role: "CASHIER" | "COOK" }
interface TenantData {
  id: string; name: string; slug: string;
  onboardingStep: number; onboardingDone: boolean;
  logoUrl: string | null; primaryColor: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function authHeader(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function inp(extra = "") {
  return `w-full bg-black border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-all text-sm placeholder:text-gray-600 ${extra}`;
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5 ml-0.5">
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</label>
        {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Identidad visual
// ─────────────────────────────────────────────────────────────────────────────
function Step1({ tenant, onDone }: { tenant: TenantData; onDone: () => void }) {
  const [logoUrl, setLogoUrl]         = useState(tenant.logoUrl || "");
  const [primaryColor, setPrimaryColor] = useState(tenant.primaryColor || "#f97316");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API}/api/tenant/onboarding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ step: 0, data: { logoUrl: logoUrl || undefined, primaryColor } }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); }
      else onDone();
    } catch { setError("Error de conexión"); }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black mb-1">Identidad visual</h2>
        <p className="text-gray-500 text-sm">Personaliza cómo verán tu restaurante tus clientes.</p>
      </div>

      <Field label="URL del logo" hint="Opcional">
        <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
          placeholder="https://tu-dominio.com/logo.png" className={inp()} />
      </Field>

      <Field label="Color principal">
        <div className="flex items-center gap-3">
          <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
            className="w-14 h-14 rounded-xl border border-white/10 bg-black cursor-pointer p-1" />
          <div className="flex-1">
            <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
              placeholder="#f97316" className={inp("font-mono")} />
          </div>
        </div>
      </Field>

      {/* Preview */}
      <div className="rounded-2xl overflow-hidden border border-white/10">
        <div className="p-4" style={{ background: primaryColor + "22", borderBottom: `2px solid ${primaryColor}` }}>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="w-12 h-12 rounded-xl object-cover bg-white/10" />
            ) : (
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black"
                style={{ background: primaryColor }}>
                {tenant.name[0]}
              </div>
            )}
            <div>
              <p className="font-black text-base">{tenant.name}</p>
              <p className="text-xs text-gray-500">{tenant.slug}.mrtpvrest.com</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-black/40 text-xs text-gray-500 text-center">Vista previa de tu menú en línea</div>
      </div>

      {error && <p className="text-red-400 text-sm font-bold bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

      <button onClick={save} disabled={saving}
        className="w-full py-4 rounded-2xl font-black bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50 active:scale-95">
        {saving ? "Guardando..." : "CONTINUAR →"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Menú con IA
// ─────────────────────────────────────────────────────────────────────────────
function Step2({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [file, setFile]       = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ categories: number; items: number } | null>(null);
  const [error, setError]     = useState("");

  const handleImport = async () => {
    if (!file) return;
    setLoading(true); setError("");
    try {
      const form = new FormData();
      form.append("menu", file);
      const res = await fetch(`${API}/api/tenant/import-menu`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error al procesar el menú");
      else setResult(data);
    } catch { setError("Error de conexión"); }
    setLoading(false);
  };

  const advance = async () => {
    await fetch(`${API}/api/tenant/onboarding`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ step: 1 }),
    });
    onDone();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black mb-1">Importa tu menú con IA</h2>
        <p className="text-gray-500 text-sm">
          Sube una foto o PDF de tu menú físico y nuestra IA lo escanea en segundos.
        </p>
      </div>

      {!result ? (
        <>
          <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all
            ${file ? "border-orange-500 bg-orange-500/5" : "border-white/10 hover:border-white/30"}`}>
            <input type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)} />
            <div className="text-4xl">{file ? "📄" : "📸"}</div>
            <div className="text-center">
              <p className="font-bold text-sm">{file ? file.name : "Arrastra o haz clic para subir"}</p>
              <p className="text-gray-500 text-xs mt-1">JPG, PNG o PDF · Máx 10 MB</p>
            </div>
          </label>

          {error && <p className="text-red-400 text-sm font-bold bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onSkip}
              className="flex-1 py-4 rounded-2xl font-black text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all">
              Saltar por ahora
            </button>
            <button onClick={handleImport} disabled={!file || loading}
              className="flex-1 py-4 rounded-2xl font-black bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50 active:scale-95">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analizando con IA...
                </span>
              ) : "ANALIZAR →"}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
            <div className="text-5xl mb-3">✅</div>
            <p className="font-black text-lg text-green-400">¡Menú importado!</p>
            <p className="text-gray-400 text-sm mt-1">
              Se crearon <strong className="text-white">{result.categories} categorías</strong> y{" "}
              <strong className="text-white">{result.items} platillos</strong>
            </p>
          </div>
          <button onClick={advance}
            className="w-full py-4 rounded-2xl font-black bg-orange-500 hover:bg-orange-600 text-white transition-all active:scale-95">
            CONTINUAR →
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Equipo base
// ─────────────────────────────────────────────────────────────────────────────
function Step3({ onDone }: { onDone: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([
    { name: "", pin: "", role: "CASHIER" },
    { name: "", pin: "", role: "COOK"    },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const update = (i: number, field: keyof Employee, value: string) => {
    setEmployees(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  const isValid = employees.every(e => e.name.trim() && e.pin.length === 4 && /^\d+$/.test(e.pin));
  const pinsUnique = new Set(employees.map(e => e.pin)).size === employees.length;

  const save = async () => {
    if (!pinsUnique) { setError("Los PINs deben ser diferentes"); return; }
    setSaving(true); setError("");
    try {
      const [empRes] = await Promise.all([
        fetch(`${API}/api/tenant/onboarding/employees`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ employees }),
        }),
        fetch(`${API}/api/tenant/onboarding`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ step: 2 }),
        }),
      ]);
      const d = await empRes.json();
      if (!empRes.ok) { setError(d.error); setSaving(false); return; }
      onDone();
    } catch { setError("Error de conexión"); setSaving(false); }
  };

  const ROLE_LABELS = { CASHIER: "Cajero / TPV", COOK: "Cocina / KDS" };
  const ROLE_ICONS  = { CASHIER: "💳", COOK: "👨‍🍳" };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black mb-1">Tu equipo inicial</h2>
        <p className="text-gray-500 text-sm">
          Crea los accesos con PIN para el TPV y la cocina. Podrás agregar más después.
        </p>
      </div>

      <div className="space-y-4">
        {employees.map((emp, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{ROLE_ICONS[emp.role]}</span>
              <span className="text-sm font-black text-gray-300">{ROLE_LABELS[emp.role]}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre">
                <input value={emp.name} onChange={e => update(i, "name", e.target.value)}
                  placeholder={emp.role === "CASHIER" ? "Ej: Carlos" : "Ej: Cocina 1"}
                  className={inp()} />
              </Field>
              <Field label="PIN (4 dígitos)">
                <input value={emp.pin} onChange={e => update(i, "pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="1234" maxLength={4} className={inp("font-mono tracking-widest text-center")} />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <button type="button"
        onClick={() => setEmployees(prev => [...prev, { name: "", pin: "", role: "CASHIER" }])}
        className="w-full py-3 rounded-xl border border-white/10 hover:border-white/20 text-gray-500 hover:text-white text-sm font-bold transition-all">
        + Agregar empleado
      </button>

      {error && <p className="text-red-400 text-sm font-bold bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

      <button onClick={save} disabled={!isValid || saving}
        className="w-full py-4 rounded-2xl font-black bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50 active:scale-95">
        {saving ? "Guardando..." : "FINALIZAR CONFIGURACIÓN →"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: "Identidad",  icon: "🎨" },
  { n: 2, label: "Menú",       icon: "📋" },
  { n: 3, label: "Equipo",     icon: "👥" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]     = useState(1);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTenant = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(`${API}/api/tenant/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { router.push("/login"); return; }
      const data = await res.json();
      setTenant(data);
      // Si ya pasó este paso, reanuda donde dejó
      const nextStep = Math.min((data.onboardingStep || 0) + 1, 3);
      setStep(nextStep);
      if (data.onboardingDone) router.push("/admin");
    } catch { router.push("/login"); }
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchTenant(); }, [fetchTenant]);

  const handleDone = async () => {
    if (step < 3) { setStep(s => s + 1); return; }
    router.push("/admin");
  };

  const handleSkip = async () => {
    await fetch(`${API}/api/tenant/onboarding`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ step: step - 1 }),
    });
    if (step < 3) setStep(s => s + 1);
    else router.push("/admin");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) return null;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Brand */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black tracking-tighter">
          MRTPV<span className="text-orange-500">REST</span>
        </h1>
        <p className="text-gray-500 text-xs mt-1 font-bold tracking-widest uppercase">
          Configura <span className="text-orange-400">{tenant.name}</span>
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map(({ n, label, icon }, i) => (
          <div key={n} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-black transition-all
                ${step === n ? "bg-orange-500 text-black ring-4 ring-orange-500/20" :
                  step > n  ? "bg-green-500 text-black"  :
                               "bg-white/5 text-gray-500 border border-white/10"}`}>
                {step > n ? "✓" : icon}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest
                ${step === n ? "text-orange-400" : step > n ? "text-green-400" : "text-gray-600"}`}>
                {label}
              </span>
            </div>
            {i < 2 && (
              <div className={`w-10 h-[2px] mb-4 rounded transition-all ${step > n ? "bg-green-500" : "bg-white/5"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md mb-6 bg-white/5 rounded-full h-1">
        <div className="h-1 rounded-full bg-orange-500 transition-all duration-500"
          style={{ width: `${((step - 1) / 2) * 100}%` }} />
      </div>

      {/* Wizard card */}
      <div className="w-full max-w-md bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
        {step === 1 && <Step1 tenant={tenant} onDone={handleDone} />}
        {step === 2 && <Step2 onDone={handleDone} onSkip={handleSkip} />}
        {step === 3 && <Step3 onDone={handleDone} />}
      </div>

      {/* Saltar todo */}
      {step < 3 && (
        <button onClick={() => router.push("/admin")}
          className="mt-6 text-gray-600 hover:text-gray-400 text-xs font-bold transition-colors">
          Configurar más tarde →
        </button>
      )}
    </div>
  );
}
