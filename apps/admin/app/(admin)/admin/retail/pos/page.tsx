"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Barcode,
  Banknote,
  Check,
  Coins,
  CreditCard,
  Lock,
  Minus,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Shirt,
  ShoppingCart,
  Store,
  Trash2,
  Unlock,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { money } from "@/components/warmtech";

type Location = {
  id: string;
  name: string;
  isCentralWarehouse?: boolean;
};

type RetailProduct = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  skus: RetailSku[];
};

type RetailSku = {
  id: string;
  sku: string;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  price: number;
  cost: number;
  isActive: boolean;
  stockBalances?: Array<{ qty: number; minQty: number }>;
};

type PosSku = RetailSku & {
  product: RetailProduct;
  stockQty: number;
  minQty: number;
};

type CartLine = {
  sku: PosSku;
  quantity: number;
};

type RetailMovement = {
  id: string;
  type: "CASH_IN" | "CASH_OUT" | "EXPENSE";
  amount: number;
  reason?: string | null;
};

type RetailShift = {
  id: string;
  status: "OPEN" | "CLOSED";
  openingFloat: number;
  openedByName?: string | null;
  countedCash?: number | null;
  expectedCash?: number | null;
  difference?: number | null;
  totalCashSales?: number | null;
  totalCardSales?: number | null;
  totalTransferSales?: number | null;
  totalCashIn?: number | null;
  totalCashOut?: number | null;
  salesCount?: number | null;
  blindClose?: boolean;
  blindHidden?: boolean;
  movements?: RetailMovement[];
};

type MovementType = "CASH_IN" | "CASH_OUT" | "EXPENSE";

type PaymentMethod = "CASH" | "CARD_PRESENT" | "TRANSFER";

const paymentOptions: Array<{ value: PaymentMethod; label: string; icon: LucideIcon }> = [
  { value: "CASH", label: "Efectivo", icon: Banknote },
  { value: "CARD_PRESENT", label: "Tarjeta", icon: CreditCard },
  { value: "TRANSFER", label: "Transferencia", icon: Send },
];

function variantLabel(sku: RetailSku) {
  return [sku.size, sku.color, sku.material].filter(Boolean).join(" / ") || "Variante única";
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const maybe = error as { response?: { data?: { error?: string } } };
    if (maybe.response?.data?.error) return maybe.response.data.error;
  }
  if (error instanceof Error) return error.message;
  return "No se pudo completar la accion";
}

function saleId() {
  const random = Math.random().toString(36).slice(2, 9);
  return `admin-retail-pos-${Date.now()}-${random}`;
}

