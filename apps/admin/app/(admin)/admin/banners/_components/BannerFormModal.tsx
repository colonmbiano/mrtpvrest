"use client";
import type { RefObject } from "react";
import { Image as ImageIcon, Upload, CalendarDays, Clock } from "lucide-react";
import { Field, Input, Select, Toggle, Button, Modal } from "@/components/ds";
import { type BannerForm, type Cat, type Item, DAYS, LINK_TYPES } from "./types";

const inputCls = "w-full min-h-11 rounded-ds-md px-4 text-sm outline-none";
const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

export function BannerFormModal({
  isEdit,
  form,
  setForm,
  cats,
  items,
  fileRef,
  uploading,
  saving,
  onUpload,
  onToggleDay,
  onSubmit,
  onClose,
}: {
  isEdit: boolean;
  form: BannerForm;
  setForm: React.Dispatch<React.SetStateAction<BannerForm>>;
  cats: Cat[];
  items: Item[];
  fileRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  saving: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleDay: (day: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Editar banner" : "Nuevo banner"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {/* Vive en el footer del Modal, fuera del <form>, así que dispara
              onSubmit a mano; el form conserva su onSubmit para el Enter. */}
          <Button onClick={onSubmit} loading={saving} disabled={saving}>
            {saving ? "Guardando…" : "Guardar banner"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-5"
      >
        {/* Imagen / preview */}
        <div>
          <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Imagen</label>
          {form.imageUrl ? (
            <div className="relative mb-2 overflow-hidden rounded-ds-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.imageUrl} alt="preview" className="h-36 w-full object-cover" />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end p-3"
                style={{ background: "linear-gradient(0deg,rgba(0,0,0,.7),transparent)" }}
              >
                <div className="min-w-0">
                  {form.title && <div className="truncate font-display text-sm font-extrabold text-white">{form.title}</div>}
                  {form.description && <div className="truncate text-[11px] text-white/80">{form.description}</div>}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="mb-2 grid h-36 w-full place-items-center rounded-ds-md text-tx-dim"
              style={{ background: "var(--surf-2)", border: "1px dashed var(--bd-1)" }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <ImageIcon size={26} />
                <span className="text-[11px]">Vista previa del banner</span>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mb-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-ds-md text-sm font-bold text-tx-mid"
            style={{ border: "1px solid var(--bd-1)" }}
          >
            <Upload size={16} /> {uploading ? "Subiendo…" : "Subir imagen"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
          <input
            value={form.imageUrl}
            onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
            placeholder="o pega URL de imagen"
            className={inputCls}
            style={inputStyle}
          />
        </div>

        {/* Titulo y descripcion */}
        <Field label="Título">
          <Input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Ej: Jueves de Burritos $100"
          />
        </Field>
        <Field label="Descripción">
          <Input
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Ej: Solo en burritos campechanos"
          />
        </Field>

        {/* Enlace */}
        <div>
          <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
            Enlace al tocar
          </label>
          <div className="mb-2 grid grid-cols-2 gap-2">
            {LINK_TYPES.map((t) => {
              const active = form.linkType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, linkType: t.value, linkValue: "" }))}
                  className="min-h-10 rounded-ds-md text-xs font-bold"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--surf-2)",
                    color: active ? "var(--brand-primary)" : "var(--tx-mut)",
                    border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {form.linkType === "CATEGORY" && (
            <Select value={form.linkValue} onChange={(e) => setForm((p) => ({ ...p, linkValue: e.target.value }))}>
              <option value="">Selecciona categoría</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          {form.linkType === "ITEM" && (
            <Select value={form.linkValue} onChange={(e) => setForm((p) => ({ ...p, linkValue: e.target.value }))}>
              <option value="">Selecciona producto</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          )}
          {form.linkType === "URL" && (
            <Input
              value={form.linkValue}
              onChange={(e) => setForm((p) => ({ ...p, linkValue: e.target.value }))}
              placeholder="https://..."
            />
          )}
        </div>

        {/* ── PROGRAMACION ───────────────────────────────── */}
        <div className="rounded-ds-lg border p-4" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
          <div className="mb-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-primary">
            <CalendarDays size={13} /> Programación
          </div>

          {/* Dias de la semana */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-bold text-tx-mut">Días de la semana</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const on = form.scheduleDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => onToggleDay(d.value)}
                    className="min-h-10 rounded-ds-md px-3 text-xs font-bold transition-all"
                    style={{
                      background: on ? "var(--brand-primary)" : "var(--surf-1)",
                      color: on ? "var(--accent-contrast)" : "var(--tx-mut)",
                      border: `1px solid ${on ? "var(--brand-primary)" : "var(--bd-1)"}`,
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, scheduleDays: [0, 1, 2, 3, 4, 5, 6] }))}
                className="rounded-ds-sm px-2 py-1 text-xs font-bold text-primary"
              >
                Todos los días
              </button>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, scheduleDays: [1, 2, 3, 4, 5] }))}
                className="rounded-ds-sm px-2 py-1 text-xs font-semibold text-tx-mut"
              >
                Lun-Vie
              </button>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, scheduleDays: [5, 6] }))}
                className="rounded-ds-sm px-2 py-1 text-xs font-semibold text-tx-mut"
              >
                Fin de semana
              </button>
            </div>
          </div>

          {/* Horario */}
          <div className="mb-4">
            <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-tx-mut">
              <Clock size={13} /> Horario (opcional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={form.scheduleStart}
                onChange={(e) => setForm((p) => ({ ...p, scheduleStart: e.target.value }))}
                className="min-h-11 flex-1 rounded-ds-md px-3 text-sm outline-none"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
              />
              <span className="text-tx-mut">—</span>
              <input
                type="time"
                value={form.scheduleEnd}
                onChange={(e) => setForm((p) => ({ ...p, scheduleEnd: e.target.value }))}
                className="min-h-11 flex-1 rounded-ds-md px-3 text-sm outline-none"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
              />
            </div>
            {form.scheduleStart && form.scheduleEnd && form.scheduleStart > form.scheduleEnd && (
              <div className="mt-2 text-[11px] text-tx-mut">
                Horario nocturno: se mostrará desde las {form.scheduleStart} hasta las {form.scheduleEnd} del día
                siguiente.
              </div>
            )}
          </div>

          {/* Rango de fechas */}
          <div>
            <label className="mb-2 block text-xs font-bold text-tx-mut">Rango de fechas (opcional)</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="mb-1 text-xs text-tx-mut">Desde</div>
                <input
                  type="date"
                  value={form.dateFrom}
                  onChange={(e) => setForm((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="min-h-11 w-full rounded-ds-md px-3 text-sm outline-none"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                />
              </div>
              <span className="mt-4 text-tx-mut">→</span>
              <div className="flex-1">
                <div className="mb-1 text-xs text-tx-mut">Hasta (expiración)</div>
                <input
                  type="date"
                  value={form.dateTo}
                  onChange={(e) => setForm((p) => ({ ...p, dateTo: e.target.value }))}
                  className="min-h-11 w-full rounded-ds-md px-3 text-sm outline-none"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Activo */}
        <div
          className="flex items-center justify-between rounded-ds-md px-4 py-3"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-tx">Banner activo</div>
            <div className="mt-0.5 text-[11px] text-tx-mut">Se mostrará solo en los días/horas programados</div>
          </div>
          <Toggle
            checked={form.isActive}
            onChange={(next) => setForm((p) => ({ ...p, isActive: next }))}
            label="Banner activo"
          />
        </div>
      </form>
    </Modal>
  );
}
