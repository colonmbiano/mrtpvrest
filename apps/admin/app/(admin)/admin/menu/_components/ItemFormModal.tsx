"use client";
import Image from "next/image";
import { Check, ImagePlus, Plus, X } from "lucide-react";
import { Button, Input, Modal, Select, Toggle } from "@/components/ds";
import ModifierGroupsEditor from "@/components/admin/ModifierGroupsEditor";
import ComboBuilder from "@/components/admin/ComboBuilder";
import { EditableList, type EditableCtl } from "./EditableList";

const UNIT_OPTIONS = ["pz", "kg", "g", "L", "ml", "orden", "bolsa", "lata", "caja", "paquete", "docena", "porción"];
const PROMO_DAYS = [
  { key: "MONDAY", label: "Lun" },
  { key: "TUESDAY", label: "Mar" },
  { key: "WEDNESDAY", label: "Mié" },
  { key: "THURSDAY", label: "Jue" },
  { key: "FRIDAY", label: "Vie" },
  { key: "SATURDAY", label: "Sáb" },
  { key: "SUNDAY", label: "Dom" },
];

/* Etiqueta mono (hermana del control, para e2e y consistencia visual). */
function L({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">{children}</label>;
}

/* Fila para añadir una opción (variante / complemento). */
function AddRow({ ctl, placeholder }: { ctl: EditableCtl; placeholder: string }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2">
      <input
        value={ctl.newItem.name}
        onChange={e => ctl.setNewItem(p => ({ ...p, name: e.target.value }))}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ctl.onAdd(); } }}
        placeholder={placeholder}
        className="col-span-6 rounded-ds-sm px-3 py-2 text-sm text-tx outline-none"
        style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
      />
      <div className="col-span-3 flex items-center gap-1">
        <span className="text-xs text-tx-mut">$</span>
        <input
          value={ctl.newItem.price}
          type="number"
          step="0.01"
          onWheel={e => e.currentTarget.blur()}
          onChange={e => ctl.setNewItem(p => ({ ...p, price: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ctl.onAdd(); } }}
          placeholder="0"
          className="w-full rounded-ds-sm px-2 py-2 text-right text-sm text-tx outline-none"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
        />
      </div>
      <button
        type="button"
        onClick={ctl.onAdd}
        disabled={ctl.saving || !ctl.newItem.name.trim()}
        className="col-span-3 grid place-items-center rounded-ds-sm py-2 text-sm font-black"
        style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)", opacity: ctl.saving || !ctl.newItem.name.trim() ? 0.5 : 1 }}
      >
        + Agregar
      </button>
    </div>
  );
}

