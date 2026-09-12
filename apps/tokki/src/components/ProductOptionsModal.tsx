"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, CircleDot, Cloud, Coffee, Crown, Droplets, IceCreamBowl, Leaf, Milk, Plus, Snowflake, Sparkles, StickyNote, Trash2, X } from "lucide-react";
import Image from "next/image";
import { toppingCell } from "../lib/topping-art";

type Variant = { id: string; name?: string; price?: number; isAvailable?: boolean };
type Modifier = { id: string; name: string; priceAdd?: number; isAvailable?: boolean };
type ModifierGroup = { id: string; name: string; required?: boolean; multiSelect?: boolean; min?: number; max?: number; modifiers?: Modifier[] };
type Product = { id: string; categoryId?: string; name: string; description?: string; imageUrl?: string; price: number; promoPrice?: number; variants?: Variant[]; modifierGroups?: ModifierGroup[] };

const fallbackGroups: ModifierGroup[] = [
  { id: "local-preparacion", name: "Preparación", required: true, modifiers: ["Sin hielo", "Normal", "Frappé"].map((name) => ({ id: `local-${name}`, name })) },
  { id: "local-base", name: "Base de tu creación", required: true, modifiers: [
    { id: "local-base-cremosa", name: "Base cremosa Toki" }, { id: "local-deslactosada", name: "Leche deslactosada" }, { id: "local-te-verde", name: "Té verde" }, { id: "local-te-negro", name: "Té negro" }, { id: "local-soda", name: "Soda italiana" },
    { id: "local-coco", name: "Leche de coco", priceAdd: 10 }, { id: "local-almendras", name: "Leche de almendras", priceAdd: 10 }, { id: "local-yogurt", name: "Yogur griego", priceAdd: 10 }, { id: "local-yakult", name: "Yakult", priceAdd: 10 },
  ] },
  { id: "local-sabor", name: "Sabor", required: true, modifiers: [
    "Taro", "Matcha", "Fresas con crema", "Coco", "Lavanda", "Nuez de macadamia", "Cookies and cream", "Plátano", "Capuchino", "Capuchino caramel", "Chocolate premium", "Mora azul (Cremoso)", "Mango (Cremoso)",
    "Fresa", "Mango (Frutal)", "Durazno", "Mora azul (Frutal)", "Frutos rojos", "Kiwi", "Manzana verde", "Lichi", "Guanábana", "Arándano"
  ].map((name) => ({ id: `local-${name}`, name })) },
  { id: "local-toque", name: "Toque final", required: true, modifiers: [
    "Sin acompañante", "Tapioca negra", "Popping boba de mango", "Popping boba de maracuyá", "Popping boba de fresa", "Popping boba de lichi", "Popping boba de mora azul", "Popping boba de kiwi", "Popping boba de durazno", "Popping boba de taro", "Popping boba de manzana verde", "Popping boba de piña colada", "Popping boba de limonada rosa", "Popping boba de uva", "Popping boba de chamoy", "Jelly"
  ].map((name) => ({ id: `local-${name}`, name })) },
  { id: "local-nivel", name: "Siguiente nivel", required: true, modifiers: [
    { id: "local-ninguno", name: "Ninguno" }, { id: "local-toki-cloud", name: "Toki Cloud", priceAdd: 15 }, { id: "local-cheese-cloud", name: "Toki Cheese Cloud", priceAdd: 15 }, { id: "local-extra-tapioca", name: "Extra tapioca negra", priceAdd: 15 }, { id: "local-extra-popping", name: "Extra popping boba", priceAdd: 15 },
  ] },
];
const stepNames = ["Preparación", "Base de tu creación", "Sabor", "Toque final", "Siguiente nivel"];

const basesEspeciales = ["Leche de coco", "Leche de almendras", "Yogur griego", "Yakult"];
const saboresFrutales = ["Fresa", "Mango (Frutal)", "Durazno", "Mora azul (Frutal)", "Frutos rojos", "Kiwi", "Manzana verde", "Lichi", "Guanábana", "Arándano"];
const saboresPopping = ["mango", "maracuyá", "fresa", "lichi", "mora azul", "kiwi", "durazno", "taro", "manzana verde", "piña colada", "limonada rosa", "uva", "chamoy"];

