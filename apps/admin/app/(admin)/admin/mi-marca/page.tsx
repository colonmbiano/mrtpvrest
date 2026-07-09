"use client";
import { useEffect, useState } from "react";
import { Store, Camera, ImageIcon, Palette } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, SectionHead, Button, Field, Input, Skeleton, useToast,
} from "@/components/ds";
import { applyAccent } from "@/lib/theme/accent";
import LocationsSection from "./_components/LocationsSection";

export default function BrandConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState({ name: "", logoUrl: "" });
  const [accent, setAccent] = useState("");
  const toast = useToast();

  useEffect(() => {
    api.get("/api/admin/config")
      .then(res => {
        setConfig(prev => ({ ...prev, name: res.data?.name ?? "", logoUrl: res.data?.logoUrl ?? "" }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("mb-accent");
    const current = getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim();
    setAccent(stored || current || "");
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string; // "data:image/png;base64,..."
      setConfig(prev => ({ ...prev, logoUrl: base64 }));
      setUploading(false);
    };
    reader.onerror = () => {
      toast.error("Error al leer la imagen");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  async function handleSave() {
    setSaving(true);
    try {
      await api.put("/api/admin/brand", { name: config.name, logoUrl: config.logoUrl });
      window.location.reload();
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Error desconocido";
      toast.error(`Error al guardar (${status ?? "sin respuesta"}): ${msg}`);
      setSaving(false);
    }
  }

  // Aplica el color de marca al instante (applyAccent) y lo persiste en
  // localStorage['mb-accent'], de donde lo re-inyecta AccentInjector en cada carga.
  function saveAccent() {
    if (!accent) return;
    localStorage.setItem("mb-accent", accent);
    applyAccent(accent);
    toast.success("Color de marca aplicado");
  }

  if (loading) {
    return (
      <PageShell>
        <PageHeader eyebrow="Identidad" title="Mi Marca" subtitle="Personaliza tu identidad visual" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-64 rounded-ds-lg md:col-span-1" />
          <Skeleton className="h-40 rounded-ds-lg md:col-span-2" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader eyebrow="Identidad" title="Mi Marca" subtitle="Personaliza tu identidad visual" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Logo */}
        <Card className="flex flex-col items-center p-6 md:col-span-1 md:p-7">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Logo oficial</p>
          <div className="relative mb-5">
            <div
              className="grid h-32 w-32 place-items-center overflow-hidden rounded-ds-xl"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}
            >
              {config.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.logoUrl} className="h-full w-full object-contain" alt="Logo del restaurante" />
              ) : (
                <ImageIcon size={40} className="text-tx-dim" />
              )}
              {uploading && (
                <div className="absolute inset-0 grid animate-pulse place-items-center bg-black/80 font-mono text-[10px] font-bold uppercase text-primary">
                  Subiendo…
                </div>
              )}
            </div>
            <label
              className="absolute -bottom-2 -right-2 grid h-11 w-11 cursor-pointer place-items-center rounded-ds-lg text-white transition-transform hover:scale-110"
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--accent-glow)", border: "3px solid var(--surf-1)" }}
            >
              <Camera size={18} />
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-tx-mut">
            Toca la cámara para subir un logo PNG o JPG.
          </p>
        </Card>

        {/* Datos del negocio */}
        <div className="space-y-4 md:col-span-2">
          <Card className="p-5 md:p-6">
            <SectionHead title="Datos del negocio" />
            <Field label="Nombre del restaurante">
              <Input
                type="text"
                value={config.name}
                onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, name: v })); }}
                className="font-display text-lg font-extrabold"
                style={{ color: "var(--tx-hi)" }}
              />
            </Field>
          </Card>

          {/* Color de marca (acento del tenant) */}
          <Card className="p-5 md:p-6">
            <SectionHead title="Color de marca" />
            <p className="-mt-3 mb-4 text-[12px] text-tx-mut">
              Define el acento del panel. Se aplica al instante y se guarda para las próximas sesiones.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <label
                className="grid h-14 w-14 cursor-pointer place-items-center overflow-hidden rounded-ds-md"
                style={{ background: accent || "var(--brand-primary)", border: "1px solid var(--bd-2)" }}
                aria-label="Elegir color de marca"
              >
                <Palette size={20} className="text-white/80" />
                <input
                  type="color"
                  value={accent || "#000000"}
                  onChange={(e) => setAccent(e.target.value)}
                  className="absolute h-0 w-0 opacity-0"
                />
              </label>
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Acento actual</div>
                <div className="mt-0.5 font-mono text-sm font-bold uppercase text-tx-hi">{accent || "—"}</div>
              </div>
              <Button icon={Palette} onClick={saveAccent} disabled={!accent} className="ml-auto">
                Guardar color
              </Button>
            </div>
          </Card>

          <Button icon={Store} onClick={handleSave} disabled={saving || uploading} loading={saving} full>
            {saving ? "Guardando…" : "Actualizar identidad"}
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <LocationsSection />
      </div>
    </PageShell>
  );
}
