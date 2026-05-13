"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SetupGuard } from "@/components/SetupGuard";
import { IdleGuard } from "@/components/IdleGuard";
import { Numpad } from "@/components/Numpad";
import { TerminalChargeModal, ChargeResult } from "@/components/TerminalChargeModal";
import { IconPlus, IconMinus, IconTrash, IconCash, IconCard } from "@/components/Icon";
import { useCart } from "@/lib/cart";
import { fmt } from "@/lib/format";
import api from "@/lib/api";

export default function CheckoutPage() {
  return <SetupGuard><Inner /></SetupGuard>;
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderType = (params.get("t") === "takeout" ? "TAKEOUT" : "DINE_IN") as "TAKEOUT" | "DINE_IN";

  const { items, total, qty, dispatch } = useCart();

  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [terminalCharge, setTerminalCharge] = useState<{ amount: number; terminalId: string; orderId: string; orderNumber: string } | null>(null);
  // Notes inline por item — clave del item cuya nota está visible/editándose
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);
  // Propina: porcentaje seleccionado (0 = sin propina) o monto custom
  const [tipPercent, setTipPercent] = useState<0 | 5 | 10 | 15 | -1>(0); // -1 = custom
  const [tipCustom, setTipCustom] = useState<string>("");
  // Cupón
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Loyalty
  const [loyaltyInput, setLoyaltyInput] = useState("");
  const [loyaltyApplied, setLoyaltyApplied] = useState<{ qrCode: string; userName: string; points: number } | null>(null);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [validatingLoyalty, setValidatingLoyalty] = useState(false);

  async function applyLoyalty() {
    if (!loyaltyInput.trim()) return;
    setValidatingLoyalty(true);
    setLoyaltyError(null);
    try {
      const { data } = await api.post("/api/store/loyalty/lookup", {
        qrCode: loyaltyInput.trim(),
      });
      setLoyaltyApplied({ qrCode: loyaltyInput.trim(), userName: data.userName, points: data.points });
      setLoyaltyInput("");
    } catch (err: any) {
      setLoyaltyError(err?.response?.data?.error || "Cliente no encontrado");
      setLoyaltyApplied(null);
    } finally {
      setValidatingLoyalty(false);
    }
  }

  function removeLoyalty() {
    setLoyaltyApplied(null);
    setLoyaltyError(null);
  }

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setValidatingCoupon(true);
    setCouponError(null);
    try {
      const { data } = await api.post("/api/store/coupon/validate", {
        code: couponInput.trim(),
        orderAmount: total,
      });
      setCouponApplied({ code: data.coupon.code, discount: data.discount });
      setCouponInput("");
    } catch (err: any) {
      setCouponError(err?.response?.data?.error || "Cupón inválido");
      setCouponApplied(null);
    } finally {
      setValidatingCoupon(false);
    }
  }

  function removeCoupon() {
    setCouponApplied(null);
    setCouponError(null);
  }

  const tipAmount = useMemo(() => {
    if (tipPercent === -1) {
      const v = parseFloat(tipCustom);
      return Number.isFinite(v) && v > 0 ? v : 0;
    }
    return Math.round(total * tipPercent) / 100;
  }, [tipPercent, tipCustom, total]);

  const grandTotal = Math.max(0, total - (couponApplied?.discount || 0)) + tipAmount;

  const terminalId = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("kiosk-terminal-id") : null), []);
  const canPayCard = Boolean(terminalId && terminalId.trim());

  useEffect(() => {
    if (qty === 0) router.replace("/menu?t=" + (orderType === "DINE_IN" ? "dine_in" : "takeout"));
  }, [qty, orderType, router]);

  function canSubmit() {
    if (orderType === "DINE_IN") return tableNumber !== "" && parseInt(tableNumber, 10) > 0;
    return customerName.trim().length > 0;
  }

  async function submit(paymentMethod: "CASH" | "CARD") {
    if (!canSubmit()) {
      setError(orderType === "DINE_IN" ? "Ingresa número de mesa" : "Ingresa tu nombre");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const body: any = {
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          variantId: i.variantId,
          quantity: i.quantity,
          notes: i.notes || null,
          modifierIds: i.modifiers && i.modifiers.length > 0 ? i.modifiers.map((m) => m.id) : undefined,
        })),
        orderType,
        paymentMethod,
        tip: tipAmount > 0 ? tipAmount : 0,
        couponCode: couponApplied?.code || undefined,
        loyaltyQrCode: loyaltyApplied?.qrCode || undefined,
        source: "KIOSK",
      };
      if (orderType === "DINE_IN") {
        body.customerName = `Mesa ${tableNumber}`;
        body.tableNumber  = parseInt(tableNumber, 10);
      } else {
        body.customerName = customerName.trim();
      }

      const { data: order } = await api.post("/api/store/orders", body);

      if (paymentMethod === "CASH") {
        dispatch({ type: "clear" });
        router.replace(`/success?n=${encodeURIComponent(order.orderNumber)}&t=${orderType.toLowerCase()}&m=${orderType === "DINE_IN" ? tableNumber : encodeURIComponent(customerName.trim())}&p=cash`);
        return;
      }

      setTerminalCharge({
        amount: order.total,
        terminalId: terminalId!,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || "Error al crear la orden");
    } finally {
      setSubmitting(false);
    }
  }

  async function doCharge(): Promise<ChargeResult> {
    if (!terminalCharge) return { success: false, errorCode: "NO_STATE", message: "Estado inválido" };
    try {
      const { data } = await api.post("/api/payments/terminal/charge", {
        terminalId: terminalCharge.terminalId,
        amount: terminalCharge.amount,
        currency: "MXN",
        orderId: terminalCharge.orderId,
        orderNumber: terminalCharge.orderNumber,
      });
      return data;
    } catch (e: any) {
      return { success: false, errorCode: "NETWORK", message: e?.response?.data?.message || e.message };
    }
  }

  function onChargeClosed(result: ChargeResult | null) {
    if (result && result.success) {
      dispatch({ type: "clear" });
      const param = orderType === "DINE_IN" ? tableNumber : encodeURIComponent(customerName.trim());
      router.replace(`/success?n=${encodeURIComponent(terminalCharge!.orderNumber)}&t=${orderType.toLowerCase()}&m=${param}&p=card`);
    } else {
      setTerminalCharge(null);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <IdleGuard />
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => router.back()} style={{ all: "unset", cursor: "pointer", color: "var(--muted)" }}>← Volver al menú</button>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)" }}>Confirmar orden</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>
          {orderType === "DINE_IN" ? "Aqui" : "Llevar"}
        </div>
      </header>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: 20, minHeight: 0 }}>
        <section style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12, fontFamily: "var(--font-mono)" }}>
            Tu orden
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            {items.map((i) => {
              const editing = editingNoteKey === i.key;
              const hasNote = Boolean(i.notes && i.notes.trim());
              return (
              <div key={i.key} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{i.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2, fontFamily: "var(--font-mono)" }}>{fmt(i.price)} c/u</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => dispatch({ type: "set-qty", key: i.key, qty: i.quantity - 1 })} style={qtyBtn}><IconMinus size={18} /></button>
                    <span style={{ minWidth: 28, textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: 800 }}>{i.quantity}</span>
                    <button onClick={() => dispatch({ type: "set-qty", key: i.key, qty: i.quantity + 1 })} style={qtyBtn}><IconPlus size={18} /></button>
                    <button onClick={() => dispatch({ type: "remove", key: i.key })} style={{ ...qtyBtn, color: "#ef4444" }}><IconTrash size={18} /></button>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  {editing ? (
                    <textarea
                      autoFocus
                      value={i.notes || ""}
                      onChange={(e) => dispatch({ type: "set-notes", key: i.key, notes: e.target.value })}
                      onBlur={() => setEditingNoteKey(null)}
                      placeholder="Sin cebolla, picante extra…"
                      rows={2}
                      style={{
                        width: "100%", padding: "8px 12px",
                        background: "var(--surf2)", color: "var(--text)",
                        border: "1px solid var(--border2)", borderRadius: 8,
                        outline: "none", fontSize: 14, resize: "vertical",
                      }}
                    />
                  ) : hasNote ? (
                    <button
                      onClick={() => setEditingNoteKey(i.key)}
                      style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--brand-primary)", display: "flex", gap: 6, alignItems: "center" }}
                    >
                      📝 <span style={{ flex: 1, fontStyle: "italic" }}>{i.notes}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingNoteKey(i.key)}
                      style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}
                    >
                      + Agregar nota
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
          {/* Loyalty */}
          <div style={{ paddingTop: 12, marginTop: 8, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
              ¿Eres cliente frecuente?
            </div>
            {loyaltyApplied ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, #a78bfa 12%, transparent)", border: "1px solid #a78bfa" }}>
                <span style={{ fontWeight: 800, color: "#a78bfa" }}>👤 {loyaltyApplied.userName}</span>
                <span style={{ flex: 1, fontFamily: "var(--font-mono)", color: "#a78bfa", textAlign: "right", fontSize: 12 }}>{loyaltyApplied.points} pts</span>
                <button onClick={removeLoyalty} style={{ all: "unset", cursor: "pointer", color: "#ef4444", fontSize: 16 }}>✕</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={loyaltyInput}
                  onChange={(e) => setLoyaltyInput(e.target.value)}
                  placeholder="Código de cliente"
                  style={{
                    flex: 1, padding: "10px 14px",
                    background: "var(--surf2)", color: "var(--text)",
                    border: "1px solid var(--border)", borderRadius: 8,
                    outline: "none", fontSize: 14, fontFamily: "var(--font-mono)",
                  }}
                />
                <button
                  onClick={applyLoyalty}
                  disabled={validatingLoyalty || !loyaltyInput.trim()}
                  style={{
                    padding: "10px 16px", borderRadius: 8,
                    background: "var(--surf2)", border: "1px solid var(--border)",
                    color: "var(--text)", fontWeight: 800, cursor: "pointer",
                    opacity: validatingLoyalty ? 0.5 : 1,
                  }}
                >
                  {validatingLoyalty ? "…" : "Vincular"}
                </button>
              </div>
            )}
            {loyaltyError && <div style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>{loyaltyError}</div>}
          </div>

          {/* Cupón */}
          <div style={{ paddingTop: 12, marginTop: 8, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
              ¿Tienes un cupón?
            </div>
            {couponApplied ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, #10b981 12%, transparent)", border: "1px solid #10b981" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "#10b981" }}>🎟 {couponApplied.code}</span>
                <span style={{ flex: 1, fontFamily: "var(--font-mono)", color: "#10b981", textAlign: "right" }}>−{fmt(couponApplied.discount)}</span>
                <button onClick={removeCoupon} style={{ all: "unset", cursor: "pointer", color: "#ef4444", fontSize: 16 }}>✕</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Código"
                  style={{
                    flex: 1, padding: "10px 14px",
                    background: "var(--surf2)", color: "var(--text)",
                    border: "1px solid var(--border)", borderRadius: 8,
                    outline: "none", fontSize: 14, fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                  }}
                />
                <button
                  onClick={applyCoupon}
                  disabled={validatingCoupon || !couponInput.trim()}
                  style={{
                    padding: "10px 16px", borderRadius: 8,
                    background: "var(--surf2)", border: "1px solid var(--border)",
                    color: "var(--text)", fontWeight: 800, cursor: "pointer",
                    opacity: validatingCoupon ? 0.5 : 1,
                  }}
                >
                  {validatingCoupon ? "…" : "Aplicar"}
                </button>
              </div>
            )}
            {couponError && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>{couponError}</div>
            )}
          </div>

          {/* Propinas */}
          <div style={{ paddingTop: 12, marginTop: 8, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
              ¿Quieres dejar propina?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {([0, 5, 10, 15, -1] as const).map((p) => {
                const isActive = tipPercent === p;
                return (
                  <button
                    key={p}
                    onClick={() => { setTipPercent(p); if (p !== -1) setTipCustom(""); }}
                    style={{
                      padding: "10px 4px", borderRadius: 8,
                      background: isActive ? "var(--brand-primary)" : "var(--surf2)",
                      color: isActive ? "#000" : "var(--text)",
                      border: `1px solid ${isActive ? "var(--brand-primary)" : "var(--border)"}`,
                      fontWeight: 800, fontSize: 13, cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {p === 0 ? "Sin" : p === -1 ? "Otro" : `${p}%`}
                  </button>
                );
              })}
            </div>
            {tipPercent === -1 && (
              <input
                type="number"
                step="1"
                min="0"
                autoFocus
                value={tipCustom}
                onChange={(e) => setTipCustom(e.target.value)}
                placeholder="Monto en $"
                style={{
                  width: "100%", marginTop: 8, padding: "10px 14px",
                  background: "var(--surf2)", color: "var(--text)",
                  border: "1px solid var(--border)", borderRadius: 8,
                  outline: "none", fontSize: 16, fontFamily: "var(--font-mono)",
                  textAlign: "right",
                }}
              />
            )}
          </div>

          {/* Resumen subtotal + descuento + propina + total */}
          <div style={{ paddingTop: 16, marginTop: 12, borderTop: "2px solid var(--border2)" }}>
            {(tipAmount > 0 || couponApplied) && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
                  <span>Subtotal</span>
                  <span>{fmt(total)}</span>
                </div>
                {couponApplied && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#10b981", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
                    <span>Cupón {couponApplied.code}</span>
                    <span>−{fmt(couponApplied.discount)}</span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
                    <span>Propina</span>
                    <span>{fmt(tipAmount)}</span>
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "var(--font-mono)" }}>Total</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)" }}>{fmt(grandTotal)}</div>
            </div>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
          {orderType === "DINE_IN" ? (
            <>
              <Label>Número de mesa</Label>
              <Display value={tableNumber || "—"} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <Numpad value={tableNumber} onChange={setTableNumber} onConfirm={() => {}} max={999} />
              </div>
            </>
          ) : (
            <>
              <Label>Tu nombre (para cantar la orden)</Label>
              <input
                autoFocus
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. Juan"
                style={{
                  width: "100%", padding: "18px 20px",
                  fontSize: 28, fontWeight: 800,
                  background: "var(--surf2)", color: "var(--text)",
                  border: "1px solid var(--border2)", borderRadius: "var(--radius-md)",
                  outline: "none",
                  fontFamily: "var(--font-display)",
                }}
              />
              <div style={{ flex: 1 }} />
            </>
          )}

          {error && <div style={{ color: "#ef4444", fontSize: 14 }}>{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <PayButton
              variant="primary"
              onClick={() => submit("CASH")}
              disabled={submitting}
              icon={<IconCash size={32} />}
              label="Pagar en caja"
            />
            <PayButton
              variant="ghost"
              onClick={() => submit("CARD")}
              disabled={submitting || !canPayCard}
              icon={<IconCard size={32} />}
              label="Pagar con tarjeta"
              hint={!canPayCard ? "Terminal no configurada" : undefined}
            />
          </div>
        </section>
      </div>

      {terminalCharge && (
        <TerminalChargeModal
          amount={terminalCharge.amount}
          terminalId={terminalCharge.terminalId}
          onCharge={doCharge}
          onClose={onChargeClosed}
        />
      )}
    </div>
  );
}

const qtyBtn: React.CSSProperties = {
  all: "unset", cursor: "pointer",
  width: 36, height: 36, borderRadius: 8,
  background: "var(--surf2)", border: "1px solid var(--border)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "var(--font-mono)" }}>{children}</div>;
}

function Display({ value }: { value: string }) {
  return (
    <div style={{ padding: "18px 20px", background: "var(--surf)", border: "2px solid var(--brand-primary)", borderRadius: "var(--radius-md)", color: "var(--brand-primary)", fontSize: 48, fontWeight: 900, fontFamily: "var(--font-mono)", textAlign: "center" }}>
      {value}
    </div>
  );
}

function PayButton({ variant, onClick, disabled, icon, label, hint }: {
  variant: "primary" | "ghost";
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  const primary = variant === "primary";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      style={{
        all: "unset", cursor: disabled ? "not-allowed" : "pointer",
        padding: "20px 16px",
        borderRadius: "var(--radius-md)",
        background: primary ? "var(--brand-primary)" : "var(--surf2)",
        color: primary ? "var(--bg)" : "var(--text)",
        border: primary ? "none" : "1px solid var(--border)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <div style={{ color: primary ? "var(--bg)" : "var(--brand-primary)" }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--font-display)" }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{hint}</div>}
    </button>
  );
}