function OptionIcon({ name }: { name: string }) {
  const cell = toppingCell(name);
  if (cell !== null) return <span role="img" aria-label={name} className="topping-photo" style={{ backgroundPosition: `${(cell % 3) * 50}% ${cell < 3 ? 0 : 100}%` }} />;
  const value = name.toLowerCase();
  if (value.includes("frapp") || value.includes("hielo")) return <Snowflake />;
  if (value.includes("cloud") || value.includes("crema")) return <Cloud />;
  if (value.includes("leche") || value.includes("yogur")) return <Milk />;
  if (value.includes("té") || value.includes("matcha") || value.includes("aloe")) return <Leaf />;
  if (value.includes("tapioca") || value.includes("boba") || value.includes("jelly") || value.includes("chamoy") || value.includes("mango")) return <CircleDot />;
  if (value.includes("normal") || value.includes("soda") || value.includes("yakult")) return <Droplets />;
  if (["taro", "fresa", "kiwi", "durazno", "manzana", "frutos"].some((term) => value.includes(term))) return <IceCreamBowl />;
  return <Coffee />;
}
function initialSelections(groups: ModifierGroup[]) {
  return Object.fromEntries(groups.map((group) => {
    const first = (group.modifiers || []).find((item) => item.isAvailable !== false);
    return [group.id, first ? [first.id] : []];
  }));
}

