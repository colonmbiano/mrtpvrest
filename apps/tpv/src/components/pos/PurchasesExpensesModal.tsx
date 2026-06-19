"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Wallet, ShoppingBag, Plus, Trash2, Camera, Loader2, AlertTriangle, CheckCircle2, Sparkles, FileWarning, History, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

// Normaliza un string para fuzzy match: lowercase, sin acentos, sin caracteres
// no alfanuméricos. "Pan Brioche" → "pan brioche", "Habañero" → "habanero".
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Match básico: busca el Ingredient cuyo nombre normalizado contiene
// el nombre escaneado normalizado, o viceversa. Si hay múltiples,
// devuelve el de mayor coincidencia por longitud relativa.
function findBestIngredient(
  scannedName: string,
  ingredients: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const norm = normalize(scannedName);
  if (!norm) return null;
  let best: { id: string; name: string; score: number } | null = null;
  for (const ing of ingredients) {
    const ingNorm = normalize(ing.name);
    if (!ingNorm) continue;
    let score = 0;
    if (ingNorm === norm) score = 100;
    else if (ingNorm.includes(norm) || norm.includes(ingNorm)) {
      // Coincidencia parcial — premia coincidencias largas relativas a la
      // longitud del candidato (evita que "pan" matchee "pantalón" si
      // existiera y prefiere "pan brioche" como match más específico).
      const overlap = Math.min(norm.length, ingNorm.length);
      const maxLen = Math.max(norm.length, ingNorm.length);
      score = Math.round((overlap / maxLen) * 80);
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: ing.id, name: ing.name, score };
    }
  }
  // Umbral mínimo: por debajo de 40% de coincidencia preferimos NO sugerir
  // (mejor que el cajero elija que un mal match silencioso).
  return best && best.score >= 40 ? { id: best.id, name: best.name } : null;
}

// PurchasesExpensesModal · captura desde el TPV de gastos operativos y
// compras de inventario. 2 tabs:
//   · "Gasto"  → /api/expenses     (luz, agua, sueldos, propinas pagadas)
//   · "Compra" → /api/purchases    (compra de ingredientes, afecta stock)
//
// Pago en efectivo (CASH_DRAWER) requiere CashShift abierto — el backend
// valida y devuelve 409 NO_OPEN_SHIFT. El UI muestra el mensaje.

type Tab = "expense" | "purchase" | "history";
type PaymentMethod = "CASH_DRAWER" | "CORPORATE_CARD" | "TRANSFER";

// Item del historial — unifica gasto y compra para mostrar en una lista.
interface HistoryItem {
  id: string;
  kind: "expense" | "purchase";
  occurredAt: string;
  amount: number;
  paymentMethod: PaymentMethod;
  title: string;       // concept (gasto) o "Compra: <supplier>" (compra)
  subtitle: string;    // categoría (gasto) o "N items" (compra)
  icon: string;        // emoji para diferenciar visualmente
  createdBy?: string | null;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH_DRAWER: "Efectivo de caja",
  CORPORATE_CARD: "Tarjeta corporativa",
  TRANSFER: "Transferencia",
};

interface ExpenseCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface Ingredient {
  id: string;
  name: string;
  baseUnit: "GRAM" | "ML" | "PIECE";
  unit: string | null;
  category?: { name: string } | null;
}

