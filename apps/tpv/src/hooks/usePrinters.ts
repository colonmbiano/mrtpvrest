"use client";
import { useEffect, useState, useCallback } from "react";
import { useClientValue } from "@/hooks/useClientValue";
import api from "@/lib/api";
import type { PrinterRecord, KitchenTicketConfig, ReceiptInput } from "@/lib/printer-tcp";

/**
 * Carga + normaliza las impresoras de la sucursal y se mantiene viva en
 * memoria (recargando ante el evento global `printers-changed`).
 *
 * El backend devuelve `printerGroups: [{ printerGroup: { id } }]` y el
 * dispatcher de printer-tcp consume `printerGroupIds: string[]`. Aquí
 * hacemos esa derivación una sola vez para que los consumers (drawer,
 * modal de detalle, vista de mesa) no la repitan.
 */
type RawPrinter = PrinterRecord & {
  printerGroups?: Array<{ printerGroup?: { id: string; name?: string } }>;
};

function normalize(list: RawPrinter[]): PrinterRecord[] {
  return list.map((p) => ({
    ...p,
    printerGroupIds: (p.printerGroups ?? [])
      .map((m) => m.printerGroup?.id)
      .filter((id): id is string => Boolean(id)),
    printerGroupRefs: (p.printerGroups ?? [])
      .map((m) => m.printerGroup)
      .filter((group): group is { id: string; name?: string } => Boolean(group?.id))
      .map((group) => ({ id: group.id, name: group.name || "Estacion" })),
  }));
}

export function usePrinters() {
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<RawPrinter[]>("/api/printers");
      setPrinters(Array.isArray(data) ? normalize(data) : []);
    } catch {
      setPrinters([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Carga inicial diferida (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) load(); });
    const onRefresh = () => load();
    if (typeof window !== "undefined") {
      window.addEventListener("printers-changed", onRefresh);
      return () => { cancelled = true; window.removeEventListener("printers-changed", onRefresh); };
    }
    return () => { cancelled = true; };
  }, [load]);

  return { printers, loaded, reload: load };
}

/**
 * Lee la identidad del restaurante desde localStorage (poblada por
 * useTPVAuth). La usamos como header del recibo CASHIER. No bloquea
 * la impresión si no está disponible.
 */
export function useReceiptIdentity() {
  const businessName = useClientValue(
    () => (typeof window === "undefined" ? null : localStorage.getItem("restaurantName")),
    null,
  );
  const businessFooter = useClientValue(
    () => (typeof window === "undefined" ? null : localStorage.getItem("receiptFooter")),
    null,
  );

  return { businessName, businessFooter };
}

/**
 * Carga la configuración de impresión de comanda desde el backend
 * (/api/printers/ticket-config — campos kitchen*). Se mantiene en memoria
 * del componente y se refresca con el evento global `ticket-config-changed`
 * que dispara la UI admin al guardar.
 *
 * Si el fetch falla o el usuario aún no tiene auth, retorna null y el
 * builder cae a sus defaults históricos.
 */
type TicketConfigDTO = {
  header?: string;
  footer?: string;
  businessName?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  showLogo?: boolean;
  showAddress?: boolean;
  showPhone?: boolean;
  kitchenHeader?: string;
  kitchenFooter?: string;
  kitchenShowOrderNumber?: boolean;
  kitchenShowTime?: boolean;
  kitchenShowType?: boolean;
  kitchenShowTable?: boolean;
  kitchenShowCustomer?: boolean;
  kitchenShowModifiers?: boolean;
  kitchenShowNotes?: boolean;
  kitchenGroupBySeat?: boolean;
  kitchenSeparateByGroup?: boolean;
  kitchenFontSize?: string;
  // Tipografía (recibo + comanda).
  paperWidth?: string;
  fontFamily?: string;
  fontSize?: string;
  lineSpacing?: string;
  lineWeight?: string;
  kitchenFontFamily?: string;
  kitchenLineSpacing?: string;
  kitchenLineWeight?: string;
  kitchenTicketNameSize?: string;
  // ── Identidad fiscal extendida (recibo) ─────────────────────────────────
  businessType?: string;        // giro
  rfc?: string;
  showInvoiceQr?: boolean;
  invoiceUrl?: string;
  invoiceFolioPrefix?: string;  // el folio final = prefijo + número de orden
};

