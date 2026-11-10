// Billetera del repartidor INDEPENDIENTE (C8): cuánto ganó (100% del envío), quién le debe a quién
// por comercio y día, y lo que confirma el libro contable. Lógica pura + llamada con su Bearer.
import { getApiUrl } from "./config";
import { getCourierToken, CourierAuthError } from "./courierSession";

export type WalletStatus = "OPEN" | "ISSUED" | "PAID";
export type WalletDirection = "MERCHANT_PAYS" | "COURIER_PAYS" | "EVEN";
export interface WalletLine {
  orderId: string; orderNumber: string | null; deliveredAt: string; paymentMethod: "CASH" | "ONLINE";
  totalCents: number; earningsCents: number; cashCollectedCents: number; cashToMerchantCents: number; onlineEarningsCents: number;
}
export interface WalletItem {
  id: string | null; restaurantId: string; restaurantName: string | null; businessDate: string; status: WalletStatus;
  deliveriesCount: number; earningsCents: number; cashCollectedCents: number; cashToMerchantCents: number;
  onlineEarningsCents: number; netCents: number; direction: WalletDirection; paidAt: string | null; paymentReference: string | null;
  lines: WalletLine[];
}
export interface WalletDay { businessDate: string; items: WalletItem[] }
export interface WalletTotals {
  todayEarningsCents: number; periodEarningsCents: number; pendingFromMerchantsCents: number;
  owedToMerchantsCents: number; ledgerPayableCents: number;
}
export interface Wallet { today: string; from: string; totals: WalletTotals; days: WalletDay[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: WalletStatus[] = ["OPEN", "ISSUED", "PAID"];
const DIRECTIONS: WalletDirection[] = ["MERCHANT_PAYS", "COURIER_PAYS", "EVEN"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const cents = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const signed = (v: unknown): v is number => Number.isSafeInteger(v);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function bad(): never { throw new Error("INVALID_WALLET_RESPONSE"); }

export function formatCents(value: number): string { return money.format(value / 100); }
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Hoy";
  const [, m, d] = date.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}
/** Qué decirle al repartidor de un corte. */
export function settlementText(item: WalletItem): string {
  const name = item.restaurantName ?? "el comercio";
  if (item.status === "PAID") return item.direction === "EVEN" ? "Sin saldo" : `Saldado con ${name}`;
  if (item.direction === "MERCHANT_PAYS") return `${name} te paga ${formatCents(item.netCents)}`;
  if (item.direction === "COURIER_PAYS") return `Entrega ${formatCents(-item.netCents)} a ${name}`;
  return "Sin saldo";
}

function parseLine(v: unknown): WalletLine {
  if (!obj(v) || typeof v.orderId !== "string" || typeof v.deliveredAt !== "string" || !["CASH", "ONLINE"].includes(v.paymentMethod as string)
    || ![v.totalCents, v.earningsCents, v.cashCollectedCents, v.cashToMerchantCents, v.onlineEarningsCents].every(cents)) bad();
  const l = v as Record<string, unknown>;
  return { orderId: l.orderId as string, orderNumber: typeof l.orderNumber === "string" ? l.orderNumber : null, deliveredAt: l.deliveredAt as string,
    paymentMethod: l.paymentMethod as "CASH" | "ONLINE", totalCents: l.totalCents as number, earningsCents: l.earningsCents as number,
    cashCollectedCents: l.cashCollectedCents as number, cashToMerchantCents: l.cashToMerchantCents as number, onlineEarningsCents: l.onlineEarningsCents as number };
}
function parseItem(v: unknown): WalletItem {
  if (!obj(v) || typeof v.restaurantId !== "string" || typeof v.businessDate !== "string" || !DATE.test(v.businessDate)
    || !STATUSES.includes(v.status as WalletStatus) || !DIRECTIONS.includes(v.direction as WalletDirection)
    || ![v.deliveriesCount, v.earningsCents, v.cashCollectedCents, v.cashToMerchantCents, v.onlineEarningsCents].every(cents)
    || !signed(v.netCents) || v.netCents !== (v.onlineEarningsCents as number) - (v.cashToMerchantCents as number)
    || !Array.isArray(v.lines) || v.lines.length > 500) bad();
  const i = v as Record<string, unknown>;
  return { id: typeof i.id === "string" ? i.id : null, restaurantId: i.restaurantId as string,
    restaurantName: typeof i.restaurantName === "string" ? i.restaurantName : null, businessDate: i.businessDate as string,
    status: i.status as WalletStatus, deliveriesCount: i.deliveriesCount as number, earningsCents: i.earningsCents as number,
    cashCollectedCents: i.cashCollectedCents as number, cashToMerchantCents: i.cashToMerchantCents as number,
    onlineEarningsCents: i.onlineEarningsCents as number, netCents: i.netCents as number, direction: i.direction as WalletDirection,
    paidAt: typeof i.paidAt === "string" ? i.paidAt : null, paymentReference: typeof i.paymentReference === "string" ? i.paymentReference : null,
    lines: (i.lines as unknown[]).map(parseLine) };
}
export function parseWallet(input: unknown): Wallet {
  if (!obj(input)) bad();
  const data = input as Record<string, unknown>;
  if ( typeof data.today !== "string" || !DATE.test(data.today) || typeof data.from !== "string" || !DATE.test(data.from)
    || !obj(data.totals) || !Array.isArray(data.days) || data.days.length > 62) bad();
  const t = (data as { totals: Record<string, unknown> }).totals;
  if (![t.todayEarningsCents, t.periodEarningsCents, t.pendingFromMerchantsCents, t.owedToMerchantsCents].every(cents) || !signed(t.ledgerPayableCents)) bad();
  const days = (data.days as unknown[]).map(day => {
    if (!obj(day) || typeof day.businessDate !== "string" || !DATE.test(day.businessDate) || !Array.isArray(day.items)) bad();
    const d = day as { businessDate: string; items: unknown[] };
    return { businessDate: d.businessDate, items: d.items.map(parseItem) };
  });
  return { today: data.today as string, from: data.from as string, days,
    totals: { todayEarningsCents: t.todayEarningsCents as number, periodEarningsCents: t.periodEarningsCents as number,
      pendingFromMerchantsCents: t.pendingFromMerchantsCents as number, owedToMerchantsCents: t.owedToMerchantsCents as number,
      ledgerPayableCents: t.ledgerPayableCents as number } };
}

export async function loadWallet(days = 14, fetcher: typeof fetch = fetch): Promise<Wallet> {
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error("INVALID_DAYS");
  const token = getCourierToken();
  if (!token) throw new CourierAuthError("UNAUTHENTICATED", 401);
  let res: Response;
  try {
    res = await fetcher(`${getApiUrl()}/api/marketplace/v1/couriers/me/wallet?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch { throw new CourierAuthError("NETWORK", 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CourierAuthError(String((data as { errorCode?: string }).errorCode || "WALLET_FAILED"), res.status);
  return parseWallet(data);
}
