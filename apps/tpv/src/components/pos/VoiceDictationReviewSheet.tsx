"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  Mic,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildOptionGroups,
  computeUnitExtra,
  flattenSelections,
  getValidationError,
} from "@/lib/modifiers";
import { formatModifierGroupName } from "@/lib/formatDisplayName";
import type {
  CartItem,
  Modifier,
  ModifierGroup,
  Product,
} from "@/store/ticketStore";

/**
 * VoiceDictationReviewSheet — hoja de revisión del dictado por voz del TPV.
 *
 * En vez de meter lo dictado DIRECTO al ticket (donde un error del parser se
 * vuelve un cobro mal hecho), el cajero revisa primero: ve qué entendió el
 * sistema (producto, cantidad, variante, modificadores, precio), corrige lo
 * que haga falta, resuelve lo que el parser marcó como dudoso y decide qué
 * términos no reconocidos agregar a mano. Solo al confirmar entran al ticket.
 *
 * Reusa los MISMOS helpers del configurador del POS (lib/modifiers) para que
 * el agrupado, el precio y la validación sean idénticos a agregar el producto
 * a mano. El precio mostrado es informativo: el backend re-lee precios de DB.
 */

// Selecciones que devuelve el backend (order-dictation), ya normalizadas para
// que el motor de reglas y el de IA compartan el mismo shape.
export type VoiceDictationSelections = {
  selectedVariant?: { id: string; name: string; price: number } | null;
  selectedVariants?: { id: string; name: string; price: number }[];
  selectedModifiers?: { id: string; groupId: string; name: string; priceAdd: number }[];
  selectedComplements?: { id: string; name: string; price: number }[];
  unitPrice?: number;
};

export type VoiceDictationItem = {
  menuItemId: string;
  quantity: number;
  // Peso en kg para productos de báscula (soldByWeight). El backend lo manda
  // cuando detecta "medio kilo", "un kilo", etc.
  weightKg?: number | null;
  notes?: string;
  needsReview?: boolean;
  selections?: VoiceDictationSelections;
  product: Product;
};

// Línea editable interna de la hoja. Los modificadores se guardan como un
// conjunto de ids con la MISMA convención prefijada que buildOptionGroups
// (variant:/complement: para multi-select), para poder editar con los helpers.
type ReviewLine = {
  key: string;
  product: Product;
  quantity: number;
  // Peso en kg si el producto es de báscula (soldByWeight); null si no.
  weightKg: number | null;
  variantId: string | null;
  modifierIds: string[];
  notes: string;
};

const WEIGHT_STEP = 0.25;
const isWeighed = (p: Product) => !!p.soldByWeight;

const isAvailable = (x: { isAvailable?: boolean }) => x.isAvailable !== false;

// Contador monotónico para keys de React estables (a nivel módulo para no leer
// un ref durante el render). Cada línea creada obtiene un id único e inmutable.
let keySeq = 0;
const nextKey = () => `vl${keySeq++}`;

