import { legacyKitchenLayout, parseKitchenLayout } from "@/lib/kitchen-layout";

describe("layout de comanda", () => {
  it.each(["null", "{}", "42", "[null]", '[{"type":"TEXT","text":12}]', "invalid"])(
    "rechaza configuración inválida %s y permite usar el formato anterior", (value) => {
      expect(parseKitchenLayout(value)).toEqual([]);
    },
  );

  it("conserva las preferencias existentes al abrir el editor por primera vez", () => {
    const layout = legacyKitchenLayout({
      showTableNumber: false, showCustomerName: false, showOrderNumber: false,
      showModifiers: false, showNotes: false, groupBySeat: false,
      fontSize: "normal", ticketNameSize: "xlarge", lineWeight: "light",
    });
    expect(layout[0]).toMatchObject({ showTable: false, showCustomer: false, size: "xlarge" });
    expect(layout[1]).toMatchObject({ showOrderNumber: false });
    expect(layout[3]).toMatchObject({ showModifiers: false, showNotes: false,
      groupBySeat: false, size: "normal", weight: "light" });
  });
});