export default function RetailPosPage() {
  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const [activeLocationId, setActiveLocationId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("locationId") || "" : "",
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cashReceived, setCashReceived] = useState("");
  const [reference, setReference] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSale, setLastSale] = useState<{ folio: string; total: number } | null>(null);

  // Caja / turno retail
  const [shift, setShift] = useState<RetailShift | null>(null);
  const [modal, setModal] = useState<null | "open" | "close" | "movement">(null);
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [moveType, setMoveType] = useState<MovementType>("CASH_IN");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [shiftBusy, setShiftBusy] = useState(false);
  const [closeResult, setCloseResult] = useState<RetailShift | null>(null);

  const load = useCallback(async (locationId = activeLocationId) => {
    setLoading(true);
    setError("");
    try {
      const locationParam = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
      const [locationRes, catalogRes] = await Promise.all([
        api.get<Location[]>("/api/admin/locations"),
        api.get<{ products: RetailProduct[] }>(`/api/retail/v1/catalog${locationParam}`),
      ]);
      const locationRows = Array.isArray(locationRes.data) ? locationRes.data : [];
      setLocations(locationRows);
      setProducts(catalogRes.data.products || []);

      if (!locationId && locationRows[0]?.id) {
        localStorage.setItem("locationId", locationRows[0].id);
        setActiveLocationId(locationRows[0].id);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeLocationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  const loadShift = useCallback(async (locationId: string) => {
    if (!locationId) { setShift(null); return; }
    try {
      const { data } = await api.get<{ shift: RetailShift | null }>(
        `/api/retail/v1/shifts/active?locationId=${encodeURIComponent(locationId)}`,
      );
      setShift(data.shift);
    } catch {
      // La caja es opcional: si el endpoint falla, no rompemos el POS.
    }
  }, []);

  useEffect(() => {
    loadShift(activeLocationId);
  }, [activeLocationId, loadShift]);

  async function openShift() {
    if (!activeLocationId || shiftBusy) return;
    setShiftBusy(true);
    setError("");
    try {
      const { data } = await api.post<RetailShift>("/api/retail/v1/shifts/open", {
        locationId: activeLocationId,
        openingFloat: Number(openingFloat || 0),
      });
      setShift(data);
      setCloseResult(null);
      setModal(null);
      setOpeningFloat("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setShiftBusy(false);
    }
  }

  async function closeShift() {
    if (!shift || shiftBusy) return;
    setShiftBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ shift: RetailShift }>(`/api/retail/v1/shifts/${shift.id}/close`, {
        countedCash: Number(countedCash || 0),
        notes: shiftNotes || undefined,
      });
      setCloseResult(data.shift);
      setShift(null);
      setModal(null);
      setCountedCash("");
      setShiftNotes("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setShiftBusy(false);
    }
  }

  async function addMovement() {
    if (!shift || shiftBusy) return;
    setShiftBusy(true);
    setError("");
    try {
      await api.post(`/api/retail/v1/shifts/${shift.id}/cash-movement`, {
        type: moveType,
        amount: Number(moveAmount || 0),
        reason: moveReason || undefined,
      });
      await loadShift(activeLocationId);
      setModal(null);
      setMoveAmount("");
      setMoveReason("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setShiftBusy(false);
    }
  }

  function selectLocation(nextLocationId: string) {
    localStorage.setItem("locationId", nextLocationId);
    setActiveLocationId(nextLocationId);
    window.dispatchEvent(new Event("locationChanged"));
    setCart([]);
  }

  const selectedLocation = locations.find((location) => location.id === activeLocationId);

  const skus = useMemo<PosSku[]>(() => {
    return products.flatMap((product) =>
      product.skus.map((sku) => {
        const balance = sku.stockBalances?.[0];
        return {
          ...sku,
          product,
          stockQty: Number(balance?.qty || 0),
          minQty: Number(balance?.minQty || 0),
        };
      }),
    );
  }, [products]);

  const q = query.trim().toLowerCase();
  const filteredSkus = useMemo(() => {
    return skus
      .filter((sku) => {
        if (!q) return true;
        return [sku.sku, sku.barcode, sku.product.name, sku.product.category, sku.size, sku.color]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 80);
  }, [q, skus]);

  const subtotal = cart.reduce((sum, line) => sum + Number(line.sku.price) * line.quantity, 0);
  const discountValue = Math.max(0, Number(discount || 0));
  const total = Math.max(0, Number((subtotal - discountValue).toFixed(2)));
  const cashValue = Number(cashReceived || 0);
  const change = paymentMethod === "CASH" ? Math.max(0, cashValue - total) : 0;

  function addSku(sku: PosSku) {
    setLastSale(null);
    setCart((current) => {
      const existing = current.find((line) => line.sku.id === sku.id);
      const currentQty = existing?.quantity || 0;
      if (sku.stockQty <= currentQty) return current;
      if (existing) {
        return current.map((line) => line.sku.id === sku.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [{ sku, quantity: 1 }, ...current];
    });
    barcodeRef.current?.focus();
  }

  function setQty(skuId: string, nextQty: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.sku.id !== skuId) return [line];
      if (nextQty <= 0) return [];
      return [{ ...line, quantity: Math.min(nextQty, line.sku.stockQty) }];
    }));
  }

  function scanBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = barcode.trim().toLowerCase();
    if (!code) return;
    const match = skus.find((sku) => sku.barcode?.toLowerCase() === code || sku.sku.toLowerCase() === code)
      || skus.find((sku) => sku.barcode?.toLowerCase().includes(code) || sku.sku.toLowerCase().includes(code));
    if (match) {
      addSku(match);
      setBarcode("");
      setQuery("");
    } else {
      setQuery(barcode);
      setError(`No encontré SKU para ${barcode}`);
    }
  }

  async function checkout() {
    if (!activeLocationId || cart.length === 0 || total <= 0) return;
    if (!shift) {
      setError("Abre la caja antes de cobrar para que el corte cuadre");
      setModal("open");
      return;
    }
    if (paymentMethod === "CASH" && cashValue > 0 && cashValue < total) {
      setError("El efectivo recibido no cubre el total");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/api/retail/v1/sales", {
        locationId: activeLocationId,
        clientSaleId: saleId(),
        device: {
          deviceKey: `admin-retail-pos-${activeLocationId}`,
          name: "Caja Retail Admin",
          platform: "WEB",
        },
        discount: discountValue,
        notes: notes || undefined,
        lines: cart.map((line) => ({
          skuId: line.sku.id,
          quantity: line.quantity,
          unitPrice: Number(line.sku.price),
          discount: 0,
        })),
        payments: [{
          method: paymentMethod,
          amount: total,
          reference: reference || undefined,
        }],
      });
      setLastSale({ folio: data.sale?.folio || "Venta retail", total });
      setCart([]);
      setDiscount("");
      setCashReceived("");
      setReference("");
      setNotes("");
      await load(activeLocationId);
      barcodeRef.current?.focus();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-[18px] pb-28 pt-3 md:px-8 md:pb-12 md:pt-6">
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/admin/retail" className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-2xl border border-bd-1 bg-surf-2 px-3 text-xs font-bold text-tx-mut hover:text-tx">
            <ArrowLeft size={15} /> Retail SKU
          </Link>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Caja retail</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-tx-hi md:text-4xl">Venta por SKU</h1>
          <p className="mt-2 text-sm font-medium text-tx-mut">
            {selectedLocation?.name || "Sucursal"} / escanea, cobra y descuenta inventario exacto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[220px]">
            <span className="sr-only">Sucursal</span>
            <select className="retail-pos-input" value={activeLocationId} onChange={(event) => selectLocation(event.target.value)}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.isCentralWarehouse ? "Bodega / " : ""}{location.name}
                </option>
              ))}
            </select>
          </label>
          <TpvButton icon={RefreshCw} ghost onClick={load} disabled={loading}>Actualizar</TpvButton>
        </div>
      </header>

      {lastSale && (
        <div className="mb-3 rounded-3xl border border-ok bg-ok-soft p-4 text-sm font-bold text-ok">
          Venta {lastSale.folio} cobrada por {money(lastSale.total)}.
        </div>
      )}

      <div className="mb-3">
        {shift ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-ok bg-ok-soft p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ok/15 text-ok"><Wallet size={18} /></span>
              <div>
                <div className="text-sm font-black text-ok">Caja abierta</div>
                <div className="text-[11px] font-semibold text-tx-mut">
                  Base {money(Number(shift.openingFloat))}{shift.openedByName ? ` / ${shift.openedByName}` : ""}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TpvButton icon={Coins} ghost onClick={() => setModal("movement")}>Movimiento</TpvButton>
              <TpvButton icon={Lock} ghost onClick={() => setModal("close")}>Cerrar caja</TpvButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-warn bg-warn-soft p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-warn/15 text-warn"><Lock size={18} /></span>
              <div>
                <div className="text-sm font-black text-warn">Caja cerrada</div>
                <div className="text-[11px] font-semibold text-tx-mut">Abre la caja para registrar ventas y cuadrar el corte.</div>
              </div>
            </div>
            <TpvButton icon={Unlock} onClick={() => setModal("open")}>Abrir caja</TpvButton>
          </div>
        )}
      </div>

      {closeResult && (
        <div className="mb-3 rounded-3xl border border-bd-1 bg-surf-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-black text-tx-hi">Corte de caja</span>
            <button type="button" onClick={() => setCloseResult(null)} className="grid h-8 w-8 place-items-center rounded-xl bg-black/10"><X size={15} /></button>
          </div>
          {closeResult.blindHidden ? (
            <p className="text-xs font-semibold text-tx-mut">Corte ciego registrado. El supervisor consulta el esperado y la diferencia en el reporte.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Ventas efectivo" value={money(Number(closeResult.totalCashSales || 0))} />
              <Stat label="Esperado" value={money(Number(closeResult.expectedCash || 0))} />
              <Stat label="Contado" value={money(Number(closeResult.countedCash || 0))} />
              <Stat label="Diferencia" value={money(Number(closeResult.difference || 0))} tone={Number(closeResult.difference || 0) === 0 ? "ok" : "warn"} />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-3xl border border-err bg-err-soft p-4 text-sm font-bold text-err">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="grid h-9 w-9 place-items-center rounded-xl bg-black/10">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-3">
          <TpvCard className="p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,.55fr)_minmax(280px,.45fr)]">
              <form onSubmit={scanBarcode} className="flex min-h-14 items-center gap-3 rounded-2xl border border-bd-1 bg-surf-2 px-4">
                <Barcode size={20} className="text-primary" />
                <input
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder="Escanea código de barras o SKU"
                  className="min-w-0 flex-1 bg-transparent text-base font-bold text-tx outline-none placeholder:text-tx-dim"
                />
                <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-xs font-black text-[#0b1410] active:scale-95">
                  Agregar
                </button>
              </form>
              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-bd-1 bg-surf-2 px-4">
                <Search size={19} className="text-tx-dim" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar producto, talla, color..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-tx outline-none placeholder:text-tx-dim"
                />
              </label>
            </div>
          </TpvCard>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
            {loading && skus.length === 0
              ? Array.from({ length: 12 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-3xl border border-bd-1 bg-surf-2" />)
              : filteredSkus.map((sku) => <SkuTile key={sku.id} sku={sku} onAdd={() => addSku(sku)} />)}
          </div>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <TpvCard className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-bd-1 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <ShoppingCart size={20} />
                </span>
                <div>
                  <div className="text-base font-black text-tx-hi">Ticket actual</div>
                  <div className="text-[11px] font-semibold text-tx-mut">{cart.length} SKU en carrito</div>
                </div>
              </div>
              {cart.length > 0 && (
                <button type="button" onClick={() => setCart([])} className="grid h-10 w-10 place-items-center rounded-xl bg-err-soft text-err">
                  <Trash2 size={17} />
                </button>
              )}
            </div>

            <div className="max-h-[43vh] min-h-[220px] overflow-y-auto p-3">
              {cart.length === 0 ? (
                <div className="grid min-h-[210px] place-items-center rounded-3xl border border-dashed border-bd-2 text-center">
                  <div>
                    <ReceiptText className="mx-auto text-tx-dim" size={32} />
                    <div className="mt-3 text-sm font-black text-tx-hi">Sin productos</div>
                    <p className="mt-1 max-w-[260px] text-xs text-tx-mut">Escanea un código o toca un SKU para iniciar la venta.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((line) => (
                    <CartItem
                      key={line.sku.id}
                      line={line}
                      onDec={() => setQty(line.sku.id, line.quantity - 1)}
                      onInc={() => setQty(line.sku.id, line.quantity + 1)}
                      onRemove={() => setQty(line.sku.id, 0)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-bd-1 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Descuento">
                  <input className="retail-pos-input" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0" />
                </Field>
                <Field label={paymentMethod === "CASH" ? "Recibido" : "Referencia"}>
                  {paymentMethod === "CASH" ? (
                    <input className="retail-pos-input" type="number" min="0" step="0.01" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder={String(total)} />
                  ) : (
                    <input className="retail-pos-input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Opcional" />
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {paymentOptions.map(({ value, label, icon: Icon }) => {
                  const active = paymentMethod === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentMethod(value)}
                      className={`min-h-14 rounded-2xl border px-2 text-xs font-black transition-all active:scale-95 ${
                        active ? "border-primary bg-primary/15 text-primary" : "border-bd-1 bg-surf-2 text-tx-mut"
                      }`}
                    >
                      <Icon className="mx-auto mb-1" size={18} />
                      {label}
                    </button>
                  );
                })}
              </div>

              <Field label="Nota">
                <input className="retail-pos-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
              </Field>

              <div className="rounded-3xl bg-surf-2 p-4">
                <Row label="Subtotal" value={money(subtotal)} />
                <Row label="Descuento" value={`-${money(discountValue)}`} />
                <div className="my-3 h-px bg-bd-1" />
                <div className="flex items-end justify-between gap-4">
                  <span className="text-sm font-bold text-tx-mut">Total</span>
                  <span className="font-mono text-3xl font-black text-tx-hi">{money(total)}</span>
                </div>
                {paymentMethod === "CASH" && cashValue > 0 && (
                  <div className="mt-2 text-right text-xs font-bold text-ok">Cambio {money(change)}</div>
                )}
              </div>

              <TpvButton icon={Check} onClick={checkout} disabled={saving || cart.length === 0 || total <= 0}>
                {saving ? "Cobrando..." : "Cobrar venta"}
              </TpvButton>
            </div>
          </TpvCard>
        </aside>
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-3xl border border-bd-1 bg-surf-1 p-5 shadow-[0_30px_80px_rgba(0,0,0,.5)]" onClick={(event) => event.stopPropagation()}>
            {modal === "open" && (
              <>
                <h3 className="text-lg font-black text-tx-hi">Abrir caja</h3>
                <p className="mt-1 text-xs text-tx-mut">Fondo inicial de efectivo en la gaveta.</p>
                <div className="mt-4">
                  <Field label="Fondo inicial">
                    <input className="retail-pos-input" type="number" min="0" step="0.01" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} placeholder="0" autoFocus />
                  </Field>
                </div>
                <ModalActions onCancel={() => setModal(null)} onConfirm={openShift} confirmLabel="Abrir" busy={shiftBusy} />
              </>
            )}
            {modal === "movement" && (
              <>
                <h3 className="text-lg font-black text-tx-hi">Movimiento de efectivo</h3>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {([["CASH_IN", "Entrada"], ["CASH_OUT", "Salida"], ["EXPENSE", "Gasto"]] as Array<[MovementType, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMoveType(value)}
                      className={`min-h-12 rounded-2xl border px-2 text-xs font-black transition-all active:scale-95 ${moveType === value ? "border-primary bg-primary/15 text-primary" : "border-bd-1 bg-surf-2 text-tx-mut"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-3">
                  <Field label="Monto">
                    <input className="retail-pos-input" type="number" min="0" step="0.01" value={moveAmount} onChange={(event) => setMoveAmount(event.target.value)} placeholder="0" autoFocus />
                  </Field>
                  <Field label="Motivo">
                    <input className="retail-pos-input" value={moveReason} onChange={(event) => setMoveReason(event.target.value)} placeholder="Opcional" />
                  </Field>
                </div>
                <ModalActions onCancel={() => setModal(null)} onConfirm={addMovement} confirmLabel="Registrar" busy={shiftBusy} />
              </>
            )}
            {modal === "close" && (
              <>
                <h3 className="text-lg font-black text-tx-hi">Cerrar caja</h3>
                <p className="mt-1 text-xs text-tx-mut">
                  {shift?.blindClose ? "Corte ciego: declara tu conteo, el sistema calcula la diferencia." : "Declara el efectivo contado en la gaveta."}
                </p>
                <div className="mt-4 grid gap-3">
                  <Field label="Efectivo contado">
                    <input className="retail-pos-input" type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} placeholder="0" autoFocus />
                  </Field>
                  <Field label="Nota">
                    <input className="retail-pos-input" value={shiftNotes} onChange={(event) => setShiftNotes(event.target.value)} placeholder="Opcional" />
                  </Field>
                </div>
                <ModalActions onCancel={() => setModal(null)} onConfirm={closeShift} confirmLabel="Cerrar caja" busy={shiftBusy} />
              </>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .retail-pos-input {
          width: 100%;
          min-height: 46px;
          border-radius: 14px;
          border: 1px solid var(--bd-1);
          background: var(--surf-2);
          color: var(--tx);
          outline: none;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 700;
        }
        .retail-pos-input:focus {
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 3px var(--iris-soft);
        }
        .retail-pos-input::placeholder { color: var(--tx-dim); }
        .retail-pos-input option {
          background: var(--surf-1);
          color: var(--tx);
        }
      `}</style>
    </main>
  );
}

function SkuTile({ sku, onAdd }: { sku: PosSku; onAdd: () => void }) {
  const low = sku.minQty > 0 && sku.stockQty <= sku.minQty;
  const empty = sku.stockQty <= 0;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={empty}
      className="group min-h-[150px] rounded-3xl border border-bd-1 bg-white/[0.035] p-3 text-left shadow-[0_16px_40px_rgba(0,0,0,.22)] backdrop-blur-md transition-all active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 hover:border-primary/50"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Shirt size={20} />
        </span>
        <span className={`rounded-full px-2 py-1 font-mono text-[9px] font-bold ${empty ? "bg-err-soft text-err" : low ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
          {empty ? "SIN STOCK" : `${sku.stockQty} PZA`}
        </span>
      </div>
      <div className="mt-4 line-clamp-2 text-sm font-black leading-tight text-tx-hi">{sku.product.name}</div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-tx-mut">
        <span className="rounded-lg bg-surf-2 px-2 py-1">{variantLabel(sku)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-[10px] text-primary">{sku.barcode || sku.sku}</span>
        <span className="font-mono text-sm font-black text-tx-hi">{money(sku.price)}</span>
      </div>
    </button>
  );
}

function CartItem({ line, onInc, onDec, onRemove }: { line: CartLine; onInc: () => void; onDec: () => void; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-bd-1 bg-surf-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-tx-hi">{line.sku.product.name}</div>
          <div className="mt-1 text-[11px] text-tx-mut">{variantLabel(line.sku)}</div>
          <div className="mt-1 font-mono text-[10px] text-primary">{line.sku.sku}</div>
        </div>
        <button type="button" onClick={onRemove} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-err-soft text-err">
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center overflow-hidden rounded-2xl border border-bd-1 bg-surf-1">
          <button type="button" onClick={onDec} className="grid h-10 w-10 place-items-center text-tx-mut"><Minus size={15} /></button>
          <span className="grid h-10 min-w-10 place-items-center font-mono text-sm font-black text-tx-hi">{line.quantity}</span>
          <button type="button" onClick={onInc} className="grid h-10 w-10 place-items-center text-primary"><Plus size={15} /></button>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-black text-tx-hi">{money(Number(line.sku.price) * line.quantity)}</div>
          <div className="text-[10px] text-tx-mut">{money(line.sku.price)} c/u</div>
        </div>
      </div>
    </div>
  );
}

function TpvCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-bd-1 bg-white/[0.045] shadow-[0_24px_60px_rgba(0,0,0,.28)] backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

function TpvButton({
  children,
  icon: Icon,
  onClick,
  ghost = false,
  disabled = false,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  ghost?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition-all active:scale-95 disabled:opacity-45 ${
        ghost ? "border border-bd-1 bg-surf-2 text-tx hover:bg-surf-3" : "bg-primary text-[#0b1410] shadow-[0_10px_30px_var(--iris-glow)]"
      }`}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 ml-1 block font-mono text-[9px] font-semibold uppercase tracking-[.14em] text-tx-mut">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
      <span className="font-semibold text-tx-mut">{label}</span>
      <span className="font-mono font-black text-tx-hi">{value}</span>
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, busy }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; busy: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <TpvButton ghost onClick={onCancel} disabled={busy}>Cancelar</TpvButton>
      <TpvButton icon={Check} onClick={onConfirm} disabled={busy}>{busy ? "..." : confirmLabel}</TpvButton>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-tx-hi";
  return (
    <div className="rounded-2xl bg-surf-1 p-3">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[.14em] text-tx-mut">{label}</div>
      <div className={`mt-1 font-mono text-base font-black ${color}`}>{value}</div>
    </div>
  );
}
