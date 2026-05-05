"use client";
import { Plus, X, ShoppingBag, User, Minus, Trash2, MapPin, ChefHat, Tag, Eraser } from "lucide-react";
import type { ReactNode } from "react";

export type TicketLine = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
};

export type TicketTab = {
  id: string;
  name: string;
};

export type OrderType = "DINE_IN" | "TAKEOUT" | "DELIVERY";

export type OrderTypeOption = {
  id: OrderType;
  label: string;
  icon?: ReactNode;
};

export default function TicketPanel({
  tabs,
  activeTabId,
  onTabSelect,
  onTabAdd,
  onTabClose,

  table,
  customer,
  customerName,
  customerPhone,
  onCustomerNameChange,
  onCustomerPhoneChange,

  orderType,
  orderTypeOptions,
  onOrderTypeChange,

  tableLabel,
  onPickTable,
  onClearTable,
  address,
  onAddressChange,

  status = "ORDEN EN PROCESO",
  subStatus = "DETALLE DE CONSUMO",

  lines,
  onLineQty,
  onLineRemove,

  onSendToKitchen,
  onDiscount,
  onClear,

  subtotal,
  total,
  currency = "$",

  primaryLabel = "PROCESAR COBRO",
  onPrimary,
  secondaryLeftLabel = "DIVIDIR",
  onSecondaryLeft,
  secondaryRightLabel = "PENDIENTE",
  onSecondaryRight,
}: {
  tabs: TicketTab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabAdd?: () => void;
  onTabClose?: (id: string) => void;

  table?: string | null;
  customer?: { name: string; phone?: string };
  customerName?: string;
  customerPhone?: string;
  onCustomerNameChange?: (v: string) => void;
  onCustomerPhoneChange?: (v: string) => void;

  orderType?: OrderType;
  orderTypeOptions?: OrderTypeOption[];
  onOrderTypeChange?: (t: OrderType) => void;

  tableLabel?: string | null;
  onPickTable?: () => void;
  onClearTable?: () => void;
  address?: string;
  onAddressChange?: (v: string) => void;

  status?: string;
  subStatus?: string;

  lines: TicketLine[];
  onLineQty?: (id: string, delta: number) => void;
  onLineRemove?: (id: string) => void;

  onSendToKitchen?: () => void;
  onDiscount?: () => void;
  onClear?: () => void;

  subtotal: number;
  total: number;
  currency?: string;

  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLeftLabel?: string;
  onSecondaryLeft?: () => void;
  secondaryRightLabel?: string;
  onSecondaryRight?: () => void;
}) {
  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;
  const isEmpty = lines.length === 0;

  return (
    <div className="flex flex-col h-full">
      <TicketTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={onTabSelect}
        onAdd={onTabAdd}
        onClose={onTabClose}
        table={table}
      />

      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}
        >
          {status}
        </p>
        <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          {subStatus}
        </h3>
      </div>

      {(onCustomerNameChange || onCustomerPhoneChange) ? (
        <CustomerInputs
          name={customerName ?? ""}
          phone={customerPhone ?? ""}
          onName={onCustomerNameChange}
          onPhone={onCustomerPhoneChange}
        />
      ) : (
        <CustomerCard customer={customer} />
      )}

      {orderType && orderTypeOptions && onOrderTypeChange && (
        <OrderTypeSegment
          value={orderType}
          options={orderTypeOptions}
          onChange={onOrderTypeChange}
        />
      )}

      {orderType === "DINE_IN" && onPickTable && (
        <div className="px-5 pb-3">
          <button
            onClick={onPickTable}
            className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              background: tableLabel ? "var(--brand-soft)" : "var(--surface-2)",
              border: tableLabel ? "1px solid var(--brand)" : "1px solid var(--border)",
              color: tableLabel ? "var(--brand)" : "var(--text-secondary)",
              letterSpacing: "0.06em",
            }}
          >
            {tableLabel ? `Mesa: ${tableLabel}` : "Seleccionar mesa"}
            {tableLabel && onClearTable && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTable();
                }}
                className="ml-1 opacity-60 hover:opacity-100"
              >
                <X size={12} />
              </span>
            )}
          </button>
        </div>
      )}

      {orderType === "DELIVERY" && onAddressChange && (
        <div className="px-5 pb-3">
          <div className="relative">
            <MapPin
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={address ?? ""}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Dirección de entrega"
              className="w-full h-11 pl-9 pr-3 rounded-xl text-sm outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-3">
        {isEmpty ? <EmptyLines /> : (
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <LineRow
                key={l.id}
                line={l}
                currency={currency}
                onQty={onLineQty ? (d) => onLineQty(l.id, d) : undefined}
                onRemove={onLineRemove ? () => onLineRemove(l.id) : undefined}
              />
            ))}
          </ul>
        )}
      </div>

      {(onSendToKitchen || onDiscount || onClear) && !isEmpty && (
        <div className="px-5 py-2 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
          {onSendToKitchen && (
            <ActionChip Icon={ChefHat} label="Cocina" onClick={onSendToKitchen} />
          )}
          {onDiscount && (
            <ActionChip Icon={Tag} label="Descuento" onClick={onDiscount} />
          )}
          {onClear && (
            <ActionChip Icon={Eraser} label="Limpiar" onClick={onClear} tone="danger" />
          )}
        </div>
      )}

      <div className="px-5 py-4 border-t flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
        <Row label="SUBTOTAL" value={fmt(subtotal)} muted />
      </div>

      <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)", letterSpacing: "0.12em" }}
        >
          Total Final
        </span>
        <span
          className="text-2xl font-extrabold"
          style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
        >
          {fmt(total)}
        </span>
      </div>

      <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
        <button
          onClick={onPrimary}
          disabled={isEmpty}
          className="w-full h-14 rounded-xl text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
          style={{
            background: "var(--brand)",
            color: "var(--brand-fg)",
            letterSpacing: "0.08em",
            boxShadow: isEmpty ? "none" : "var(--shadow-glow)",
          }}
        >
          {primaryLabel}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton label={secondaryLeftLabel} onClick={onSecondaryLeft} disabled={isEmpty} />
          <SecondaryButton label={secondaryRightLabel} onClick={onSecondaryRight} disabled={isEmpty} />
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function TicketTabs({
  tabs,
  activeTabId,
  onSelect,
  onAdd,
  onClose,
  table,
}: {
  tabs: TicketTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onClose?: (id: string) => void;
  table?: string | null;
}) {
  return (
    <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-hide">
        {tabs.map((t) => {
          const active = t.id === activeTabId;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all"
              style={{
                background: active ? "var(--brand)" : "var(--surface-2)",
                color: active ? "var(--brand-fg)" : "var(--text-secondary)",
                letterSpacing: "0.06em",
              }}
            >
              {t.name}
              {onClose && tabs.length > 1 && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(t.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </span>
              )}
            </button>
          );
        })}
        {onAdd && (
          <button
            onClick={onAdd}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:brightness-110"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
            aria-label="Agregar ticket"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
        style={{
          background: "var(--surface-2)",
          color: "var(--text-secondary)",
          letterSpacing: "0.1em",
        }}
      >
        Mesa: {table ?? "---"}
      </div>
    </div>
  );
}

function CustomerCard({ customer }: { customer?: { name: string; phone?: string } }) {
  return (
    <div className="px-5 pb-3">
      <div
        className="flex items-center gap-3 p-3 rounded-xl"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          <User size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Cliente
          </span>
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {customer?.name || "Venta de Mostrador"}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyLines() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
      >
        <ShoppingBag size={26} />
      </div>
      <p
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}
      >
        No hay productos en esta selección
      </p>
    </div>
  );
}