function toLine(it: VoiceDictationItem): ReviewLine {
  return {
    key: nextKey(),
    product: it.product,
    quantity: Math.max(1, Math.min(99, Number(it.quantity || 1))),
    weightKg: isWeighed(it.product)
      ? Math.max(WEIGHT_STEP, Number(it.weightKg || 1))
      : null,
    variantId: it.selections?.selectedVariant?.id ?? null,
    modifierIds: selectionIdsFromBackend(it.selections),
    notes: it.notes?.trim() || "",
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Convierte las selecciones del backend al conjunto de ids prefijados que
// usan buildOptionGroups / flattenSelections.
function selectionIdsFromBackend(sel?: VoiceDictationSelections): string[] {
  if (!sel) return [];
  return [
    ...(sel.selectedModifiers ?? []).map((m) => m.id),
    ...(sel.selectedVariants ?? []).map((v) => `variant:${v.id}`),
    ...(sel.selectedComplements ?? []).map((c) => `complement:${c.id}`),
  ];
}

function selectionsRecord(
  groups: ModifierGroup[],
  ids: string[],
): Record<string, Modifier[]> {
  const set = new Set(ids);
  const out: Record<string, Modifier[]> = {};
  for (const group of groups) out[group.id] = group.modifiers.filter((m) => set.has(m.id));
  return out;
}

// Datos derivados de una línea (grupos, precio, validación). El catálogo del
// TPV es chico, así que recalcular por render es barato y mantiene todo en sync.
function computeLine(line: ReviewLine) {
  const product = line.product;
  const variants = (product.variants ?? []).filter(isAvailable);
  const variantMultiSelect = !!product.variantMultiSelect && variants.length > 0;
  const groups = buildOptionGroups(product, variants, variantMultiSelect);
  const selections = selectionsRecord(groups, line.modifierIds);
  const selectedVariant = variantMultiSelect
    ? null
    : variants.find((v) => v.id === line.variantId) ?? null;
  const basePrice = Number(selectedVariant?.price ?? product.promoPrice ?? product.price ?? 0);
  const unitPrice = basePrice + computeUnitExtra(groups, selections);
  const error = getValidationError(
    groups,
    selections,
    variants.length,
    selectedVariant,
    variantMultiSelect,
  );
  return { variants, variantMultiSelect, groups, selections, selectedVariant, unitPrice, error };
}

// Multiplicador del precio: kg para productos de báscula, unidades para el resto.
const lineMultiplier = (line: ReviewLine): number =>
  isWeighed(line.product) ? Number(line.weightKg || 0) : line.quantity;

// Selecciones por defecto al agregar un producto a mano (no dictado): variante
// única si solo hay una, y los modificadores marcados como default. Si hay
// varias variantes deja null para que el cajero la elija (badge "Revisar").
function defaultSelections(product: Product): { variantId: string | null; modifierIds: string[] } {
  const variants = (product.variants ?? []).filter(isAvailable);
  const variantMultiSelect = !!product.variantMultiSelect && variants.length > 0;
  const groups = buildOptionGroups(product, variants, variantMultiSelect);
  const modifierIds: string[] = [];
  for (const group of groups) {
    const defaults = group.modifiers.filter((m) => m.isDefault);
    (group.multiSelect ? defaults : defaults.slice(0, 1)).forEach((m) => modifierIds.push(m.id));
  }
  const variantId =
    variantMultiSelect || variants.length !== 1 ? null : variants[0]?.id ?? null;
  return { variantId, modifierIds };
}

/* ── Seguimiento conversacional ──────────────────────────────────────────────
 * Comandos de voz sobre la revisión EN CURSO: quitar, repetir/uno más, cambiar
 * una opción de la última línea, o "sin X". Todo client-side contra las líneas
 * actuales; si el texto no es un comando, el caller cae al flujo de AGREGAR.
 */
const SIZE_SYNONYMS: Record<string, string[]> = {
  grande: ["grande", "familiar", "jumbo"],
  grandes: ["grande", "familiar"],
  familiar: ["familiar", "grande"],
  mediano: ["mediano", "mediana", "medio"],
  mediana: ["mediana", "mediano", "medio"],
  media: ["mediana", "mediano"],
  chico: ["chico", "chica", "individual", "junior"],
  chica: ["chica", "chico", "individual", "junior"],
  individual: ["individual", "chico", "junior"],
};

function nameMatches(productName: string, query: string): boolean {
  const p = normalizeText(productName);
  const q = normalizeText(query).trim();
  if (!q) return false;
  if (p.includes(q) || q.includes(p)) return true;
  const tokens = q.split(/\s+/).filter((w) => w.length >= 3);
  return tokens.length > 0 && tokens.every((w) => p.includes(w));
}

function optionMatches(optionName: string, query: string): boolean {
  const o = normalizeText(optionName);
  const q = normalizeText(query).trim();
  if (!q) return false;
  if (o.includes(q) || q.includes(o)) return true;
  const syns = SIZE_SYNONYMS[q];
  return !!syns && syns.some((s) => o.includes(s));
}

export type VoiceReviewHandle = {
  // Intenta interpretar `text` como comando sobre la revisión en curso.
  // Devuelve true si lo manejó (no hay que mandarlo al backend a agregar).
  applyVoiceCommand: (text: string) => boolean;
};

type VoiceReviewProps = {
  transcript: string;
  items: VoiceDictationItem[];
  unresolved: string[];
  catalog: Product[];
  listening?: boolean;
  onConfirm: (cartItems: CartItem[]) => void;
  onClose: () => void;
  onDictateMore: () => void;
};

const VoiceDictationReviewSheet = forwardRef<VoiceReviewHandle, VoiceReviewProps>(
  function VoiceDictationReviewSheet(
    { transcript, items, unresolved, catalog, listening = false, onConfirm, onClose, onDictateMore },
    ref,
  ) {
  const [lines, setLines] = useState<ReviewLine[]>(() => items.map(toLine));
  const ingestedRef = useRef(items.length);
  // "Dictar más" sólo APENDE items nuevos (el parent concatena). Apendemos los
  // que aún no ingerimos sin tocar las líneas ya editadas por el cajero.
  useEffect(() => {
    if (items.length > ingestedRef.current) {
      const added = items.slice(ingestedRef.current).map(toLine);
      setLines((prev) => [...prev, ...added]);
      ingestedRef.current = items.length;
    }
  }, [items]);

  // Espejo de `lines` para que el handle imperativo lea SIEMPRE el último valor
  // (sin closures stale), ya que el parent llama applyVoiceCommand fuera de render.
  // Se sincroniza en un effect (no durante render) para cumplir react-hooks/refs.
  const linesRef = useRef<ReviewLine[]>(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const [dismissedUnresolved, setDismissedUnresolved] = useState<Set<string>>(new Set());
  const visibleUnresolved = unresolved.filter((u) => !dismissedUnresolved.has(u));

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const updateLine = (key: string, patch: Partial<ReviewLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setEditingKey((cur) => (cur === key ? null : cur));
  };

  // Aplica una opción hablada (variante/modificador) a una línea. Devuelve el
  // nombre aplicado o null si ninguna opción del producto coincide.
  const applyOptionToLine = (line: ReviewLine, optText: string): string | null => {
    const product = line.product;
    const variants = (product.variants ?? []).filter(isAvailable);
    const variantMultiSelect = !!product.variantMultiSelect && variants.length > 0;
    if (!variantMultiSelect) {
      const v = variants.find((x) => optionMatches(x.name, optText));
      if (v) {
        updateLine(line.key, { variantId: v.id });
        return v.name;
      }
    }
    const groups = buildOptionGroups(product, variants, variantMultiSelect);
    for (const group of groups) {
      const m = group.modifiers.find((x) => optionMatches(x.name, optText));
      if (m) {
        updateLine(line.key, { modifierIds: toggleId(line.modifierIds, group, m) });
        return m.name;
      }
    }
    return null;
  };

  const appendNote = (line: ReviewLine, note: string) =>
    updateLine(line.key, {
      notes: [line.notes, note].filter(Boolean).join(", ").slice(0, 200),
    });

  // Interpreta texto como comando sobre la revisión en curso (ver helpers arriba).
  const applyVoiceCommand = (text: string): boolean => {
    const t = normalizeText(text);
    const cur = linesRef.current;
    if (!t || cur.length === 0) return false;
    const last = cur[cur.length - 1] ?? null;
    const findLine = (q: string): ReviewLine | null => {
      const hits = cur.filter((l) => nameMatches(l.product.name, q));
      return hits.length ? hits[hits.length - 1] ?? null : null;
    };

    // Vaciar todo
    if (
      /^(?:quita|borra|elimina|limpia|cancela|vacia)\b/.test(t) &&
      /\b(?:todo|todos|la orden|el ticket|la cuenta|la comanda)\b/.test(t)
    ) {
      setLines([]);
      setEditingKey(null);
      toast.info("Lista de revisión vaciada");
      return true;
    }

    // Quitar (última o por nombre)
    const rm = t.match(/^(?:quita(?:me|le|la|lo)?|borra|elimina|saca)\s+(.+)$/);
    if (rm) {
      const arg = (rm[1] ?? "").replace(/^(?:la|el|los|las|un|una|unos|unas)\s+/, "").trim();
      if (/^ultim[oa]s?$/.test(arg) && last) {
        removeLine(last.key);
        toast.info(`Quité ${last.product.name}`);
        return true;
      }
      const line = findLine(arg);
      if (line) {
        removeLine(line.key);
        toast.info(`Quité ${line.product.name}`);
      } else {
        toast.error(`No encontré “${arg}” para quitar`);
      }
      return true;
    }

    // Repetir / uno más
    const more = t.match(
      /^(?:otra|otro|otras|otros|una mas|uno mas|dos mas|mas|lo mismo|igual|de nuevo|repite)\b\s*(?:de\s+)?(.*)$/,
    );
    if (more) {
      const name = (more[1] ?? "").trim();
      const line = name ? findLine(name) : last;
      if (!line) return false; // "otra X" sin línea previa → que lo agregue el backend
      if (isWeighed(line.product)) {
        updateLine(line.key, {
          weightKg: Math.round((Number(line.weightKg || 0) + WEIGHT_STEP) * 1000) / 1000,
        });
      } else {
        updateLine(line.key, { quantity: Math.min(99, line.quantity + 1) });
      }
      toast.success(`+1 ${line.product.name}`);
      return true;
    }

    // Cambiar opción de la última línea
    const chg = t.match(
      /^(?:que sea|que sean|ponle|pongale|hazla|hazlo|cambiale a|cambiala a|cambialo a|cambia a|esa|ese|esas|esos)\s+(.+)$/,
    );
    if (chg && last) {
      const opt = (chg[1] ?? "").trim();
      const applied = applyOptionToLine(last, opt);
      if (applied) toast.success(`${last.product.name}: ${applied}`);
      else {
        appendNote(last, opt);
        toast.success(`Nota: ${opt}`);
      }
      return true;
    }

    // "sin X" → apaga el modificador si existe, si no lo deja como nota
    const sin = t.match(/^sin\s+(.+)$/);
    if (sin && last) {
      const opt = (sin[1] ?? "").trim();
      const variants = (last.product.variants ?? []).filter(isAvailable);
      const groups = buildOptionGroups(
        last.product,
        variants,
        !!last.product.variantMultiSelect && variants.length > 0,
      );
      for (const group of groups) {
        const m = group.modifiers.find(
          (x) => optionMatches(x.name, opt) && last.modifierIds.includes(x.id),
        );
        if (m) {
          updateLine(last.key, { modifierIds: last.modifierIds.filter((id) => id !== m.id) });
          toast.success(`Quité ${m.name}`);
          return true;
        }
      }
      appendNote(last, `sin ${opt}`);
      toast.success(`Nota: sin ${opt}`);
      return true;
    }

    return false;
  };

  useImperativeHandle(ref, () => ({ applyVoiceCommand }));

  const addProduct = (product: Product) => {
    const { variantId, modifierIds } = defaultSelections(product);
    const line: ReviewLine = {
      key: nextKey(),
      product,
      quantity: 1,
      weightKg: isWeighed(product) ? 1 : null,
      variantId,
      modifierIds,
      notes: "",
    };
    setLines((prev) => [...prev, line]);
    setSearchOpen(false);
    setQuery("");
    // Si requiere elegir opciones, abre su editor de una vez.
    if (computeLine(line).error) setEditingKey(line.key);
  };

  const searchResults = useMemo(() => {
    const q = normalizeText(query);
    if (q.length < 2) return [];
    return catalog
      .filter(isAvailable)
      .filter((p) => normalizeText(p.name).includes(q) || normalizeText(p.category || "").includes(q))
      .slice(0, 12);
  }, [query, catalog]);

  const totals = useMemo(() => {
    let count = 0;
    let amount = 0;
    let pending = 0;
    for (const line of lines) {
      const { unitPrice, error } = computeLine(line);
      // Las líneas por peso cuentan como 1 (no se pueden "multiplicar" por kg).
      count += isWeighed(line.product) ? 1 : line.quantity;
      amount += unitPrice * lineMultiplier(line);
      if (error) pending += 1;
    }
    return { count, amount, pending };
  }, [lines]);

  const confirm = () => {
    if (totals.pending > 0 || lines.length === 0) return;
    const cartItems: CartItem[] = [];
    for (const line of lines) {
      const { groups, selections, selectedVariant, unitPrice } = computeLine(line);
      const modifiers = flattenSelections(groups, selections);
      const baseName = line.product.name;
      const buildItem = (extra: Partial<CartItem>): CartItem => ({
        ...line.product,
        menuItemId: line.product.id,
        quantity: 1,
        subtotal: unitPrice,
        price: unitPrice,
        originalPrice: line.product.price,
        baseName,
        variantId: selectedVariant?.id ?? null,
        variantName: selectedVariant?.name ?? null,
        name: selectedVariant ? `${baseName} (${selectedVariant.name})` : baseName,
        modifiers,
        notes: line.notes.trim() || undefined,
        ...extra,
      });
      if (isWeighed(line.product)) {
        // Báscula: 1 línea con weightKg; subtotal = precio/kg × kg.
        const weightKg = Math.round(Number(line.weightKg || 0) * 1000) / 1000;
        cartItems.push(buildItem({ weightKg, subtotal: unitPrice * weightKg }));
      } else {
        // Una unidad por vez → el store agrupa líneas idénticas.
        for (let i = 0; i < line.quantity; i += 1) cartItems.push(buildItem({}));
      }
    }
    onConfirm(cartItems);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl border border-bd bg-surf-1 text-tx-pri shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between gap-3 border-b border-bd p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-tx-mut">
              <Mic size={13} strokeWidth={3} />
              Revisar dictado
            </div>
            {transcript && (
              <p className="mt-1 line-clamp-2 text-[13px] font-medium text-tx-sec">
                “{transcript}”
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-bd bg-surf-2 text-tx-sec active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {lines.length === 0 && visibleUnresolved.length === 0 && (
            <div className="rounded-2xl border border-dashed border-bd p-6 text-center text-[13px] text-tx-mut">
              No quedó nada por agregar. Cierra o dicta de nuevo.
            </div>
          )}

          {lines.map((line) => {
            const { variants, variantMultiSelect, groups, selections, selectedVariant, unitPrice, error } =
              computeLine(line);
            const isEditing = editingKey === line.key;
            const summary = [
              selectedVariant?.name,
              ...flattenSelections(groups, selections).map((m) => m.name),
            ].filter(Boolean) as string[];

            return (
              <div
                key={line.key}
                className={`rounded-2xl border bg-surf-2 ${
                  error ? "border-warning" : "border-bd"
                }`}
              >
                {/* Resumen de la línea */}
                <div className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-bold">{line.product.name}</span>
                      {error && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                          <AlertTriangle size={11} strokeWidth={3} />
                          Revisar
                        </span>
                      )}
                    </div>
                    {summary.length > 0 && (
                      <p className="mt-0.5 truncate text-[12px] text-tx-sec">{summary.join(" · ")}</p>
                    )}
                    {error && <p className="mt-0.5 text-[12px] font-semibold text-warning">{error}</p>}
                    {line.notes && (
                      <p className="mt-0.5 truncate text-[12px] italic text-tx-mut">“{line.notes}”</p>
                    )}
                  </div>

                  {/* Stepper: peso (kg) para báscula, cantidad para el resto */}
                  {isWeighed(line.product) ? (
                    <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-bd bg-surf-1 p-1">
                      <button
                        type="button"
                        aria-label="Menos peso"
                        onClick={() =>
                          updateLine(line.key, {
                            weightKg: Math.max(
                              WEIGHT_STEP,
                              Math.round((Number(line.weightKg || 0) - WEIGHT_STEP) * 1000) / 1000,
                            ),
                          })
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-tx-sec active:scale-95"
                      >
                        <Minus size={16} strokeWidth={3} />
                      </button>
                      <span className="w-14 text-center text-[14px] font-bold tabular-nums">
                        {Number(line.weightKg || 0)} kg
                      </span>
                      <button
                        type="button"
                        aria-label="Más peso"
                        onClick={() =>
                          updateLine(line.key, {
                            weightKg:
                              Math.round((Number(line.weightKg || 0) + WEIGHT_STEP) * 1000) / 1000,
                          })
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-iris-soft text-iris-500 active:scale-95"
                      >
                        <Plus size={16} strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-bd bg-surf-1 p-1">
                      <button
                        type="button"
                        aria-label="Restar"
                        onClick={() => updateLine(line.key, { quantity: Math.max(1, line.quantity - 1) })}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-tx-sec active:scale-95"
                      >
                        <Minus size={16} strokeWidth={3} />
                      </button>
                      <span className="w-6 text-center text-[15px] font-bold tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Sumar"
                        onClick={() => updateLine(line.key, { quantity: Math.min(99, line.quantity + 1) })}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-iris-soft text-iris-500 active:scale-95"
                      >
                        <Plus size={16} strokeWidth={3} />
                      </button>
                    </div>
                  )}

                  <div className="w-16 shrink-0 text-right text-[14px] font-bold tabular-nums">
                    ${(unitPrice * lineMultiplier(line)).toFixed(0)}
                  </div>
                </div>

                {/* Acciones de la línea */}
                <div className="flex items-center gap-2 border-t border-bd px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEditingKey(isEditing ? null : line.key)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${
                      isEditing ? "bg-iris-soft text-iris-500" : "text-tx-sec active:bg-surf-3"
                    }`}
                  >
                    <Pencil size={13} strokeWidth={2.5} />
                    {isEditing ? "Listo" : "Editar opciones"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-danger active:bg-surf-3"
                  >
                    <Trash2 size={13} strokeWidth={2.5} />
                    Quitar
                  </button>
                </div>

                {/* Editor en línea (acordeón) */}
                {isEditing && (
                  <div className="space-y-4 border-t border-bd bg-surf-1 p-3">
                    {!variantMultiSelect && variants.length > 0 && (
                      <Section title="Variante" helper="Elige 1">
                        <div className="grid grid-cols-2 gap-2">
                          {variants.map((variant) => (
                            <OptionButton
                              key={variant.id}
                              active={line.variantId === variant.id}
                              label={variant.name}
                              price={Number(variant.price || 0)}
                              radio
                              onClick={() => updateLine(line.key, { variantId: variant.id })}
                            />
                          ))}
                        </div>
                      </Section>
                    )}

                    {groups.map((group) => {
                      const selectedIds = new Set((selections[group.id] || []).map((m) => m.id));
                      const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
                      const max = group.maxSelection || 0;
                      const free = group.freeModifiersLimit || 0;
                      const helper = `${
                        group.multiSelect
                          ? `${min > 0 ? `Min ${min} / ` : ""}${max > 0 ? `Max ${max}` : "Varios"}`
                          : "Elige 1"
                      }${free > 0 ? ` · ${free} sin costo` : ""}`;
                      return (
                        <Section key={group.id} title={formatModifierGroupName(group.name)} helper={helper}>
                          <div className="space-y-2">
                            {group.modifiers.map((modifier) => (
                              <OptionButton
                                key={modifier.id}
                                active={selectedIds.has(modifier.id)}
                                label={modifier.name}
                                price={Number(modifier.priceAdd || 0)}
                                radio={!group.multiSelect}
                                full
                                onClick={() =>
                                  updateLine(line.key, {
                                    modifierIds: toggleId(
                                      line.modifierIds,
                                      group,
                                      modifier,
                                    ),
                                  })
                                }
                              />
                            ))}
                          </div>
                        </Section>
                      );
                    })}

                    <Section title="Nota para cocina · opcional">
                      <textarea
                        value={line.notes}
                        onChange={(e) => updateLine(line.key, { notes: e.target.value.slice(0, 200) })}
                        placeholder="Sin cebolla, término medio, alergia..."
                        rows={2}
                        maxLength={200}
                        className="w-full resize-none rounded-xl border border-bd bg-surf-2 px-3 py-2 text-[13px] font-medium text-tx-pri outline-none placeholder:text-tx-mut focus:border-iris-500"
                      />
                    </Section>
                  </div>
                )}
              </div>
            );
          })}

          {/* No reconocidos */}
          {visibleUnresolved.length > 0 && (
            <div className="rounded-2xl border border-dashed border-bd p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-tx-mut">
                No reconocí · agrégalo a mano si hace falta
              </p>
              <div className="flex flex-wrap gap-2">
                {visibleUnresolved.map((u) => (
                  <span
                    key={u}
                    className="inline-flex items-center gap-1.5 rounded-full border border-bd bg-surf-2 py-1 pl-3 pr-1 text-[12px] font-medium text-tx-sec"
                  >
                    “{u}”
                    <button
                      type="button"
                      aria-label={`Descartar ${u}`}
                      onClick={() =>
                        setDismissedUnresolved((prev) => new Set(prev).add(u))
                      }
                      className="flex h-6 w-6 items-center justify-center rounded-full text-tx-mut active:bg-surf-3"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Buscar producto (para agregar a mano) */}
          {searchOpen ? (
            <div className="rounded-2xl border border-bd bg-surf-2 p-3">
              <div className="flex items-center gap-2 rounded-xl border border-bd bg-surf-1 px-3">
                <Search size={16} className="text-tx-mut" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar producto del menú..."
                  className="h-11 flex-1 bg-transparent text-[14px] font-medium text-tx-pri outline-none placeholder:text-tx-mut"
                />
                <button
                  type="button"
                  aria-label="Cerrar búsqueda"
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                  }}
                  className="text-tx-mut active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>
              {query.trim().length >= 2 && (
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="px-1 py-3 text-center text-[12px] text-tx-mut">Sin resultados</p>
                  ) : (
                    searchResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left active:bg-surf-3"
                      >
                        <span className="min-w-0 truncate text-[14px] font-semibold">{p.name}</span>
                        <span className="shrink-0 text-[13px] font-bold tabular-nums text-tx-sec">
                          ${Number(p.promoPrice ?? p.price ?? 0).toFixed(0)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-bd py-3 text-[13px] font-semibold text-tx-sec active:bg-surf-2"
            >
              <Search size={15} strokeWidth={2.5} />
              Agregar producto a mano
            </button>
          )}
        </div>

        {/* FOOTER */}
        <div className="space-y-2 border-t border-bd p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {totals.pending > 0 && (
            <p className="text-center text-[12px] font-semibold text-warning">
              Resuelve {totals.pending} pendiente{totals.pending === 1 ? "" : "s"} para agregar
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onDictateMore}
              disabled={listening}
              className={`flex h-[52px] shrink-0 items-center gap-2 rounded-2xl border px-4 text-[13px] font-bold ${
                listening
                  ? "border-danger bg-danger-soft text-danger"
                  : "border-bd bg-surf-2 text-tx-sec active:scale-95"
              }`}
            >
              <Mic size={16} strokeWidth={3} className={listening ? "animate-pulse" : ""} />
              {listening ? "Escuchando…" : "Dictar más"}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={totals.pending > 0 || lines.length === 0}
              className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-iris-500 px-4 text-[14px] font-bold uppercase tracking-wide text-iris-fg active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              <Check size={18} strokeWidth={3} />
              Agregar {totals.count > 0 ? `${totals.count} ` : ""}al ticket
              <span className="ml-1 tabular-nums opacity-90">${totals.amount.toFixed(0)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default VoiceDictationReviewSheet;

// Alterna un id dentro del conjunto plano respetando single/multi y maxSelection.
function toggleId(ids: string[], group: ModifierGroup, modifier: Modifier): string[] {
  const set = new Set(ids);
  const groupModIds = group.modifiers.map((m) => m.id);
  const has = set.has(modifier.id);
  if (group.multiSelect) {
    if (has) {
      set.delete(modifier.id);
    } else {
      const count = groupModIds.filter((id) => set.has(id)).length;
      if (group.maxSelection > 0 && count >= group.maxSelection) return ids;
      set.add(modifier.id);
    }
  } else {
    groupModIds.forEach((id) => set.delete(id));
    if (!has) set.add(modifier.id);
    else if (group.required) set.add(modifier.id);
  }
  return [...set];
}

function Section({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-tx-mut">{title}</span>
        {helper && <span className="text-[10px] font-semibold uppercase text-tx-dis">{helper}</span>}
      </div>
      {children}
    </section>
  );
}

function OptionButton({
  active,
  label,
  price,
  radio = false,
  full = false,
  onClick,
}: {
  active: boolean;
  label: string;
  price: number;
  radio?: boolean;
  full?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[48px] items-center gap-2.5 rounded-xl border px-3 text-left active:scale-[0.99] ${
        full ? "w-full" : ""
      } ${active ? "border-iris-500 bg-iris-soft text-iris-500" : "border-bd bg-surf-2 text-tx-sec"}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center ${
          radio ? "rounded-full" : "rounded-md"
        } ${active ? "bg-iris-500 text-iris-fg" : "border border-bd bg-surf-1"}`}
      >
        {active && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{label}</span>
      <span className="shrink-0 text-[12px] font-bold tabular-nums">
        {price > 0 ? `+$${price.toFixed(0)}` : "$0"}
      </span>
    </button>
  );
}
