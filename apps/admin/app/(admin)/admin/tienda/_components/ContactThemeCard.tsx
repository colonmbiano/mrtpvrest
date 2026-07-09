"use client";
import type { Dispatch, SetStateAction } from "react";
import { Upload, ImagePlus, X } from "lucide-react";
import { Card, Field, Input, Select, IconButton, Toggle, useToast } from "@/components/ds";
import { FieldLabel } from "./ui";
import { CURRENCIES, formatPreview, THEMES, type TiendaConfig } from "./types";

type Props = {
  config: TiendaConfig;
  setConfig: Dispatch<SetStateAction<TiendaConfig>>;
  heroUploading: boolean;
  uploadHero: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function ContactThemeCard({ config, setConfig, heroUploading, uploadHero }: Props) {
  const toast = useToast();
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

      {/* Pedir por WhatsApp (estilo OlaClick) — gateado por el plan del tenant */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display text-sm font-extrabold text-tx-hi">Pedir por WhatsApp</p>
            {!config.hasWhatsappOrdersModule && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)" }}>Pro</span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-tx-mut">
            Permite a los clientes armar su pedido en tu menú digital y enviarlo directamente a tu WhatsApp, prellenado con los productos y su total.
          </p>
          {!config.hasWhatsappOrdersModule && (
            <p className="mt-2 text-[12px] font-bold" style={{ color: "var(--brand-primary)" }}>
              Este módulo requiere el plan Pro o superior.
            </p>
          )}
        </div>
        <div className="pt-1">
          <Toggle
            checked={config.whatsappOrderingEnabled}
            onChange={(v) => {
              if (config.hasWhatsappOrdersModule) {
                setConfig((p) => ({ ...p, whatsappOrderingEnabled: v }));
              } else {
                toast.info("Para habilitar los pedidos por WhatsApp necesitas actualizar al plan Pro o superior.");
              }
            }}
            label="Pedir por WhatsApp"
          />
        </div>
      </div>

      {/* Aviso al dueño de nuevos pedidos web */}
      <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-tx-hi">Avisarme por WhatsApp cada pedido web</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-tx-mut">
              {config.orderAlertEnabled
                ? "Recibirás un WhatsApp con el resumen cada vez que entre un pedido de la tienda online."
                : "Apagado — solo llega el aviso al TPV."}
            </p>
          </div>
          <Toggle checked={config.orderAlertEnabled} onChange={(v) => setConfig((p) => ({ ...p, orderAlertEnabled: v }))} label="Avisarme por WhatsApp" />
        </div>
        {config.orderAlertEnabled && (
          <div className="mt-3">
            <Field label="Número que recibe los avisos" hint="Si lo dejas vacío, se usa el teléfono de contacto">
              <Input
                type="text"
                value={config.orderAlertWhatsapp}
                onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, orderAlertWhatsapp: v })); }}
                placeholder="Si lo dejas vacío, se usa el teléfono de contacto"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Field label="Dirección principal">
          <Input type="text" value={config.address} onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, address: v })); }} />
        </Field>
      </div>

      <div className="mt-4">
        <Field
          label="Moneda de la tienda"
          hint={`Cómo se muestran los precios en la tienda. Vista previa: ${formatPreview(config.currency, config.currencyLocale)}`}
        >
          <Select
            value={config.currency}
            onChange={(e) => {
              const c = CURRENCIES.find((x) => x.code === e.target.value) ?? { code: "MXN", locale: "es-MX" };
              setConfig((p) => ({ ...p, currency: c.code, currencyLocale: c.locale }));
            }}
          >
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </Select>
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