export default function ProductOptionsModal({ product, companions = [], onClose, onAdd }: { product: Product; companions?: Product[]; onClose: () => void; onAdd: (item: Record<string, unknown>) => void }) {
  const availableCompanions = companions.length ? companions : [product];
  const [chosenProduct, setChosenProduct] = useState(product);
  const serverGroups = (chosenProduct.modifierGroups || []).filter((group) => (group.modifiers || []).some((item) => item.isAvailable !== false)).slice(0, 5);
  const groups = serverGroups.length ? serverGroups : fallbackGroups;
  const variants = (chosenProduct.variants || []).filter((item) => item.isAvailable !== false);
  const [variantId, setVariantId] = useState(variants[0]?.id || "");
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initialSelections(groups));
  const [notes, setNotes] = useState("");
  const [extraPoppingFlavor, setExtraPoppingFlavor] = useState(saboresPopping[0]);
  const selectedVariant = variants.find((item) => item.id === variantId);
  const selections = useMemo(() => groups.flatMap((group) => (selected[group.id] || []).map((id) => ({ group, modifier: group.modifiers?.find((item) => item.id === id) })).filter((item) => item.modifier)), [groups, selected]);
  
  const hasExtraPopping = selections.some(s => s.modifier?.name === "Extra popping boba");
  
  const total = Number(selectedVariant?.price ?? chosenProduct.promoPrice ?? chosenProduct.price) + selections.reduce((sum, item) => sum + Number(item.modifier?.priceAdd || 0), 0);
  const missingRequired = groups.some((group) => group.required && !(selected[group.id] || []).length);
  const completed = groups.filter((group) => (selected[group.id] || []).length > 0).length + 1;

  const chooseCompanion = (next: Product) => {
    const nextServerGroups = (next.modifierGroups || []).filter((group) => (group.modifiers || []).some((item) => item.isAvailable !== false)).slice(0, 5);
    const nextGroups = nextServerGroups.length ? nextServerGroups : fallbackGroups;
    const nextVariants = (next.variants || []).filter((item) => item.isAvailable !== false);
    setChosenProduct(next); setVariantId(nextVariants[0]?.id || ""); setSelected(initialSelections(nextGroups));
  };
  const toggle = (group: ModifierGroup, modifier: Modifier) => setSelected((current) => {
    const values = current[group.id] || [];
    if (!group.multiSelect) return { ...current, [group.id]: [modifier.id] };
    if (values.includes(modifier.id)) return { ...current, [group.id]: values.filter((id) => id !== modifier.id) };
    if (group.max && values.length >= group.max) return current;
    return { ...current, [group.id]: [...values, modifier.id] };
  });
  const add = () => {
    const localSummary = selections.filter(({ modifier }) => modifier!.id.startsWith("local-")).map(({ group, modifier }) => `${group.name}: ${modifier!.name}`).join(" · ");
    let finalNotes = [localSummary, notes.trim()].filter(Boolean).join(" | ");
    if (hasExtraPopping) {
      finalNotes = finalNotes ? `${finalNotes} | Sabor boba extra: ${extraPoppingFlavor}` : `Sabor boba extra: ${extraPoppingFlavor}`;
    }
    onAdd({ ...chosenProduct, menuItemId: chosenProduct.id, variantId: variantId || null, price: total, notes: finalNotes,
      modifiers: selections.filter(({ modifier }) => !modifier!.id.startsWith("local-")).map(({ group, modifier }) => ({ id: modifier!.id, groupId: group.id, name: modifier!.name, priceAdd: Number(modifier!.priceAdd || 0) })),
      options: { variant: selectedVariant?.name, toppings: selections.map(({ modifier }) => modifier!.name), notes: finalNotes } });
    onClose();
  };

  const renderGroupModifiers = (group: ModifierGroup) => {
    const mods = (group.modifiers || []).filter((item) => item.isAvailable !== false);
    
    if (group.name === "Base de tu creación") {
      const normalBases = mods.filter(m => !basesEspeciales.includes(m.name));
      const specialBases = mods.filter(m => basesEspeciales.includes(m.name));
      
      return (
        <>
          <div className="builder-choices">
            {normalBases.map((modifier) => { const active = (selected[group.id] || []).includes(modifier.id); return <button key={modifier.id} onClick={() => toggle(group, modifier)} className={active ? "selected" : ""} aria-pressed={active}><span className="option-art"><OptionIcon name={modifier.name} /></span><b>{modifier.name}</b><small>{Number(modifier.priceAdd || 0) ? `+$${Number(modifier.priceAdd).toFixed(0)}` : "Incluido"}</small>{active && <Check className="choice-check" />}</button>; })}
          </div>
          {specialBases.length > 0 && (
            <>
              <h3 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: 800, color: '#5B416F' }}>3.1 ¿Quieres algo diferente? Bases especiales</h3>
              <div className="builder-choices">
                {specialBases.map((modifier) => { const active = (selected[group.id] || []).includes(modifier.id); return <button key={modifier.id} onClick={() => toggle(group, modifier)} className={active ? "selected" : ""} aria-pressed={active}><span className="option-art"><OptionIcon name={modifier.name} /></span><b>{modifier.name}</b><small>{Number(modifier.priceAdd || 0) ? `+$${Number(modifier.priceAdd).toFixed(0)}` : "Incluido"}</small>{active && <Check className="choice-check" />}</button>; })}
              </div>
            </>
          )}
        </>
      );
    }
    
    if (group.name === "Sabor") {
      const cremosos = mods.filter(m => !saboresFrutales.includes(m.name));
      const frutales = mods.filter(m => saboresFrutales.includes(m.name));
      
      return (
        <>
          <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cremosos</h4>
          <div className="builder-choices">
            {cremosos.map((modifier) => { const active = (selected[group.id] || []).includes(modifier.id); return <button key={modifier.id} onClick={() => toggle(group, modifier)} className={active ? "selected" : ""} aria-pressed={active}><span className="option-art"><OptionIcon name={modifier.name} /></span><b>{modifier.name}</b><small>{Number(modifier.priceAdd || 0) ? `+$${Number(modifier.priceAdd).toFixed(0)}` : "Incluido"}</small>{active && <Check className="choice-check" />}</button>; })}
          </div>
          {frutales.length > 0 && (
            <>
              <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Frutales</h4>
              <div className="builder-choices">
                {frutales.map((modifier) => { const active = (selected[group.id] || []).includes(modifier.id); return <button key={modifier.id} onClick={() => toggle(group, modifier)} className={active ? "selected" : ""} aria-pressed={active}><span className="option-art"><OptionIcon name={modifier.name} /></span><b>{modifier.name}</b><small>{Number(modifier.priceAdd || 0) ? `+$${Number(modifier.priceAdd).toFixed(0)}` : "Incluido"}</small>{active && <Check className="choice-check" />}</button>; })}
              </div>
            </>
          )}
        </>
      );
    }
    
    return (
      <div className="builder-choices">
        {mods.map((modifier) => { const active = (selected[group.id] || []).includes(modifier.id); return <button key={modifier.id} onClick={() => toggle(group, modifier)} className={active ? "selected" : ""} aria-pressed={active}><span className="option-art"><OptionIcon name={modifier.name} /></span><b>{modifier.name}</b><small>{Number(modifier.priceAdd || 0) ? `+$${Number(modifier.priceAdd).toFixed(0)}` : "Incluido"}</small>{active && <Check className="choice-check" />}</button>; })}
      </div>
    );
  };

  return <div className="toki-builder" role="dialog" aria-modal="true" aria-labelledby="builder-title">
    <header className="builder-topbar">
      <button onClick={onClose} className="builder-back" aria-label="Volver"><ChevronLeft /></button>
      <div className="builder-logo"><Image src="/assets/tokki-mascot.png" alt="" width={40} height={40} /><span><b id="builder-title">CREA TU TOKI</b><small>Tu bebida, tus reglas</small></span></div>
      <div className="builder-progress"><span>{completed} de 6 pasos</span><div>{Array.from({ length: 6 }, (_, index) => <i key={index} className={index < completed ? "done" : ""} />)}</div></div>
      <button onClick={onClose} className="builder-close"><X /> Cerrar</button>
    </header>
    <div className="builder-layout">
      <main className="builder-steps">
        <section className="builder-step"><h2><span>1</span> Compañero <small>{chosenProduct.name}</small></h2><div className="builder-choices companions">
          {availableCompanions.map((item) => <button key={item.id} onClick={() => chooseCompanion(item)} className={chosenProduct.id === item.id ? "selected" : ""} aria-pressed={chosenProduct.id === item.id}>
            <span className="companion-art"><Image src={item.imageUrl || "/assets/tokki-mascot.png"} alt="" fill className="object-contain" />{item.name.toLowerCase().includes("king") && <Crown />}</span><b>{item.name}</b><small>${Number(item.promoPrice || item.price).toFixed(0)}</small>{chosenProduct.id === item.id && <Check className="choice-check" />}
          </button>)}
        </div></section>
        {groups.map((group, index) => <section key={group.id} className="builder-step">
          <h2><span>{index + 2}</span> {stepNames[index] || group.name} <small>{selections.filter((item) => item.group.id === group.id).map((item) => item.modifier!.name).join(" + ") || "Elige una opción"}</small></h2>
          {renderGroupModifiers(group)}
          {group.name === "Siguiente nivel" && hasExtraPopping && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#F7F1FD', borderRadius: '16px', border: '2px solid #E8DDF5' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#5B416F' }}>¿De qué sabor quieres tu boba extra?</h4>
              <select 
                value={extraPoppingFlavor} 
                onChange={(e) => setExtraPoppingFlavor(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #D1C4E9', background: '#fff', fontSize: '1rem', fontWeight: 600, color: '#4A345E', outline: 'none' }}
              >
                {saboresPopping.map(sabor => (
                  <option key={sabor} value={sabor}>{sabor.charAt(0).toUpperCase() + sabor.slice(1)}</option>
                ))}
              </select>
            </div>
          )}
        </section>)}
      </main>
      <aside className="builder-ticket"><header><Sparkles /><span><b>Tu Toki</b><small>Combinación personalizada</small></span></header><div className="builder-ticket-product"><Image src={chosenProduct.imageUrl || "/assets/tokki-mascot.png"} alt="" width={50} height={50} /><span><b>{chosenProduct.name}</b><small>Precio base</small></span><strong>${Number(chosenProduct.promoPrice || chosenProduct.price).toFixed(0)}</strong></div><ol>{selections.map(({ group, modifier }, index) => <li key={`${group.id}-${modifier!.id}`}><span><i>{index + 2}</i>{modifier!.name}</span>{Number(modifier!.priceAdd || 0) > 0 && <b>+${Number(modifier!.priceAdd).toFixed(0)}</b>}</li>)}</ol>
      {hasExtraPopping && (
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: '#744AAA', fontWeight: 600, background: '#F7F1FD', margin: '0.5rem 1rem', borderRadius: '8px' }}>
          Sabor extra: {extraPoppingFlavor.charAt(0).toUpperCase() + extraPoppingFlavor.slice(1)}
        </div>
      )}
      <label><StickyNote /><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={100} rows={2} placeholder="Agregar nota…" /></label><div className="builder-ticket-total"><span>Subtotal</span><b>${total.toFixed(2)}</b></div></aside>
    </div>
    <footer className="builder-footer"><div><Check /><span>Progreso<strong>{completed} de 6</strong></span></div><div className="builder-footer-total"><span>Total</span><strong>${total.toFixed(2)}</strong></div><button onClick={() => setSelected(Object.fromEntries(groups.map((group) => [group.id, []])))} className="builder-clear"><Trash2 /> Limpiar</button><button onClick={add} disabled={missingRequired} className="builder-add"><Plus /> Agregar al pedido <strong>${total.toFixed(0)}</strong></button></footer>
  </div>;
}