export function ItemFormModal({
  open,
  onClose,
  editItem,
  form,
  setForm,
  cats,
  variantTemplates,
  items,
  imagePreview,
  onImageFile,
  onImageUrlChange,
  saving,
  uploading,
  onSubmit,
  showNewCat,
  setShowNewCat,
  newCatName,
  setNewCatName,
  creatingCat,
  onCreateCategory,
  variantsCtl,
  complementsCtl,
}: {
  open: boolean;
  onClose: () => void;
  editItem: any;
  form: any;
  setForm: (updater: (prev: any) => any) => void;
  cats: any[];
  variantTemplates: any[];
  items: any[];
  imagePreview: string;
  onImageFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageUrlChange: (value: string) => void;
  saving: boolean;
  uploading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  showNewCat: boolean;
  setShowNewCat: (updater: (prev: boolean) => boolean) => void;
  newCatName: string;
  setNewCatName: (v: string) => void;
  creatingCat: boolean;
  onCreateCategory: () => void;
  variantsCtl: EditableCtl;
  complementsCtl: EditableCtl;
}) {
  const priceLabel = form.saleUnit === "WEIGHT" ? "Precio por kg" : form.saleUnit === "ORDER" ? "Precio por orden" : "Precio Base";

  return (
    <Modal open={open} onClose={onClose} title={editItem ? "Editar platillo" : "Nuevo platillo"} size="md">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Imagen */}
        <div>
          <L>Imagen</L>
          {imagePreview && (
            <>
              <div className="relative mb-2 h-40 w-full overflow-hidden rounded-ds-md" style={{ background: "var(--surf-2)" }}>
                <Image src={imagePreview} alt="preview" fill className={form.imageFit === "contain" ? "object-contain" : "object-cover"} />
              </div>
              <div className="mb-2 flex gap-2">
                {([["cover", "Rellenar", "Recorta para llenar la tarjeta"], ["contain", "Ajustar", "Muestra la foto completa"]] as const).map(([val, label, hint]) => {
                  const active = form.imageFit === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, imageFit: val }))}
                      title={hint}
                      className="min-h-10 flex-1 rounded-ds-md px-3 text-xs font-bold transition-all"
                      style={{
                        background: active ? "var(--brand-primary)" : "transparent",
                        color: active ? "var(--accent-contrast)" : "var(--tx-mut)",
                        border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-ds-md text-xs font-bold text-tx-mut"
            style={{ border: "1px solid var(--bd-1)" }}>
            <ImagePlus size={15} /> Subir foto
            <input type="file" accept="image/*" onChange={onImageFile} className="hidden" />
          </label>
          <Input value={form.imageUrl} onChange={e => onImageUrlChange(e.target.value)}
            placeholder="o pega URL" className="mt-2" />
        </div>

        {/* Nombre */}
        <div>
          <L>Nombre</L>
          <Input placeholder="Hamburguesa" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
        </div>

        {/* Precio */}
        <div>
          <L>{priceLabel}</L>
          <Input placeholder="89.00" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} onWheel={e => e.currentTarget.blur()} required type="number" inputMode="decimal" />
        </div>

        {/* Unidad de venta */}
        <div>
          <L>Unidad de venta</L>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: "PIECE", label: "Por pieza", hint: "Cantidad entera" },
              { v: "WEIGHT", label: "Por kilo", hint: "Báscula (kg)" },
              { v: "ORDER", label: "Por orden", hint: "Ración/combo" },
            ] as const).map(opt => {
              const active = form.saleUnit === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, saleUnit: opt.v }))}
                  className="flex flex-col items-start gap-0.5 rounded-ds-md px-3 py-2.5 text-left transition-all"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--surf-2)",
                    border: `1.5px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                  }}
                >
                  <span className="text-sm font-semibold text-tx">{opt.label}</span>
                  <span className="text-[10px] text-tx-mut">{opt.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Unidad de medida (etiqueta) */}
        <div>
          <L>Unidad de medida (etiqueta)</L>
          <Select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
          <p className="mt-1 text-[10px] text-tx-mut">Cómo se muestra en el ticket (ej. “$120 / {form.unit}”). No cambia el cobro.</p>
        </div>

        {/* Categoría */}
        <div>
          <L>Categoría</L>
          <div className="flex gap-2">
            <Select
              value={form.categoryId}
              onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
              required={!showNewCat}
              className="flex-1"
            >
              <option value="">Seleccionar…</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <button
              type="button"
              onClick={() => { setShowNewCat(s => !s); setNewCatName(""); }}
              className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-ds-md px-3 text-xs font-bold transition-all"
              style={{
                background: showNewCat ? "var(--brand-primary)" : "transparent",
                color: showNewCat ? "var(--accent-contrast)" : "var(--brand-primary)",
                border: "1px solid var(--brand-primary)",
              }}
              aria-label="Crear nueva categoría"
            >
              {showNewCat ? <><X size={13} /> Cerrar</> : <><Plus size={13} /> Nueva</>}
            </button>
          </div>

          {showNewCat && (
            <div className="mt-2 flex gap-2 rounded-ds-md p-2" style={{ background: "var(--surf-2)", border: "1px dashed var(--brand-primary)" }}>
              <input
                autoFocus
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); onCreateCategory(); }
                  if (e.key === "Escape") { setShowNewCat(() => false); setNewCatName(""); }
                }}
                placeholder="Nombre de la nueva categoría"
                className="min-h-10 flex-1 rounded-ds-sm px-3 text-sm text-tx outline-none"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
              />
              <button
                type="button"
                onClick={onCreateCategory}
                disabled={creatingCat || !newCatName.trim()}
                className="min-h-10 rounded-ds-sm px-4 text-xs font-bold transition-all disabled:opacity-50"
                style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)" }}
              >
                {creatingCat ? "…" : "Crear"}
              </button>
            </div>
          )}
        </div>

        {/* Selección múltiple de variantes */}
        <div>
          <L>Selección de Variantes</L>
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, variantMultiSelect: !p.variantMultiSelect }))}
            className="flex w-full items-center justify-between rounded-ds-md px-3 py-2.5 text-left text-sm transition-all"
            style={{
              background: form.variantMultiSelect ? "var(--accent-soft)" : "var(--surf-2)",
              border: `1.5px solid ${form.variantMultiSelect ? "var(--brand-primary)" : "var(--bd-1)"}`,
            }}
          >
            <div>
              <span className="font-bold text-tx">Permitir elegir varias</span>
              <p className="mt-0.5 text-xs text-tx-mut">Para sabores que se combinan (ej. 1kg de boneless con 3 sabores).</p>
            </div>
            <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded"
              style={{ background: form.variantMultiSelect ? "var(--brand-primary)" : "var(--surf-1)", border: `1px solid ${form.variantMultiSelect ? "var(--brand-primary)" : "var(--bd-1)"}` }}>
              {form.variantMultiSelect && <Check size={12} strokeWidth={3} style={{ color: "var(--accent-contrast)" }} />}
            </span>
          </button>
          {form.variantMultiSelect && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-[.1em] text-tx-mut">Mínimo (0 = opcional)</label>
                <Input type="number" min={0} value={form.variantMinSelection} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(p => ({ ...p, variantMinSelection: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-[.1em] text-tx-mut">Máximo (0 = sin tope)</label>
                <Input type="number" min={0} value={form.variantMaxSelection} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(p => ({ ...p, variantMaxSelection: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
              </div>
            </div>
          )}
        </div>

        {/* Grupos de Variantes */}
        <div>
          <L>Grupos de Variantes <span className="font-sans normal-case tracking-normal text-tx-dim">(Opcional)</span></L>
          {variantTemplates.length === 0 ? (
            <p className="px-1 text-xs text-tx-mut">
              Sin grupos creados.{" "}
              <a href="/admin/menu/variantes" target="_blank" className="font-bold text-primary">Crear grupos →</a>
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {variantTemplates.map((tpl: any) => {
                const selected = form.variantTemplateIds.includes(tpl.id);
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setForm(p => ({
                      ...p,
                      variantTemplateIds: selected
                        ? p.variantTemplateIds.filter((id: string) => id !== tpl.id)
                        : [...p.variantTemplateIds, tpl.id],
                    }))}
                    className="flex items-center justify-between rounded-ds-md px-3 py-2.5 text-left text-sm transition-all"
                    style={{
                      background: selected ? "var(--accent-soft)" : "var(--surf-2)",
                      border: `1.5px solid ${selected ? "var(--brand-primary)" : "var(--bd-1)"}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded"
                        style={{ background: selected ? "var(--brand-primary)" : "var(--surf-1)", border: `1px solid ${selected ? "var(--brand-primary)" : "var(--bd-1)"}` }}>
                        {selected && <Check size={12} strokeWidth={3} style={{ color: "var(--accent-contrast)" }} />}
                      </span>
                      <span className="font-bold text-tx">{tpl.name}</span>
                    </div>
                    <span className="text-xs text-tx-mut">{tpl.options?.length ?? 0} opciones</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Variantes directas */}
        <div>
          <L>Variantes / Tamaños <span className="font-sans normal-case tracking-normal text-tx-dim">(Precio propio · ej. Chica, Grande)</span></L>
          {editItem ? (
            <EditableList
              items={variantsCtl.items}
              editingId={variantsCtl.editingId}
              editForm={variantsCtl.editForm}
              onStartEdit={variantsCtl.onStartEdit}
              onSaveEdit={variantsCtl.onSaveEdit}
              onCancelEdit={variantsCtl.onCancelEdit}
              onDelete={variantsCtl.onDelete}
              onChangeForm={variantsCtl.setEditForm}
              addSection={<AddRow ctl={variantsCtl} placeholder="Nueva variante (ej. Chica)" />}
            />
          ) : (
            <p className="rounded-ds-md border border-dashed p-3 text-xs text-tx-mut">
              Guarda primero el platillo para agregarle variantes con precio propio (ej. “Chica $90”, “Grande $160”).
            </p>
          )}
          {variantsCtl.items.length > 0 && (
            <p className="mt-1.5 px-1 text-[11px] text-tx-mut">
              El TPV pedirá elegir una variante al agregar este producto y cobrará el precio de la variante.
            </p>
          )}
        </div>

        {/* Modificadores */}
        <div>
          <L>Modificadores <span className="font-sans normal-case tracking-normal text-tx-dim">(Sin costo o con extra)</span></L>
          {editItem ? (
            <ModifierGroupsEditor itemId={editItem.id} />
          ) : (
            <p className="rounded-ds-md border border-dashed p-3 text-xs text-tx-mut">
              Guarda primero el platillo para agregar grupos de modificadores (ej. “Tipo de leche”, “Sin azúcar”).
            </p>
          )}
        </div>

        {/* Combo configurable */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 rounded-ds-md px-3 py-2.5"
            style={{ background: form.isCombo ? "var(--ok-soft)" : "var(--surf-2)", border: `1px solid ${form.isCombo ? "var(--ok)" : "var(--bd-1)"}` }}>
            <div>
              <span className="font-bold text-tx">Es un combo configurable</span>
              <p className="mt-0.5 text-xs text-tx-mut">El cliente arma el combo eligiendo entre componentes (principal, guarnición, bebida…).</p>
            </div>
            <Toggle checked={form.isCombo} onChange={() => setForm(p => ({ ...p, isCombo: !p.isCombo }))} label="Es un combo configurable" />
          </div>
          {form.isCombo && (editItem
            ? <ComboBuilder itemId={editItem.id} products={items.map((it: any) => ({ id: it.id, name: it.name }))} />
            : <p className="rounded-ds-md border border-dashed p-3 text-xs text-tx-mut">Guarda primero el combo para armar sus componentes y opciones.</p>
          )}
        </div>

        {/* Complementos */}
        <div>
          <L>Complementos <span className="font-sans normal-case tracking-normal text-tx-dim">(Productos extra con precio)</span></L>
          {editItem ? (
            <EditableList
              items={complementsCtl.items}
              editingId={complementsCtl.editingId}
              editForm={complementsCtl.editForm}
              onStartEdit={complementsCtl.onStartEdit}
              onSaveEdit={complementsCtl.onSaveEdit}
              onCancelEdit={complementsCtl.onCancelEdit}
              onDelete={complementsCtl.onDelete}
              onChangeForm={complementsCtl.setEditForm}
              addSection={<AddRow ctl={complementsCtl} placeholder="Nuevo complemento (ej. Refresco)" />}
            />
          ) : (
            <p className="rounded-ds-md border border-dashed p-3 text-xs text-tx-mut">
              Guarda primero el platillo para agregar complementos (ej. “Refresco”, “Papas”).
            </p>
          )}
        </div>

        {/* Visibilidad por canal */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-ds-md px-3 py-2.5"
            style={{ background: form.availableOnline ? "var(--ok-soft)" : "var(--surf-2)", border: `1px solid ${form.availableOnline ? "var(--ok)" : "var(--bd-1)"}` }}>
            <div>
              <span className="font-bold text-tx">Mostrar en tienda en línea</span>
              <p className="mt-0.5 text-xs text-tx-mut">
                {form.availableOnline
                  ? "Visible y pedible desde la web. Se sigue vendiendo en el TPV."
                  : "Oculto en la web. Sigue disponible para cobrar en el TPV."}
              </p>
            </div>
            <Toggle checked={form.availableOnline} onChange={() => setForm(p => ({ ...p, availableOnline: !p.availableOnline }))} label="Mostrar en tienda en línea" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-ds-md px-3 py-2.5"
            style={{ background: form.availableOnKiosk ? "var(--ok-soft)" : "var(--surf-2)", border: `1px solid ${form.availableOnKiosk ? "var(--ok)" : "var(--bd-1)"}` }}>
            <div>
              <span className="font-bold text-tx">Mostrar en kiosko</span>
              <p className="mt-0.5 text-xs text-tx-mut">
                {form.availableOnKiosk
                  ? "Visible y pedible desde el kiosko de autoservicio."
                  : "Oculto en el kiosko. No afecta la web ni el TPV."}
              </p>
            </div>
            <Toggle checked={form.availableOnKiosk} onChange={() => setForm(p => ({ ...p, availableOnKiosk: !p.availableOnKiosk }))} label="Mostrar en kiosko" />
          </div>
        </div>

        {/* Promoción por día */}
        <div>
          <div className="flex items-center justify-between py-1">
            <span className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Promoción por día</span>
            <Toggle checked={form.isPromo} onChange={() => setForm(p => ({ ...p, isPromo: !p.isPromo }))} label="Promoción por día" />
          </div>
          {form.isPromo && (
            <div className="mt-3 grid gap-3">
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Precio promocional</label>
                <Input
                  type="number"
                  min="0.01"
                  max={form.price ? Math.max(0.01, Number(form.price) - 0.01) : undefined}
                  step="0.01"
                  value={form.promoPrice}
                  onChange={e => setForm(p => ({ ...p, promoPrice: e.target.value }))}
                  onWheel={e => e.currentTarget.blur()}
                  inputMode="decimal"
                  placeholder="Ej. 79.00"
                  required
                  className="font-mono font-bold"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PROMO_DAYS.map(({ key, label }) => {
                  const active = form.activeDays.includes(key);
                  return (
                    <button key={key} type="button"
                      onClick={() => setForm(p => ({
                        ...p,
                        activeDays: active
                          ? p.activeDays.filter((d: string) => d !== key)
                          : [...p.activeDays, key],
                      }))}
                      className="min-h-10 rounded-ds-sm px-3 text-xs font-bold transition-all"
                      style={{
                        background: active ? "var(--brand-primary)" : "var(--surf-2)",
                        color: active ? "var(--accent-contrast)" : "var(--tx-mut)",
                        border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                      }}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {/* Ventana horaria PROPIA de esta promo (override del corte global
                  del restaurante). Vacío = hereda el horario general. */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Horario de la promo (opcional)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="mb-1 block text-[10px] text-tx-mut">Desde</span>
                    <Input type="time" value={form.promoStartTime}
                      onChange={e => setForm(p => ({ ...p, promoStartTime: e.target.value }))}
                      className="font-mono" />
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] text-tx-mut">Hasta</span>
                    <Input type="time" value={form.promoEndTime}
                      onChange={e => setForm(p => ({ ...p, promoEndTime: e.target.value }))}
                      className="font-mono" />
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-tx-mut">Vacío = usa el horario general de promociones del restaurante. Para que esta promo corra <b>todo el día</b> en sus días activos (ignorando el corte general), pon <b>Desde 00:00</b> y deja Hasta vacío.</p>
              </div>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="mt-2 flex gap-3">
          <Button variant="secondary" full onClick={onClose}>Cancelar</Button>
          <Button type="submit" full disabled={saving || uploading} icon={Check}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
