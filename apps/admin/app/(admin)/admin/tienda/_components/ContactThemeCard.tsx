"use client";
import type { Dispatch, SetStateAction } from "react";
import { Upload, ImagePlus, X } from "lucide-react";
import { Card, Field, Input, IconButton } from "@/components/ds";
import { FieldLabel } from "./ui";
import { THEMES, type TiendaConfig } from "./types";

type Props = {
  config: TiendaConfig;
  setConfig: Dispatch<SetStateAction<TiendaConfig>>;
  heroUploading: boolean;
  uploadHero: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function ContactThemeCard({ config, setConfig, heroUploading, uploadHero }: Props) {
  return (
    <Card className="p-5 md:p-6">
      <div className="mb-4">
        <p className="font-display text-base font-extrabold text-tx-hi">Contacto público</p>
        <p className="mt-0.5 text-[12px] text-tx-mut">Datos que verá el cliente en tu tienda</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Teléfono">
          <Input type="text" value={config.phone} onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, phone: v })); }} />
        </Field>
        <Field label="Mensajería">
          <Input type="text" value={config.whatsappNumber} onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, whatsappNumber: v })); }} />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Dirección principal">
          <Input type="text" value={config.address} onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, address: v })); }} />
        </Field>
      </div>

      <div className="mt-5">
        <FieldLabel>Estilo de tienda online</FieldLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEMES.map((t) => {
            const active = config.storefrontTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setConfig((p) => ({ ...p, storefrontTheme: t.id }))}
                className="flex min-h-[60px] items-start gap-3 rounded-2xl p-4 text-left transition-colors"
                style={{
                  border: `2px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                  background: active ? "var(--accent-soft)" : "var(--surf-2)",
                }}
              >
                <t.icon size={20} className="mt-0.5 shrink-0" style={{ color: active ? "var(--brand-primary)" : "var(--tx-mut)" }} />
                <div className="min-w-0">
                  <p className="font-display text-sm font-extrabold text-tx-hi">{t.name}</p>
                  <p className="mt-0.5 text-[11px] text-tx-mut">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Imagen de portada (hero) — la usa el tema Mundialista a todo lo ancho */}
      <div className="mt-5">
        <FieldLabel>
          <ImagePlus size={11} className="mr-1 inline" /> Imagen de portada (hero)
        </FieldLabel>
        <p className="mb-2 text-[11px] text-tx-mut">Se muestra a todo lo ancho arriba (tema Mundialista). Recomendado panorámico ~1600×520. Se sube sin recorte.</p>
        {config.storefrontHeroUrl ? (
          <div className="relative overflow-hidden rounded-xl" style={{ border: "1px solid var(--bd-1)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.storefrontHeroUrl} alt="Portada" className="w-full object-cover" style={{ maxHeight: 180 }} />
            <div className="absolute right-2 top-2">
              <IconButton icon={X} label="Quitar imagen" danger onClick={() => setConfig((p) => ({ ...p, storefrontHeroUrl: "" }))} />
            </div>
          </div>
        ) : (
          <label
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl py-6 text-sm font-semibold"
            style={{ border: "1.5px dashed var(--bd-1)", background: "var(--surf-2)", color: "var(--tx-mid)" }}
          >
            <Upload size={16} /> {heroUploading ? "Subiendo…" : "Subir imagen de portada"}
            <input type="file" accept="image/*" className="hidden" onChange={uploadHero} disabled={heroUploading} />
          </label>
        )}
        <div className="mt-2">
          <Input
            type="text"
            value={config.storefrontHeroUrl || ""}
            placeholder="…o pega una URL de imagen"
            onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, storefrontHeroUrl: v })); }}
          />
        </div>
      </div>
    </Card>
  );
}