function LineRow({
  line,
  currency,
  onQty,
  onRemove,
}: {
  line: TicketLine;
  currency: string;
  onQty?: (delta: number) => void;
  onRemove?: () => void;
}) {
  return (
    <li
      className="p-3 rounded-xl flex items-center gap-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
          {line.name}
        </p>
        {line.notes && (
          <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
            {line.notes}
          </p>
        )}
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {currency}
          {line.price.toFixed(2)} c/u
        </p>
      </div>

      {onQty && (
        <div className="flex items-center gap-1">
          <QtyButton onClick={() => onQty(-1)}>
            <Minus size={12} />
          </QtyButton>
          <span className="w-6 text-center text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {line.quantity}
          </span>
          <QtyButton onClick={() => onQty(+1)}>
            <Plus size={12} />
          </QtyButton>
        </div>
      )}

      <span className="text-sm font-bold w-16 text-right" style={{ color: "var(--text-primary)" }}>
        {currency}
        {(line.price * line.quantity).toFixed(2)}
      </span>

      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Eliminar"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--danger-soft)";
            e.currentTarget.style.color = "var(--danger)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <Trash2 size={13} />
        </button>
      )}
    </li>
  );
}

function QtyButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:brightness-110"
      style={{ background: "var(--surface-3)", color: "var(--text-primary)" }}
    >
      {children}
    </button>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span
        className="font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}
      >
        {label}
      </span>
      <span
        className="font-bold"
        style={{ color: muted ? "var(--text-secondary)" : "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

function SecondaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-11 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: "transparent",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-strong)",
        letterSpacing: "0.08em",
      }}
    >
      {label}
    </button>
  );
}

function CustomerInputs({
  name, phone, onName, onPhone,
}: {
  name: string;
  phone: string;
  onName?: (v: string) => void;
  onPhone?: (v: string) => void;
}) {
  return (
    <div className="px-5 pb-3 flex gap-2">
      <input
        value={name}
        onChange={(e) => onName?.(e.target.value)}
        placeholder="Nombre cliente"
        className="flex-1 h-11 px-3 rounded-xl text-sm outline-none"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      />
      <input
        value={phone}
        onChange={(e) => onPhone?.(e.target.value)}
        placeholder="Teléfono"
        type="tel"
        className="w-28 h-11 px-3 rounded-xl text-sm outline-none"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      />
    </div>
  );
}

function OrderTypeSegment({
  value, options, onChange,
}: {
  value: OrderType;
  options: OrderTypeOption[];
  onChange: (t: OrderType) => void;
}) {
  return (
    <div className="px-5 pb-3">
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className="flex-1 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
              style={{
                background: active ? "var(--brand)" : "transparent",
                color: active ? "var(--brand-fg)" : "var(--text-secondary)",
                letterSpacing: "0.06em",
              }}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionChip({
  Icon, label, onClick, tone,
}: {
  Icon: typeof Plus;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  const isDanger = tone === "danger";
  return (
    <button
      onClick={onClick}
      className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-all hover:brightness-110"
      style={{
        background: isDanger ? "var(--danger-soft)" : "var(--surface-2)",
        color: isDanger ? "var(--danger)" : "var(--text-secondary)",
        border: `1px solid ${isDanger ? "var(--danger)" : "var(--border)"}`,
        letterSpacing: "0.06em",
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
