import api from "@/lib/api";
import type { KitchenTicketConfig, PrinterRecord } from "@/lib/printer";

type RawPrinter = PrinterRecord & {
  printerGroups?: Array<{ printerGroup?: { id: string; name?: string } }>;
};

type TicketConfigDTO = {
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
};

export function normalizePrinters(list: RawPrinter[]): PrinterRecord[] {
  return list.map((printer) => ({
    ...printer,
    printerGroupIds: (printer.printerGroups ?? [])
      .map((member) => member.printerGroup?.id)
      .filter((id): id is string => Boolean(id)),
    printerGroupRefs: (printer.printerGroups ?? [])
      .map((member) => member.printerGroup)
      .filter((group): group is { id: string; name?: string } => Boolean(group?.id))
      .map((group) => ({ id: group.id, name: group.name || "Estacion" })),
  }));
}

export function mapKitchenConfig(dto: TicketConfigDTO | null): KitchenTicketConfig | null {
  if (!dto) return null;
  const fontSize =
    dto.kitchenFontSize === "normal" || dto.kitchenFontSize === "xlarge"
      ? dto.kitchenFontSize
      : "large";

  return {
    header: dto.kitchenHeader ?? undefined,
    footer: dto.kitchenFooter ?? undefined,
    showOrderNumber: dto.kitchenShowOrderNumber,
    showTime: dto.kitchenShowTime,
    showOrderType: dto.kitchenShowType,
    showTableNumber: dto.kitchenShowTable,
    showCustomerName: dto.kitchenShowCustomer,
    showModifiers: dto.kitchenShowModifiers,
    showNotes: dto.kitchenShowNotes,
    groupBySeat: dto.kitchenGroupBySeat,
    separateByGroup: dto.kitchenSeparateByGroup,
    fontSize,
  };
}

export async function fetchPrinterConfiguration(): Promise<{
  printers: PrinterRecord[];
  kitchenConfig: KitchenTicketConfig | null;
}> {
  const [printersResponse, configResponse] = await Promise.all([
    api.get<RawPrinter[]>("/api/printers"),
    api
      .get<TicketConfigDTO>("/api/printers/ticket-config")
      .catch(() => ({ data: null as TicketConfigDTO | null })),
  ]);

  return {
    printers: normalizePrinters(
      Array.isArray(printersResponse.data) ? printersResponse.data : [],
    ),
    kitchenConfig: mapKitchenConfig(configResponse.data),
  };
}