/**
 * Arma la porción de identidad de negocio + tipografía del recibo a partir de
 * la config admin (DTO) y la identidad en localStorage. Centraliza el mapeo
 * para que checkout, reimpresión y split no lo dupliquen (ni se desincronicen).
 * Los campos por-orden (cajero, terminal, totales, items) se pasan aparte.
 */
export function buildReceiptIdentityFields(
  dto: TicketConfigDTO | null,
  identity: { businessName: string | null; businessFooter: string | null },
  fallbackName?: string | null,
  orderNumber?: string | null,
): Partial<ReceiptInput> {
  // Folio fiscal = prefijo configurable + número de orden (per-orden). Sin
  // prefijo o sin orden no se imprime folio.
  const prefix = dto?.invoiceFolioPrefix?.trim();
  const invoiceFolio = prefix && orderNumber ? `${prefix}${orderNumber}` : null;
  return {
    businessName: dto?.businessName || identity.businessName || fallbackName || null,
    businessFooter: dto?.footer || identity.businessFooter || null,
    businessType: dto?.businessType || null,
    rfc: dto?.rfc || null,
    showLogo: dto?.showLogo,
    logoUrl: dto?.logoUrl,
    showAddress: dto?.showAddress,
    address: dto?.address,
    showPhone: dto?.showPhone,
    phone: dto?.phone,
    showInvoiceQr: dto?.showInvoiceQr,
    invoiceUrl: dto?.invoiceUrl || null,
    invoiceFolio,
    fontFamily: dto?.fontFamily,
    fontSize: dto?.fontSize,
    lineSpacing: dto?.lineSpacing,
    lineWeight: dto?.lineWeight,
    paperWidth: dto?.paperWidth,
  };
}

function mapToKitchenConfig(dto: TicketConfigDTO | null): KitchenTicketConfig | null {
  if (!dto) return null;
  const fs = dto.kitchenFontSize === "normal" || dto.kitchenFontSize === "xlarge"
    ? (dto.kitchenFontSize as "normal" | "xlarge")
    : "large";
  const tns = dto.kitchenTicketNameSize === "normal" || dto.kitchenTicketNameSize === "xlarge"
    ? (dto.kitchenTicketNameSize as "normal" | "xlarge")
    : "large";
  return {
    header:           dto.kitchenHeader ?? undefined,
    footer:           dto.kitchenFooter ?? undefined,
    showOrderNumber:  dto.kitchenShowOrderNumber,
    showTime:         dto.kitchenShowTime,
    showOrderType:    dto.kitchenShowType,
    showTableNumber:  dto.kitchenShowTable,
    showCustomerName: dto.kitchenShowCustomer,
    showModifiers:    dto.kitchenShowModifiers,
    showNotes:        dto.kitchenShowNotes,
    groupBySeat:      dto.kitchenGroupBySeat,
    separateByGroup:  dto.kitchenSeparateByGroup,
    fontSize:         fs,
    fontFamily:       dto.kitchenFontFamily,
    lineSpacing:      dto.kitchenLineSpacing,
    lineWeight:       dto.kitchenLineWeight,
    paperWidth:       dto.paperWidth,
    ticketNameSize:   tns,
  };
}

export function useKitchenConfig() {
  const [config, setConfig] = useState<KitchenTicketConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TicketConfigDTO>("/api/printers/ticket-config");
      setConfig(mapToKitchenConfig(data));
    } catch {
      setConfig(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Carga inicial diferida (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) load(); });
    if (typeof window === "undefined") return () => { cancelled = true; };
    const onRefresh = () => load();
    window.addEventListener("ticket-config-changed", onRefresh);
    return () => { cancelled = true; window.removeEventListener("ticket-config-changed", onRefresh); };
  }, [load]);

  return { kitchenConfig: config, loaded };
}

export function useFullTicketConfig() {
  const [config, setConfig] = useState<TicketConfigDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TicketConfigDTO>("/api/printers/ticket-config");
      setConfig(data);
    } catch {
      setConfig(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) load(); });
    if (typeof window === "undefined") return () => { cancelled = true; };
    const onRefresh = () => load();
    window.addEventListener("ticket-config-changed", onRefresh);
    return () => { cancelled = true; window.removeEventListener("ticket-config-changed", onRefresh); };
  }, [load]);

  return { config, loaded };
}
