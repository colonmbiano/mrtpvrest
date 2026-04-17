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
        })),
        orderType,
        paymentMethod,
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
            {items.map((i) => (
              <div key={i.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
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
            ))}
          </div>
          <div style={{ paddingTop: 16, marginTop: 12, borderTop: "2px solid var(--border2)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "var(--font-mono)" }}>Total</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)" }}>{fmt(total)}</div>
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
