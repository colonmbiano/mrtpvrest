"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import api from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// PANTALLA DEMOS — crea cuentas demo funcionales con el menú del cliente
// (extraído por IA de una foto) y su banner del negocio. Pensada para usarse
// desde el celular: subes fotos, revisas el menú, un botón y quedan las
// credenciales + links listos para compartir por WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────

interface Plan { id: string; name: string; displayName: string; price: number }
interface SeedItem { name: string; price: number; description?: string }
interface SeedCategory { name: string; items: SeedItem[] }

interface DemoResult {
  tenant: { id: string; name: string; slug: string };
  menu: { categories: number; items: number };
  bannerUrl: string | null;
  logoUrl: string | null;
  credentials: { email: string; password: string; tpvPin: string; adminUrl: string };
  storeUrl: string;
  plan: { name: string; displayName: string };
  trial: { days: number; endsAt: string };
}

interface DemoRow {
  id: string; name: string; slug: string; logoUrl: string | null;
  storeUrl: string; daysLeft: number | null;
  subscription: { status: string } | null;
}

const BUSINESS_TYPES = [
  { value: "RESTAURANT", label: "Restaurante" },
  { value: "GROCERY",    label: "Abarrotes / Tienda" },
  { value: "BUTCHER",    label: "Carnicería" },
  { value: "POULTRY",    label: "Pollería" },
  { value: "OTHER",      label: "Otro" },
];

const inputStyle: CSSProperties = {
  background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "9px 12px", fontSize: 13, color: "var(--text)", outline: "none", width: "100%",
};
const labelStyle: CSSProperties = {
  fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px",
  marginBottom: 6, display: "block",
};