interface PurchaseLine {
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  qty: string;       // string para evitar problemas de decimal en input
  unitPrice: string;
  // Si la línea vino de un escaneo IA y no se pudo matchear contra un
  // Ingredient existente, guardamos el nombre original para que el
  // cajero sepa qué item del ticket era.
  scannedName?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PurchasesExpensesModal({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("expense");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH_DRAWER");

  // GASTO
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");

  // COMPRA
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Historial del día ──
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Cargar catálogos cuando abre
  useEffect(() => {
    if (!isOpen) return;
    api.get<ExpenseCategory[]>("/api/expenses/categories").then((r) => setCategories(r.data || [])).catch(() => setCategories([]));
    api.get<Supplier[]>("/api/purchases/lookup/suppliers").then((r) => setSuppliers(r.data || [])).catch(() => setSuppliers([]));
    api.get<Ingredient[]>("/api/purchases/lookup/ingredients").then((r) => setIngredients(r.data || [])).catch(() => setIngredients([]));
  }, [isOpen]);

  // Cargar historial cuando entras al tab "history".
  useEffect(() => {
    if (!isOpen || tab !== "history") return;
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fromIso = today.toISOString();

      const [expRes, purRes] = await Promise.all([
        api.get<any[]>(`/api/expenses?from=${encodeURIComponent(fromIso)}`).catch(() => ({ data: [] })),
        api.get<any[]>(`/api/purchases?from=${encodeURIComponent(fromIso)}`).catch(() => ({ data: [] })),
      ]);

      const expenses: HistoryItem[] = (expRes.data || []).map((e: any) => ({
        id: `e_${e.id}`,
        kind: "expense",
        occurredAt: e.occurredAt || e.createdAt,
        amount: Number(e.amount || 0),
        paymentMethod: e.paymentMethod,
        title: e.concept || "Gasto",
        subtitle: e.category?.name?.replace(/_/g, " ") || "OTROS",
        icon: e.category?.icon || "📝",
        createdBy: e.createdBy?.name || null,
      }));

      const purchases: HistoryItem[] = (purRes.data || []).map((p: any) => {
        const itemsCount = Array.isArray(p.items) ? p.items.length : 0;
        return {
          id: `p_${p.id}`,
          kind: "purchase",
          occurredAt: p.receivedAt || p.createdAt,
          amount: Number(p.totalAmount || 0),
          paymentMethod: p.paymentMethod,
          title: `Compra · ${p.supplier?.name || "Sin proveedor"}`,
          subtitle: `${itemsCount} item${itemsCount === 1 ? "" : "s"} · ${p.poNumber || ""}`,
          icon: "🛒",
          createdBy: p.createdBy?.name || null,
        };
      });

      const merged = [...expenses, ...purchases].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
      setHistory(merged);
    } catch (err: any) {
      toast.error("Error al cargar historial: " + (err?.message || "fallo"));
    } finally {
      setLoadingHistory(false);
    }
  }

  // Reset al cerrar. Render-phase (ver CategoryModal): equivalente al
  // efecto pero sin set-state-in-effect.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setTab("expense");
      setPaymentMethod("CASH_DRAWER");
      setCategoryId("");
      setConcept("");
      setAmount("");
      setSupplierId("");
      setLines([]);
      setNotes("");
    }
  }

  const purchaseTotal = useMemo(() => {
    return lines.reduce((s, l) => {
      const q = parseFloat(l.qty) || 0;
      const p = parseFloat(l.unitPrice) || 0;
      return s + q * p;
    }, 0);
  }, [lines]);

  function addLine() {
    setLines((prev) => [...prev, { ingredientId: "", ingredientName: "", baseUnit: "PIECE", qty: "", unitPrice: "" }]);
  }

  function updateLine(idx: number, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function pickIngredient(idx: number, ingredientId: string) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;
    updateLine(idx, {
      ingredientId: ing.id,
      ingredientName: ing.name,
      baseUnit: ing.baseUnit,
      // Limpiar scannedName cuando el cajero elige manualmente — ya no
      // necesita el hint del nombre original del ticket.
      scannedName: undefined,
    });
  }

