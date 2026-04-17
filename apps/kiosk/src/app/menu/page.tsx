"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SetupGuard } from "@/components/SetupGuard";
import { IdleGuard } from "@/components/IdleGuard";
import { VariantPicker } from "@/components/VariantPicker";
import { IconPlus, IconArrow } from "@/components/Icon";
import { useCart } from "@/lib/cart";
import { fmt } from "@/lib/format";
import api from "@/lib/api";

type Variant = { id: string; name: string; price: number };
type Complement = { id: string; name: string; price: number; isRequired: boolean };
type MenuItem = {
  id: string; name: string; description?: string | null;
  price: number; promoPrice?: number | null; isPromo?: boolean;
  image?: string | null; categoryId: string;
  variants: Variant[]; complements: Complement[];
};
type Category = { id: string; name: string; items: MenuItem[] };

export default function MenuPage() {
  return <SetupGuard><Inner /></SetupGuard>;
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderType = (params.get("t") === "takeout" ? "takeout" : "dine_in") as "dine_in" | "takeout";

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const { items, total, qty, dispatch } = useCart();

  useEffect(() => {
    api.get("/api/store/menu").then(({ data }) => {
      setCategories(data.categories || []);
      if (data.categories?.[0]) setActiveCat(data.categories[0].id);
    }).catch((e) => console.error("menu fetch:", e));
  }, []);

  function addItem(mi: MenuItem, variant: Variant | null) {
    const price = variant ? variant.price : (mi.isPromo && mi.promoPrice ? mi.promoPrice : mi.price);
    const name  = variant ? `${mi.name} (${variant.name})` : mi.name;
    dispatch({
      type: "add",
      item: {
        key: `${mi.id}:${variant?.id ?? "_"}`,
        menuItemId: mi.id,
        variantId: variant?.id ?? null,
        name,
        price,
      },
    });
    setPicking(null);
  }

  function tap(mi: MenuItem) {
    const needsPicker = mi.variants.length > 0 || mi.complements.some((c) => c.isRequired);
    if (needsPicker) setPicking(mi);
    else addItem(mi, null);
  }

  const active = categories.find((c) => c.id === activeCat);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <IdleGuard />
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => router.replace("/")} style={{ all: "unset", cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>← Inicio</button>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)" }}>Elige tus productos</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>
          {orderType === "dine_in" ? "Aqui" : "Llevar"}
        </div>
      </header>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr", minHeight: 0 }}>
        <aside style={{ overflow: "auto", padding: 16, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              style={{
                all: "unset", cursor: "pointer",
                padding: "20px 16px", borderRadius: "var(--radius-md)",
                background: activeCat === c.id ? "var(--brand-primary)" : "var(--surf)",
                color: activeCat === c.id ? "var(--bg)" : "var(--text)",
                border: activeCat === c.id ? "none" : "1px solid var(--border)",
                fontSize: 16, fontWeight: 700, textAlign: "center",
              }}
            >
              {c.name}
            </button>
          ))}
        </aside>

        <main style={{ overflow: "auto", padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {active?.items.map((mi) => {
              const price = mi.isPromo && mi.promoPrice ? mi.promoPrice : mi.price;
              return (
                <button key={mi.id} onClick={() => tap(mi)}
                  style={{ all: "unset", cursor: "pointer",
                    background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                    padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ aspectRatio: "4 / 3", borderRadius: "var(--radius-sm)", background: mi.image ? `url(${mi.image}) center/cover` : "linear-gradient(135deg, var(--surf2), var(--surf3))" }} />
                  <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>{mi.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)" }}>{fmt(price)}</div>
                    <span style={{ background: "var(--brand-primary)", color: "var(--bg)", borderRadius: 10, padding: 4, display: "flex" }}>
                      <IconPlus size={20} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </main>
      </div>

      <footer style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
        <button
          disabled={qty === 0}
          onClick={() => router.push(`/checkout?t=${orderType}`)}
          style={{
            width: "100%", padding: 20,
            background: "var(--brand-primary)", color: "var(--bg)",
            border: "none", borderRadius: "var(--radius-md)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            opacity: qty === 0 ? 0.4 : 1, cursor: qty === 0 ? "not-allowed" : "pointer",
            fontSize: 18, fontWeight: 900,
          }}
        >
          <span>{qty === 0 ? "Carrito vacío" : `${qty} producto${qty === 1 ? "" : "s"} · ${fmt(total)}`}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>Continuar <IconArrow size={24} /></span>
        </button>
      </footer>

      {picking && (
        <VariantPicker
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(v) => addItem(picking, v)}
        />
      )}
    </div>
  );
}
