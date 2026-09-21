"use client";

import React, { useId, useRef, useState } from "react";
import { parseKitchenLayout, legacyKitchenLayout, type BlockType, type TicketBlock } from "@/lib/kitchen-layout";
import { Reorder } from "framer-motion";
import { GripVertical, Plus, Trash2, X } from "lucide-react";

export type { BlockType, TicketBlock } from "@/lib/kitchen-layout";
export const DEFAULT_KITCHEN_LAYOUT = legacyKitchenLayout();

const BLOCK_LABELS: Record<BlockType, string> = {
  TITLE: "Título (Mesa/Cliente)",
  ORDER_INFO: "Datos de Orden",
  ITEMS: "Lista de Platillos",
  DIVIDER: "Línea Divisora",
  TEXT: "Texto Libre",
  FOOTER: "Pie de Comanda"
};

interface BlockEditorProps {
  layoutJson: string;
  defaultLayout?: TicketBlock[];
  onChange: (json: string) => void;
}

export default function BlockEditor({ layoutJson, onChange, defaultLayout = DEFAULT_KITCHEN_LAYOUT }: BlockEditorProps) {
  let initialBlocks = parseKitchenLayout(layoutJson);

  if (initialBlocks.length === 0) {
    initialBlocks = defaultLayout;
  }

  const blocks = initialBlocks;
  const [editingId, setEditingId] = useState<string | null>(null);
  const idPrefix = useId();
  const nextBlockId = useRef(0);

  const save = (newBlocks: TicketBlock[]) => {
    onChange(JSON.stringify(newBlocks));
  };

  const onReorder = (newOrder: TicketBlock[]) => {
    save(newOrder);
  };

  const addBlock = (type: BlockType) => {
    const newBlock: TicketBlock = {
      id: `${idPrefix}-block-${nextBlockId.current++}`,
      type,
    };
    if (type === "TITLE") { newBlock.showTable = true; newBlock.showCustomer = true; newBlock.showStation = true; newBlock.size = "large"; }
    if (type === "ORDER_INFO") { newBlock.showOrderNumber = true; newBlock.showTime = true; newBlock.showType = true; }
    if (type === "ITEMS") { newBlock.showModifiers = true; newBlock.showNotes = true; newBlock.size = "large"; newBlock.weight = "bold"; }
    if (type === "DIVIDER") { newBlock.char = "-"; }
    if (type === "TEXT") { newBlock.text = "Nuevo texto"; }

    save([...blocks, newBlock]);
  };

  const removeBlock = (id: string) => {
    save(blocks.filter(b => b.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateBlock = (id: string, updates: Partial<TicketBlock>) => {
    save(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const editingBlock = blocks.find(b => b.id === editingId);

  return (
    <div className="flex gap-4 items-start">
      {/* Canvas */}
      <div className="flex-1 rounded-2xl bg-zinc-300/10 border border-white/5 p-4 min-h-[400px]">
        <h3 className="text-[11px] font-semibold text-iris-500 uppercase tracking-[0.14em] mb-4">Lienzo de Comanda</h3>
        <Reorder.Group axis="y" values={blocks} onReorder={onReorder} className="space-y-2">
          {blocks.map((block) => (
            <Reorder.Item key={block.id} value={block} className="relative">
              <div
                onClick={() => setEditingId(block.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none
                  ${editingId === block.id ? "bg-iris-500/20 border-iris-500" : "bg-[var(--surface-1)] border-white/5 hover:border-white/20"}
                `}
              >
                <div className="cursor-grab text-zinc-500 hover:text-white"><GripVertical size={16} /></div>
                <div className="flex-1 flex flex-col">
                  <span className="text-[13px] font-bold text-white">{BLOCK_LABELS[block.type]}</span>
                  <span className="text-[11px] text-zinc-400">
                    {block.type === "DIVIDER" ? `Carácter: ${block.char}` :
                     block.type === "TEXT" ? `"${block.text}"` :
                     "Clic para configurar"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                  className="p-2 text-zinc-500 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>

        <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-2">
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map(type => (
            <button
              type="button"
              key={type}
              onClick={() => addBlock(type)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-1)] border border-white/5 hover:border-iris-glow text-[11px] font-semibold text-zinc-300 transition-colors"
            >
              <Plus size={12} /> {BLOCK_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Side Panel for Config */}
      {editingBlock && (
        <div className="w-[300px] shrink-0 rounded-2xl bg-zinc-300/10 border border-white/5 p-4 relative">
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="absolute top-4 right-4 p-1 rounded hover:bg-white/10"
          >
            <X size={16} />
          </button>
          <h3 className="text-[11px] font-semibold text-iris-500 uppercase tracking-[0.14em] mb-4">
            Editando: {BLOCK_LABELS[editingBlock.type]}
          </h3>

          <div className="space-y-4">
            {editingBlock.type === "TITLE" && (
              <>
                <Toggle label="Mostrar Mesa" checked={!!editingBlock.showTable} onChange={v => updateBlock(editingBlock.id, { showTable: v })} />
                <Toggle label="Mostrar Cliente" checked={!!editingBlock.showCustomer} onChange={v => updateBlock(editingBlock.id, { showCustomer: v })} />
                <Toggle label="Mostrar Estación" checked={!!editingBlock.showStation} onChange={v => updateBlock(editingBlock.id, { showStation: v })} />
                <div>
                  <label className="text-[11px] text-zinc-400 mb-1 block">Tamaño de Mesa/Cliente</label>
                  <select
                    value={editingBlock.size || "large"}
                    onChange={e => updateBlock(editingBlock.id, { size: e.target.value as TicketBlock["size"] })}
                    className="w-full bg-[var(--surface-1)] border border-white/5 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="normal">Normal (1x)</option>
                    <option value="large">Grande (2x)</option>
                    <option value="xlarge">Extra (3x)</option>
                  </select>
                </div>
              </>
            )}

            {editingBlock.type === "ORDER_INFO" && (
              <>
                <Toggle label="Número de Orden" checked={!!editingBlock.showOrderNumber} onChange={v => updateBlock(editingBlock.id, { showOrderNumber: v })} />
                <Toggle label="Hora" checked={!!editingBlock.showTime} onChange={v => updateBlock(editingBlock.id, { showTime: v })} />
                <Toggle label="Tipo de Orden" checked={!!editingBlock.showType} onChange={v => updateBlock(editingBlock.id, { showType: v })} />
              </>
            )}

            {editingBlock.type === "ITEMS" && (
              <>
                <Toggle label="Mostrar Modificadores" checked={!!editingBlock.showModifiers} onChange={v => updateBlock(editingBlock.id, { showModifiers: v })} />
                <Toggle label="Mostrar Notas" checked={!!editingBlock.showNotes} onChange={v => updateBlock(editingBlock.id, { showNotes: v })} />
                <Toggle label="Agrupar por Comensal" checked={!!editingBlock.groupBySeat} onChange={v => updateBlock(editingBlock.id, { groupBySeat: v })} />
                <div>
                  <label className="text-[11px] text-zinc-400 mb-1 block">Tamaño Platillos</label>
                  <select
                    value={editingBlock.size || "normal"}
                    onChange={e => updateBlock(editingBlock.id, { size: e.target.value as TicketBlock["size"] })}
                    className="w-full bg-[var(--surface-1)] border border-white/5 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="normal">Normal (1x)</option>
                    <option value="large">Grande (2x)</option>
                    <option value="xlarge">Extra (3x)</option>
                  </select>
                </div>
              </>
            )}

            {editingBlock.type === "DIVIDER" && (
              <div>
                <label className="text-[11px] text-zinc-400 mb-1 block">Carácter (Ej: - o =)</label>
                <input
                  type="text"
                  maxLength={1}
                  value={editingBlock.char || "-"}
                  onChange={e => updateBlock(editingBlock.id, { char: e.target.value })}
                  className="w-full bg-[var(--surface-1)] border border-white/5 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            )}

            {editingBlock.type === "TEXT" && (
              <div>
                <label className="text-[11px] text-zinc-400 mb-1 block">Texto</label>
                <input
                  type="text"
                  value={editingBlock.text || ""}
                  onChange={e => updateBlock(editingBlock.id, { text: e.target.value })}
                  className="w-full bg-[var(--surface-1)] border border-white/5 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            )}

            {editingBlock.type === "FOOTER" && (
              <p className="text-[11px] text-zinc-400">Imprime el texto configurado en “Pie de comanda” de los ajustes generales.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-1)] border border-white/5 hover:border-iris-glow transition-all">
      <span className="text-[11px] font-bold text-zinc-300 text-left leading-tight">{label}</span>
      <div className={`shrink-0 w-8 h-4 rounded-full relative transition-colors ${checked ? "bg-iris-500" : "bg-zinc-700"}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${checked ? "right-0.5" : "left-0.5"}`} />
      </div>
    </button>
  );
}