  // ── Foto/archivo del ticket → IA → pre-llena líneas ──
  // Reusa el endpoint /api/ai/scan-inventory que ya hace detección de
  // mime-type (foto, PDF, Excel, CSV). Devuelve un array de ingredientes
  // genéricos { name, totalCost, quantityFound } y aquí los mapeamos a
  // Ingredients existentes con fuzzy match básico.
  async function scanReceipt(file: File) {
    if (ingredients.length === 0) {
      toast.error("Aún cargando catálogo de ingredientes, espera un momento.");
      return;
    }
    setScanning(true);
    const toastId = toast.loading("Escaneando ticket con IA…");
    try {
      const fd = new FormData();
      // El endpoint usa upload.array('images', 10) — el field name es 'images'
      // aunque acepta también PDFs/Excel/CSV.
      fd.append("images", file);
      const res = await api.post<{ data: { ingredients: Array<{ name: string; totalCost: number; quantityFound: number }> }; source: string }>(
        "/api/ai/scan-inventory",
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      const scanned = res.data?.data?.ingredients || [];
      if (scanned.length === 0) {
        toast.warning("No se detectaron items en el ticket.", { id: toastId });
        return;
      }

      // Mapear cada item escaneado a un Ingredient existente (o dejarlo
      // sin match para que el cajero lo elija manualmente).
      let matched = 0;
      const newLines: PurchaseLine[] = scanned.map((s) => {
        const match = findBestIngredient(s.name, ingredients);
        const qty = Number(s.quantityFound || 1);
        // totalCost es el TOTAL de la línea; pasamos a precio unitario.
        const unitPrice = qty > 0 ? Number(s.totalCost || 0) / qty : Number(s.totalCost || 0);
        if (match) matched++;
        const matchedIng = match ? ingredients.find((i) => i.id === match.id) : null;
        return {
          ingredientId: match?.id || "",
          ingredientName: match?.name || s.name,
          baseUnit: matchedIng?.baseUnit || "PIECE",
          qty: String(qty || ""),
          unitPrice: String(unitPrice.toFixed(2)),
          scannedName: match ? undefined : s.name,
        };
      });

      // Reemplaza las líneas existentes (no agrega) — la idea es que el
      // cajero escanea UN ticket por vez y revisa.
      setLines(newLines);

      const unmatched = newLines.length - matched;
      if (unmatched === 0) {
        toast.success(`${matched} items reconocidos · revisa precios`, { id: toastId });
      } else {
        toast.warning(
          `${matched} matched · ${unmatched} requieren elegir ingrediente`,
          { id: toastId },
        );
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "fallo al escanear";
      toast.error("Error al escanear: " + msg, { id: toastId });
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function triggerScan() {
    fileInputRef.current?.click();
  }

  function onScanFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) scanReceipt(file);
  }

  async function submitExpense() {
    if (!concept.trim()) return toast.error("Concepto requerido");
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Monto inválido");

    setSubmitting(true);
    try {
      await api.post("/api/expenses", {
        categoryId: categoryId || null,
        concept: concept.trim(),
        amount: amt,
        paymentMethod,
        notes: notes || null,
      });
      toast.success("Gasto registrado");
      onClose();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === "NO_OPEN_SHIFT") {
        toast.error("No hay turno de caja abierto. Abre uno antes de pagar en efectivo.");
      } else if (code === "ADMIN_AUTH_REQUIRED") {
        toast.error("Gasto excede tu límite. Pide PIN de admin.");
      } else {
        toast.error("Error: " + (err?.response?.data?.error || err?.message));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPurchase() {
    if (!supplierId) return toast.error("Selecciona un proveedor");
    if (lines.length === 0) return toast.error("Agrega al menos un ingrediente");
    for (const l of lines) {
      if (!l.ingredientId) return toast.error("Una línea no tiene ingrediente");
      const q = parseFloat(l.qty);
      const p = parseFloat(l.unitPrice);
      if (!Number.isFinite(q) || q <= 0) return toast.error(`Cantidad inválida en ${l.ingredientName}`);
      if (!Number.isFinite(p) || p < 0) return toast.error(`Precio inválido en ${l.ingredientName}`);
    }

    setSubmitting(true);
    try {
      await api.post("/api/purchases", {
        supplierId,
        paymentMethod,
        items: lines.map((l) => ({
          ingredientId: l.ingredientId,
          qty: parseFloat(l.qty),
          unitPrice: parseFloat(l.unitPrice),
        })),
        notes: notes || null,
      });
      toast.success(`Compra registrada · $${purchaseTotal.toFixed(2)}`);
      onClose();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === "NO_OPEN_SHIFT") {
        toast.error("No hay turno de caja abierto.");
      } else if (code === "ADMIN_AUTH_REQUIRED") {
        toast.error("Compra excede tu límite. Pide PIN de admin.");
      } else {
        toast.error("Error: " + (err?.response?.data?.error || err?.message));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-3xl bg-[var(--surface-1)] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--brand-soft)] border border-[var(--brand)] flex items-center justify-center">
              <Wallet size={18} className="text-[var(--brand)]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Compras y gastos</h2>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Captura desde caja</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 pt-4 overflow-x-auto scrollbar-hide">
          {(
            [
              { id: "expense", label: "Gasto", icon: Wallet },
              { id: "purchase", label: "Compra", icon: ShoppingBag },
              { id: "history", label: "Hoy", icon: History },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 h-11 rounded-2xl text-[12px] font-semibold uppercase tracking-[0.15em] transition-all ${
                  isActive
                    ? "bg-[var(--brand)] text-[var(--brand-fg)] shadow-[0_4px_16px_var(--brand-glow)]"
                    : "bg-white/5 border border-white/10 text-white/60"
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">
          {tab === "expense" && (
            <ExpenseTab
              categories={categories}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              concept={concept}
              setConcept={setConcept}
              amount={amount}
              setAmount={setAmount}
              notes={notes}
              setNotes={setNotes}
            />
          )}
          {tab === "purchase" && (
            <PurchaseTab
              suppliers={suppliers}
              supplierId={supplierId}
              setSupplierId={setSupplierId}
              ingredients={ingredients}
              lines={lines}
              addLine={addLine}
              updateLine={updateLine}
              removeLine={removeLine}
              pickIngredient={pickIngredient}
              purchaseTotal={purchaseTotal}
              notes={notes}
              setNotes={setNotes}
              onScanReceipt={triggerScan}
              scanning={scanning}
            />
          )}
          {tab === "history" && (
            <HistoryTab
              items={history}
              loading={loadingHistory}
              onRefresh={loadHistory}
            />
          )}
          {/* Input oculto para foto/archivo del ticket. Soporta imágenes,
              PDF y Excel/CSV — el endpoint scan-inventory detecta el tipo. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.xlsx,.csv"
            onChange={onScanFileChange}
            className="hidden"
          />

          {/* Payment method — solo en tabs de captura, no en historial */}
          {tab !== "history" && (
          <div className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40 mb-2">Método de pago</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((pm) => {
                const isActive = paymentMethod === pm;
                return (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setPaymentMethod(pm)}
                    className={`h-12 rounded-2xl border text-[11px] font-semibold uppercase tracking-[0.1em] transition-all ${
                      isActive
                        ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
                        : "bg-white/5 border-white/10 text-white/60"
                    }`}
                  >
                    {PAYMENT_LABELS[pm]}
                  </button>
                );
              })}
            </div>
            {paymentMethod === "CASH_DRAWER" && (
              <p className="mt-2 text-[10px] text-[var(--warning)] flex items-center gap-1.5">
                <AlertTriangle size={12} />
                Se descontará del turno de caja abierto. Requiere turno activo.
              </p>
            )}
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-2xl bg-white/5 border border-white/10 text-white/60 text-[11px] font-semibold uppercase tracking-[0.15em] active:scale-95"
          >
            Cerrar
          </button>
          {tab !== "history" && (
            <button
              type="button"
              onClick={tab === "expense" ? submitExpense : submitPurchase}
              disabled={submitting}
              className="flex-1 sm:flex-none h-11 px-6 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] text-[12px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-[0_4px_20px_var(--brand-glow)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  {tab === "expense" ? "Registrar gasto" : `Registrar compra · $${purchaseTotal.toFixed(2)}`}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ──

function ExpenseTab(props: {
  categories: ExpenseCategory[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  concept: string;
  setConcept: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40 block mb-2">
          Categoría
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {props.categories.map((c) => {
            const isActive = props.categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => props.setCategoryId(isActive ? "" : c.id)}
                className={`h-16 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive
                    ? "bg-[var(--brand-soft)] border-[var(--brand)]"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <span className="text-xl">{c.icon || "📝"}</span>
                <span
                  className={`text-[9px] font-semibold uppercase tracking-wider ${
                    isActive ? "text-[var(--brand)]" : "text-white/60"
                  }`}
                >
                  {c.name.replace(/_/g, " ")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Concepto">
        <input
          type="text"
          value={props.concept}
          onChange={(e) => props.setConcept(e.target.value)}
          placeholder="Ej. Pago CFE bimestre de mayo"
          className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white outline-none focus:border-[var(--brand)]"
        />
      </Field>

      <Field label="Monto">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand)] font-semibold">$</span>
          <input
            type="number"
            inputMode="decimal"
            value={props.amount}
            onChange={(e) => props.setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 text-sm text-white outline-none focus:border-[var(--brand)] tabular-nums"
          />
        </div>
      </Field>

      <Field label="Notas (opcional)">
        <textarea
          value={props.notes}
          onChange={(e) => props.setNotes(e.target.value)}
          placeholder="Folio del recibo, nombre del proveedor, etc."
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[var(--brand)] resize-none"
        />
      </Field>
    </div>
  );
}

function PurchaseTab(props: {
  suppliers: Supplier[];
  supplierId: string;
  setSupplierId: (v: string) => void;
  ingredients: Ingredient[];
  lines: PurchaseLine[];
  addLine: () => void;
  updateLine: (idx: number, patch: Partial<PurchaseLine>) => void;
  removeLine: (idx: number) => void;
  pickIngredient: (idx: number, id: string) => void;
  purchaseTotal: number;
  notes: string;
  setNotes: (v: string) => void;
  onScanReceipt: () => void;
  scanning: boolean;
}) {
  return (
    <div className="space-y-5">
      <Field label="Proveedor">
        <select
          value={props.supplierId}
          onChange={(e) => props.setSupplierId(e.target.value)}
          className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white outline-none focus:border-[var(--brand)]"
        >
          <option value="">Selecciona proveedor…</option>
          {props.suppliers.map((s) => (
            <option key={s.id} value={s.id} className="bg-[var(--surface-1)]">
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
            Productos comprados
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={props.onScanReceipt}
              disabled={props.scanning}
              className="h-8 px-3 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-semibold uppercase tracking-[0.1em] flex items-center gap-1 active:scale-95 disabled:opacity-50"
            >
              {props.scanning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {props.scanning ? "Escaneando…" : "Escanear ticket"}
            </button>
            <button
              type="button"
              onClick={props.addLine}
              className="h-8 px-3 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] text-[10px] font-semibold uppercase tracking-[0.1em] flex items-center gap-1 active:scale-95"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
        </div>

        {props.lines.length === 0 ? (
          <div className="rounded-2xl bg-white/5 border border-dashed border-white/10 p-6 text-center space-y-2">
            <Camera size={28} className="text-white/30 mx-auto" />
            <p className="text-[12px] text-white/40">
              Toca <strong className="text-violet-300">&quot;Escanear ticket&quot;</strong> para llenar la lista con IA,
              o <strong className="text-[var(--brand)]">&quot;Agregar&quot;</strong> para meterlos a mano.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {props.lines.map((line, idx) => {
              const needsMatch = !line.ingredientId && line.scannedName;
              return (
              <div
                key={idx}
                className={`grid grid-cols-12 gap-2 items-center rounded-xl p-2 border ${
                  needsMatch
                    ? "bg-[var(--warning-soft)] border-[var(--warning)]"
                    : "bg-white/5 border-white/10"
                }`}
              >
                {needsMatch && (
                  <div className="col-span-12 flex items-center gap-2 text-[10px] font-bold text-[var(--warning)] pb-1 pl-1">
                    <FileWarning size={12} />
                    <span>IA detectó &quot;{line.scannedName}&quot; — elige el ingrediente correcto:</span>
                  </div>
                )}
                <select
                  value={line.ingredientId}
                  onChange={(e) => props.pickIngredient(idx, e.target.value)}
                  className={`col-span-12 sm:col-span-5 h-10 bg-white/5 border rounded-lg px-3 text-xs text-white outline-none ${
                    needsMatch ? "border-[var(--warning)]" : "border-white/10"
                  }`}
                >
                  <option value="">Ingrediente…</option>
                  {props.ingredients.map((i) => (
                    <option key={i.id} value={i.id} className="bg-[var(--surface-1)]">
                      {i.name} ({i.baseUnit.toLowerCase()})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Qty"
                  value={line.qty}
                  onChange={(e) => props.updateLine(idx, { qty: e.target.value })}
                  className="col-span-4 sm:col-span-2 h-10 bg-white/5 border border-white/10 rounded-lg px-3 text-xs text-white outline-none tabular-nums"
                />
                <span className="col-span-2 sm:col-span-1 text-[10px] text-white/40 text-center">
                  {line.baseUnit.toLowerCase()}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Precio/u"
                  value={line.unitPrice}
                  onChange={(e) => props.updateLine(idx, { unitPrice: e.target.value })}
                  className="col-span-4 sm:col-span-3 h-10 bg-white/5 border border-white/10 rounded-lg px-3 text-xs text-white outline-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => props.removeLine(idx)}
                  className="col-span-2 sm:col-span-1 h-10 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center active:scale-95"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Total</span>
        <span className="text-2xl font-black tabular-nums text-[var(--brand)]">${props.purchaseTotal.toFixed(2)}</span>
      </div>

      <Field label="Notas (opcional)">
        <textarea
          value={props.notes}
          onChange={(e) => props.setNotes(e.target.value)}
          placeholder="Folio de la factura, observaciones de calidad, etc."
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[var(--brand)] resize-none"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40 block mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── HistoryTab · gastos y compras de hoy ─────────────────────────────────
function HistoryTab({
  items,
  loading,
  onRefresh,
}: {
  items: HistoryItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  // Totales: agrupados por método de pago para que el cajero vea el
  // impacto del día en caja (CASH_DRAWER es lo que sale de su gaveta).
  const totals = useMemo(() => {
    const byMethod: Record<PaymentMethod, number> = {
      CASH_DRAWER: 0, CORPORATE_CARD: 0, TRANSFER: 0,
    };
    let totalAll = 0;
    for (const i of items) {
      byMethod[i.paymentMethod] += i.amount;
      totalAll += i.amount;
    }
    return { byMethod, totalAll };
  }, [items]);

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="Total" amount={totals.totalAll} color="white" />
        <SummaryCard label="Efectivo" amount={totals.byMethod.CASH_DRAWER} color="amber" />
        <SummaryCard label="Tarjeta" amount={totals.byMethod.CORPORATE_CARD} color="violet" />
        <SummaryCard label="Transfer" amount={totals.byMethod.TRANSFER} color="cyan" />
      </div>

      {/* Lista */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
          Movimientos de hoy ({items.length})
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="h-8 px-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-semibold uppercase tracking-[0.1em] flex items-center gap-1 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refrescar
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-dashed border-white/10 p-8 text-center space-y-2">
          <History size={28} className="text-white/30 mx-auto" />
          <p className="text-[12px] text-white/40">Sin movimientos registrados hoy.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                  item.kind === "purchase"
                    ? "bg-violet-500/10 border border-violet-500/20"
                    : "bg-amber-500/10 border border-amber-500/20"
                }`}
              >
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{item.title}</p>
                <p className="text-[10px] text-white/40 truncate">
                  {item.subtitle}
                  {item.createdBy && <> · por {item.createdBy}</>}
                  <> · {fmtTime(item.occurredAt)}</>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-black tabular-nums text-white">
                  ${item.amount.toFixed(2)}
                </p>
                <p
                  className={`text-[9px] font-semibold uppercase tracking-wider ${
                    item.paymentMethod === "CASH_DRAWER"
                      ? "text-amber-400"
                      : item.paymentMethod === "CORPORATE_CARD"
                      ? "text-violet-400"
                      : "text-cyan-400"
                  }`}
                >
                  {item.paymentMethod === "CASH_DRAWER"
                    ? "Efectivo"
                    : item.paymentMethod === "CORPORATE_CARD"
                    ? "Tarjeta"
                    : "Transfer"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  amount,
  color,
}: {
  label: string;
  amount: number;
  color: "white" | "amber" | "violet" | "cyan";
}) {
  const tone = {
    white: "border-white/10 text-white",
    amber: "border-amber-500/30 text-amber-400 bg-amber-500/5",
    violet: "border-violet-500/30 text-violet-400 bg-violet-500/5",
    cyan: "border-cyan-500/30 text-cyan-400 bg-cyan-500/5",
  }[color];
  return (
    <div className={`p-3 rounded-xl border ${tone}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="text-lg font-black tabular-nums mt-0.5">${amount.toFixed(2)}</p>
    </div>
  );
}