export default function DemosPage() {
  // Negocio
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName]       = useState("");
  const [businessType, setBusinessType] = useState("RESTAURANT");
  const [planId, setPlanId]             = useState("");
  const [demoDays, setDemoDays]         = useState(7);
  const [enableWebStore, setEnableWebStore] = useState(true);
  const [plans, setPlans]               = useState<Plan[]>([]);

  // Menú
  const [menu, setMenu]           = useState<SeedCategory[]>([]);
  const [menuFiles, setMenuFiles] = useState<File[]>([]);
  const [scanning, setScanning]   = useState(false);

  // Imágenes del negocio
  const [banner, setBanner] = useState<File | null>(null);
  const [logo, setLogo]     = useState<File | null>(null);

  // Estado general
  const [creating, setCreating] = useState(false);
  const [result, setResult]     = useState<DemoResult | null>(null);
  const [demos, setDemos]       = useState<DemoRow[]>([]);
  const [toast, setToast]       = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg); toastTimer.current = setTimeout(() => setToast(""), 2800);
  }

  async function loadDemos() {
    const { data } = await api.get<DemoRow[]>("/api/saas/demos").catch(() => ({ data: [] as DemoRow[] }));
    setDemos(data);
  }

  useEffect(() => {
    api.get<Plan[]>("/api/saas/plans").then(({ data }) => {
      setPlans(data);
      if (data[0]) setPlanId(data.find(p => p.name === "BASIC")?.id ?? data[0].id);
    }).catch(() => {});
    loadDemos();
  }, []);

  // ── Menú: escaneo por IA ───────────────────────────────────────────────────
  async function scanMenu() {
    if (menuFiles.length === 0) { showToast("Sube al menos una foto del menú"); return; }
    setScanning(true);
    try {
      const fd = new FormData();
      menuFiles.forEach(f => fd.append("images", f));
      const { data } = await api.post<{ menu: SeedCategory[]; items: number }>(
        "/api/saas/demos/scan-menu", fd, { headers: { "Content-Type": "multipart/form-data" } },
      );
      setMenu(data.menu ?? []);
      showToast(`Menú detectado: ${data.items ?? 0} platillos`);
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "No se pudo analizar el menú");
    } finally {
      setScanning(false);
    }
  }

  // ── Menú: edición manual ───────────────────────────────────────────────────
  function updateCatName(ci: number, name: string) {
    setMenu(m => m.map((c, i) => i === ci ? { ...c, name } : c));
  }
  function updateItem(ci: number, ii: number, field: "name" | "price", value: string) {
    setMenu(m => m.map((c, i) => i !== ci ? c : {
      ...c,
      items: c.items.map((it, j) => {
        if (j !== ii) return it;
        return field === "price" ? { ...it, price: Number(value) || 0 } : { ...it, name: value };
      }),
    }));
  }
  function removeItem(ci: number, ii: number) {
    setMenu(m => m.map((c, i) => i !== ci ? c : { ...c, items: c.items.filter((_, j) => j !== ii) }));
  }
  function addItem(ci: number) {
    setMenu(m => m.map((c, i) => i !== ci ? c : { ...c, items: [...c.items, { name: "", price: 0 }] }));
  }
  function removeCat(ci: number) {
    setMenu(m => m.filter((_, i) => i !== ci));
  }
  function addCat() {
    setMenu(m => [...m, { name: "Nueva categoría", items: [{ name: "", price: 0 }] }]);
  }

  const menuItemCount = menu.reduce((n, c) => n + c.items.filter(i => i.name.trim()).length, 0);

  // ── Crear demo ─────────────────────────────────────────────────────────────
  async function createDemo() {
    if (businessName.trim().length < 2) { showToast("Escribe el nombre del negocio"); return; }
    setCreating(true);
    try {
      // Limpiamos el menú de items sin nombre y categorías vacías.
      const cleanMenu = menu
        .map(c => ({ name: c.name.trim(), items: c.items.filter(i => i.name.trim()).map(i => ({ ...i, name: i.name.trim() })) }))
        .filter(c => c.name && c.items.length > 0);

      const payload = {
        businessName: businessName.trim(),
        ownerName: ownerName.trim() || undefined,
        planId: planId || undefined,
        businessType,
        demoDays,
        enableWebStore,
        menu: cleanMenu,
      };

      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      if (banner) fd.append("banner", banner);
      if (logo) fd.append("logo", logo);

      const { data } = await api.post<DemoResult>("/api/saas/demos", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      showToast("¡Demo creada!");
      loadDemos();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "No se pudo crear la demo");
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setResult(null);
    setBusinessName(""); setOwnerName(""); setMenu([]); setMenuFiles([]);
    setBanner(null); setLogo(null); setDemoDays(7);
  }

  async function deleteDemo(id: string, name: string) {
    if (!confirm(`¿Eliminar la demo "${name}" y todos sus datos?`)) return;
    try {
      await api.delete(`/api/saas/tenants/${id}`);
      showToast("Demo eliminada");
      loadDemos();
    } catch {
      showToast("No se pudo eliminar");
    }
  }

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(() => showToast(`${what} copiado`)).catch(() => {});
  }

  function shareWhatsApp(r: DemoResult) {
    const msg =
      `¡Hola! Aquí está tu demo de *${r.tenant.name}* 🎉\n\n` +
      `🛒 Tienda online: ${r.storeUrl}\n` +
      `🖥️ Panel admin: ${r.credentials.adminUrl}\n` +
      `📧 Usuario: ${r.credentials.email}\n` +
      `🔑 Contraseña: ${r.credentials.password}\n` +
      `📟 PIN del TPV: ${r.credentials.tpvPin}\n\n` +
      `La demo está activa por ${r.trial.days} días.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  // ── Resultado ──────────────────────────────────────────────────────────────
  if (result) {
    const c = result.credentials;
    const Row = ({ label, value }: { label: string; value: string }) => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>{label}</div>
          <div style={{ fontSize: 13, fontFamily: "DM Mono,monospace", color: "var(--text)", wordBreak: "break-all" }}>{value}</div>
        </div>
        <button className="db-btn" style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }} onClick={() => copy(value, label)}>Copiar</button>
      </div>
    );
    return (
      <>
        <div className="db-topbar">
          <div className="db-topbar-left"><h1>Demo creada ✅</h1><p>{result.tenant.name}</p></div>
        </div>
        <div className="db-content" style={{ maxWidth: 560 }}>
          <div className="db-card">
            <div className="db-card-header"><div className="db-card-title">Credenciales y links</div></div>
            <div className="db-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Row label="Tienda online" value={result.storeUrl} />
              <Row label="Panel admin" value={c.adminUrl} />
              <Row label="Usuario (email)" value={c.email} />
              <Row label="Contraseña" value={c.password} />
              <Row label="PIN del TPV" value={c.tpvPin} />
              <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--text3)", fontFamily: "DM Mono,monospace", padding: "4px 2px" }}>
                <span>Plan: {result.plan.displayName}</span>
                <span>·</span>
                <span>Menú: {result.menu.items} platillos</span>
                <span>·</span>
                <span>Demo: {result.trial.days} días</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="db-btn db-btn-orange" style={{ flex: 1 }} onClick={() => shareWhatsApp(result)}>📱 Compartir por WhatsApp</button>
                <button className="db-btn" style={{ flex: 1 }} onClick={resetForm}>Crear otra</button>
              </div>
            </div>
          </div>
        </div>
        <div className={`db-toast ${toast ? "show" : ""}`}>{toast}</div>
      </>
    );
  }

  // ── Formulario ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>Demos</h1>
          <p>Crea una demo funcional con el menú y el banner del cliente</p>
        </div>
      </div>

      <div className="db-content" style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 1 · Negocio */}
        <div className="db-card">
          <div className="db-card-header"><div className="db-card-title">1 · Datos del negocio</div></div>
          <div className="db-card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Nombre del negocio *</label>
              <input style={inputStyle} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Tacos El Güero" />
            </div>
            <div>
              <label style={labelStyle}>Nombre del dueño</label>
              <input style={inputStyle} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <label style={labelStyle}>Giro</label>
              <select style={inputStyle} value={businessType} onChange={e => setBusinessType(e.target.value)}>
                {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Plan</label>
              <select style={inputStyle} value={planId} onChange={e => setPlanId(e.target.value)}>
                {plans.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Días de demo</label>
              <input type="number" min={1} max={90} style={inputStyle} value={demoDays} onChange={e => setDemoDays(Number(e.target.value))} />
            </div>
            <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
              <input type="checkbox" checked={enableWebStore} onChange={e => setEnableWebStore(e.target.checked)} style={{ accentColor: "var(--orange)" }} />
              Activar tienda online (recomendado para demostrar el flujo de pedido)
            </label>
          </div>
        </div>

        {/* 2 · Menú del cliente */}
        <div className="db-card">
          <div className="db-card-header"><div className="db-card-title">2 · Menú del cliente</div></div>
          <div className="db-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.6 }}>
              Sube fotos del menú físico y la IA extrae categorías, platillos y precios. Puedes editarlos antes de crear la demo.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label className="db-btn" style={{ cursor: "pointer" }}>
                📷 Elegir fotos
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                  onChange={e => setMenuFiles(Array.from(e.target.files ?? []))} />
              </label>
              {menuFiles.length > 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>{menuFiles.length} foto(s)</span>}
              <button className="db-btn db-btn-orange" disabled={scanning || menuFiles.length === 0} onClick={scanMenu}>
                {scanning ? "Analizando…" : "Escanear con IA"}
              </button>
            </div>

            {menu.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {menu.map((cat, ci) => (
                  <div key={ci} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--surface2)" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                      <input style={{ ...inputStyle, fontWeight: 600 }} value={cat.name} onChange={e => updateCatName(ci, e.target.value)} />
                      <button className="db-btn" style={{ padding: "6px 10px", fontSize: 11, color: "var(--red)", borderColor: "var(--red-dim)" }} onClick={() => removeCat(ci)}>✕</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {cat.items.map((it, ii) => (
                        <div key={ii} style={{ display: "flex", gap: 8 }}>
                          <input style={{ ...inputStyle, flex: 1 }} placeholder="Platillo" value={it.name} onChange={e => updateItem(ci, ii, "name", e.target.value)} />
                          <input type="number" min={0} step="0.01" style={{ ...inputStyle, width: 100 }} placeholder="$" value={it.price} onChange={e => updateItem(ci, ii, "price", e.target.value)} />
                          <button className="db-btn" style={{ padding: "6px 10px", fontSize: 11 }} onClick={() => removeItem(ci, ii)}>✕</button>
                        </div>
                      ))}
                      <button className="db-btn" style={{ alignSelf: "flex-start", padding: "5px 10px", fontSize: 11 }} onClick={() => addItem(ci)}>+ Platillo</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="db-btn" style={{ alignSelf: "flex-start" }} onClick={addCat}>+ Agregar categoría</button>
            {menuItemCount > 0 && <div style={{ fontSize: 12, color: "var(--green)", fontFamily: "DM Mono,monospace" }}>{menuItemCount} platillos listos</div>}
          </div>
        </div>

        {/* 3 · Imagen del negocio */}
        <div className="db-card">
          <div className="db-card-header"><div className="db-card-title">3 · Banner y logo del negocio</div></div>
          <div className="db-card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Banner (16:9)</label>
              {banner
                ? <img src={URL.createObjectURL(banner)} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                : <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 8, border: "1px dashed var(--border)", background: "var(--surface2)" }} />}
              <label className="db-btn" style={{ cursor: "pointer", marginTop: 8, display: "inline-block" }}>
                {banner ? "Cambiar" : "Subir banner"}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => setBanner(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div>
              <label style={labelStyle}>Logo (opcional)</label>
              {logo
                ? <img src={URL.createObjectURL(logo)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 12, border: "1px solid var(--border)" }} />
                : <div style={{ width: 80, height: 80, borderRadius: 12, border: "1px dashed var(--border)", background: "var(--surface2)" }} />}
              <label className="db-btn" style={{ cursor: "pointer", marginTop: 8, display: "inline-block" }}>
                {logo ? "Cambiar" : "Subir logo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => setLogo(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
        </div>

        <button className="db-btn db-btn-orange" style={{ padding: "12px", fontSize: 14, fontWeight: 600 }} disabled={creating} onClick={createDemo}>
          {creating ? "Creando demo…" : "🚀 Crear demo funcional"}
        </button>

        {/* Demos existentes */}
        {demos.length > 0 && (
          <div className="db-card">
            <div className="db-card-header"><div className="db-card-title">Demos activas ({demos.length})</div></div>
            <div className="db-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {demos.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "9px 12px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
                    <a href={d.storeUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--blue)", fontFamily: "DM Mono,monospace", wordBreak: "break-all" }}>{d.storeUrl}</a>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {d.daysLeft != null && (
                      <span className="db-badge" style={{ color: d.daysLeft > 0 ? "var(--green)" : "var(--red)" }}>
                        {d.daysLeft > 0 ? `${d.daysLeft}d` : "vencida"}
                      </span>
                    )}
                    <button className="db-btn" style={{ padding: "5px 10px", fontSize: 11, color: "var(--red)", borderColor: "var(--red-dim)" }} onClick={() => deleteDemo(d.id, d.name)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`db-toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}
