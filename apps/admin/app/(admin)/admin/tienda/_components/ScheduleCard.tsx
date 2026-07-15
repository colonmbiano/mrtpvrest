"use client";
import type { Dispatch, SetStateAction } from "react";
import { Globe, Clock, AlertTriangle } from "lucide-react";
import { Field, Input, Select, Toggle } from "@/components/ds";
import { SectionCard } from "./ui";
import { COUNTRIES, TIMEZONES, WEEK_DAYS, DEFAULT_HOUR, type BusinessHour, type TiendaConfig } from "./types";

type Props = {
  config: TiendaConfig;
  setConfig: Dispatch<SetStateAction<TiendaConfig>>;
};

export function ScheduleCard({ config, setConfig }: Props) {
  // Devuelve la franja configurada para un día, o el default si no existe.
  const getDayHour = (day: number): BusinessHour =>
    config.businessHours.find((h) => h.day === day) || { day, ...DEFAULT_HOUR };

  // Aplica un cambio parcial a la franja de un día, manteniendo el array ordenado.
  const setDayHour = (day: number, patch: Partial<BusinessHour>) => {
    setConfig((p) => {
      const current = p.businessHours.find((h) => h.day === day) || { day, ...DEFAULT_HOUR };
      const others = p.businessHours.filter((h) => h.day !== day);
      return {
        ...p,
        businessHours: [...others, { ...current, ...patch }].sort((a, b) => a.day - b.day),
      };
    });
  };

  return (
    <>
      {/* País / WhatsApp */}
      <SectionCard
        icon={Globe}
        title="País"
        subtitle="Define la lada que se antepone a los teléfonos en los enlaces de WhatsApp"
      >
        <Select
          value={config.countryCode}
          onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, countryCode: v })); }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </Select>
      </SectionCard>

      {/* Horario de atención automático */}
      <div className="rounded-ds-xl shadow-card" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Clock size={16} className="shrink-0 text-tx-mid" />
                <p className="font-display text-base font-extrabold text-tx-hi">Horario automático</p>
              </div>
              <p className="mt-1 text-[12px] text-tx-mut">
                {config.scheduleEnabled ? "La tienda abre y cierra sola según el horario" : "Desactivado — controlas la apertura manualmente"}
              </p>
            </div>
            <Toggle checked={config.scheduleEnabled} onChange={(v) => setConfig((p) => ({ ...p, scheduleEnabled: v }))} label="Horario automático" />
          </div>

          {config.scheduleEnabled && (
            <div className="mt-4 space-y-4">
              {!config.isOpen && (
                <p className="flex items-start gap-2 rounded-2xl px-4 py-3 text-[11.5px] font-semibold" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  El interruptor «Estado de la tienda» está en cerrado y manda sobre el horario: la tienda seguirá cerrada hasta que lo vuelvas a abrir.
                </p>
              )}

              <Field label="Zona horaria">
                <Select
                  value={config.timezone}
                  onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, timezone: v })); }}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-2">
                {WEEK_DAYS.map((d) => {
                  const h = getDayHour(d.value);
                  return (
                    <div key={d.value} className="flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                      <Toggle checked={h.enabled} onChange={(v) => setDayHour(d.value, { enabled: v })} label={`${d.label} abierto`} />
                      <span className="w-20 shrink-0 text-[12.5px] font-bold text-tx">{d.label}</span>
                      {h.enabled ? (
                        <div className="ml-auto flex items-center gap-2">
                          <div className="w-24">
                            <Input
                              type="time"
                              value={h.open}
                              onChange={(e) => { const v = e.target.value; setDayHour(d.value, { open: v }); }}
                            />
                          </div>
                          <span className="text-xs font-bold text-tx-dim">a</span>
                          <div className="w-24">
                            <Input
                              type="time"
                              value={h.close}
                              onChange={(e) => { const v = e.target.value; setDayHour(d.value, { close: v }); }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-[.12em] text-tx-dim">Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-tx-mut">
                Tip: para un turno nocturno que cruza medianoche (ej. 18:00 → 02:00), pon la hora de cierre menor a la de apertura.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
