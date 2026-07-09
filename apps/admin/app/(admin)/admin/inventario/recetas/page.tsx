"use client";
import { useEffect, useState } from "react";
import { ChevronRight, Download, Upload, NotebookText } from "lucide-react";
import api from "@/lib/api";
import ImportTemplateModal from "@/components/ImportTemplateModal";
import {
  PageShell, PageHeader, PageTabs, Card, Button, Input, useToast,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";
import {
  RecipeEditor,
  type MenuItem, type Ingredient, type SubRecipe,
} from "./_components/RecipeEditor";

// /admin/inventario/recetas · Editor de Recipe (escandallo final 1:1 con
// MenuItem) usando los endpoints nuevos `/api/recipes`.
//
// Una Recipe vincula 1:1 con MenuItem y guarda:
//   · metadata pricing (priceDelivery, platformCommissionPct, marginErrorPct,
//     targetMarginPct)
//   · N RecipeItem (cada uno apunta a Ingredient XOR SubRecipe con qty + unit)

export default function RecetasPage() {
  const toast = useToast();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/api/menu/items"),
      api.get("/api/inventory/ingredients"),
      api.get("/api/recipes/subrecipes"),
    ])
      .then(([m, i, s]) => {
        setMenuItems(m.data || []);
        setIngredients(i.data || []);
        setSubRecipes(s.data || []);
      })
      .catch(() => {});
  }, []);

  async function downloadTemplate() {
    try {
      const res = await api.get("/api/recipes/import/template/recetas", { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla-recetas.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo generar la plantilla. Inténtalo de nuevo.");
    }
  }

  function reloadCatalogs() {
    Promise.all([
      api.get("/api/menu/items"),
      api.get("/api/inventory/ingredients"),
      api.get("/api/recipes/subrecipes"),
    ]).then(([m, i, s]) => {
      setMenuItems(m.data || []);
      setIngredients(i.data || []);
      setSubRecipes(s.data || []);
    }).catch(() => {});
  }

  const filtered = menuItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const headerActions = (
    <>
      <Button variant="secondary" size="sm" icon={Download} onClick={downloadTemplate}>Plantilla</Button>
      <Button variant="secondary" size="sm" icon={Upload} onClick={() => setImportOpen(true)}>Subir</Button>
      <Button variant="secondary" size="sm" icon={ChevronRight} href="/admin/inventario/subrecetas">Sub-recetas</Button>
    </>
  );

  return (
    <PageShell>
      <ImportTemplateModal
        mode="recetas"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={reloadCatalogs}
      />

      <PageHeader
        eyebrow="Inventario · Costeo"
        title="Recetas"
        subtitle="Escandallo de cada producto del menú (CMV y márgenes)"
        actions={headerActions}
      />
      <PageTabs set="inventario" />

      {/* acciones en mobile (PageHeader es hidden en <md) */}
      <div className="mb-4 flex flex-wrap gap-2 md:hidden">{headerActions}</div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(260px,1fr)_2fr]">
        {/* Panel izquierdo: lista de productos */}
        <Card className="overflow-hidden">
          <div className="border-b p-3" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" />
          </div>
          <div className="ds-scrollbar max-h-[50vh] overflow-y-auto md:max-h-[calc(100vh-300px)]">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-tx-mut">Sin productos</p>
            ) : (
              filtered.map((item) => {
                const active = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      borderBottom: "1px solid var(--bd-1)",
                      background: active ? "var(--accent-soft)" : "transparent",
                      borderLeft: `3px solid ${active ? "var(--brand-primary)" : "transparent"}`,
                    }}
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-ds-md object-contain" style={{ background: "var(--surf-2)" }} />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ds-md text-tx-mut" style={{ background: "var(--surf-2)" }}>
                        <NotebookText size={16} strokeWidth={1.9} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-tx">{item.name}</div>
                      <div className="font-mono text-[11px] tabular-nums text-tx-mut">{formatMoney(item.price)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Panel derecho: editor */}
        <Card className="p-4 md:p-5">
          <RecipeEditor
            selected={selected}
            ingredients={ingredients}
            subRecipes={subRecipes}
            onCatalogsReload={reloadCatalogs}
          />
        </Card>
      </div>
    </PageShell>
  );
}
