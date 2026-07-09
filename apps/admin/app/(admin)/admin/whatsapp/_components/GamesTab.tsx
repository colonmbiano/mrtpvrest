"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, X, Pencil } from "lucide-react";
import api from "@/lib/api";
import {
  Card, SectionHead, Pill, Toggle, Button, IconButton, Field, Input, Select,
  LoadingState, ErrorState, EmptyState, useToast, useConfirm,
} from "@/components/ds";
import { emptyGame, emptyPrize, type Game, type Prize } from "./types";

export default function GamesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get("/api/whatsapp/marketing/games");
      setGames(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
      toast.error("Error al cargar juegos");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Ponle un nombre al juego"); return; }
    setSaving(true);
    try {
      await api.post("/api/whatsapp/marketing/games", editing);
      toast.success("Juego guardado");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: "¿Eliminar este juego?", danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete(`/api/whatsapp/marketing/games/${id}`);
      toast.success("Juego eliminado");
      load();
    } catch {
      toast.error("Error al eliminar");
    }
  };

  if (loading) return <LoadingState label="Cargando juegos…" />;
  if (error) return <ErrorState hint="No pudimos cargar tus juegos promocionales." onRetry={load} />;

  if (editing) return <GameEditor game={editing} setGame={setEditing} onSave={save} onCancel={() => setEditing(null)} saving={saving} />;

  return (
    <div className="space-y-4">
      <Button icon={Plus} onClick={() => setEditing(emptyGame())}>
        Nuevo juego
      </Button>

      {games.length === 0 ? (
        <EmptyState
          title="No tienes juegos promocionales."
          hint="Crea uno para que tus clientes ganen cupones desde WhatsApp."
          action={<Button icon={Plus} onClick={() => setEditing(emptyGame())}>Nuevo juego</Button>}
        />
      ) : (
        games.map((g) => (
          <Card key={g.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-display font-extrabold text-tx-hi">{g.name}</span>
                <Pill tone={g.enabled ? "ok" : "neutral"} live={g.enabled}>
                  {g.enabled ? "Activo" : "Inactivo"}
                </Pill>
              </div>
              <p className="mt-1 text-[11px] text-tx-mut">
                {g.prizes.length} premios · {g.trigger === "ON_ORDER" ? "Tras el pedido" : "Por comando «premio»"} ·
                {g.maxPerContact > 0 ? ` ${g.maxPerContact} jugada(s)/cliente` : " ilimitado"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <IconButton icon={Pencil} label="Editar juego" onClick={() => setEditing(g)} size={40} />
              <IconButton icon={Trash2} label="Borrar juego" onClick={() => remove(g.id)} danger size={40} />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function GameEditor({
  game, setGame, onSave, onCancel, saving,
}: {
  game: Game;
  setGame: (g: Game) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const setPrize = (i: number, patch: Partial<Prize>) => {
    const prizes = game.prizes.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    setGame({ ...game, prizes });
  };
  const addPrize = () => setGame({ ...game, prizes: [...game.prizes, emptyPrize()] });
  const removePrize = (i: number) => setGame({ ...game, prizes: game.prizes.filter((_, idx) => idx !== i) });

  return (
    <div className="max-w-2xl space-y-5">
      <Card className="space-y-4 p-5">
        <Field label="Nombre del juego" className="mb-0">
          <Input value={game.name} onChange={(e) => setGame({ ...game, name: e.target.value })} placeholder="Ruleta de la suerte" />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="¿Cuándo se juega?" className="mb-0">
            <Select value={game.trigger} onChange={(e) => setGame({ ...game, trigger: e.target.value as Game["trigger"] })}>
              <option value="ON_COMMAND">Cuando escriben «premio»</option>
              <option value="ON_ORDER">Automático tras el pedido</option>
            </Select>
          </Field>
          <Field label="Jugadas por cliente (0 = ilimitado)" className="mb-0">
            <Input type="number" min={0} value={game.maxPerContact} onChange={(e) => setGame({ ...game, maxPerContact: parseInt(e.target.value, 10) || 0 })} />
          </Field>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-tx">Juego activo</span>
          <Toggle checked={game.enabled} onChange={(v) => setGame({ ...game, enabled: v })} label="Juego activo" />
        </div>
      </Card>

      <div>
        <SectionHead title="Premios" action="+ Premio" onAction={addPrize} />
        <p className="mb-3 text-[11px] text-tx-mut">
          El «peso» define la probabilidad relativa de cada premio. Usa tipo «Nada» con peso alto para que ganar sea ocasional.
        </p>
        <div className="space-y-3">
          {game.prizes.map((p, i) => (
            <Card key={i} className="space-y-3 p-4">
              <div className="flex items-end gap-2">
                <Field label="Premio" className="mb-0 flex-1">
                  <Input value={p.label} onChange={(e) => setPrize(i, { label: e.target.value })} placeholder="10% de descuento" />
                </Field>
                <IconButton icon={X} label="Quitar premio" onClick={() => removePrize(i)} danger size={44} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Tipo" className="mb-0">
                  <Select value={p.type} onChange={(e) => setPrize(i, { type: e.target.value as Prize["type"] })}>
                    <option value="PERCENTAGE">% descuento</option>
                    <option value="FIXED">$ descuento</option>
                    <option value="NONE">Nada (sigue)</option>
                  </Select>
                </Field>
                <Field label="Valor" className="mb-0">
                  <Input type="number" min={0} value={p.value} disabled={p.type === "NONE"} onChange={(e) => setPrize(i, { value: Number(e.target.value) || 0 })} className="disabled:opacity-50" />
                </Field>
                <Field label="Peso" className="mb-0">
                  <Input type="number" min={0} value={p.weight} onChange={(e) => setPrize(i, { weight: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Vence (días)" className="mb-0">
                  <Input type="number" min={1} value={p.expiresInDays} onChange={(e) => setPrize(i, { expiresInDays: parseInt(e.target.value, 10) || 7 })} />
                </Field>
              </div>
              {p.type !== "NONE" && (
                <Field label="Compra mínima para usar el cupón" className="mb-0">
                  <Input type="number" min={0} value={p.minOrderAmount} onChange={(e) => setPrize(i, { minOrderAmount: Number(e.target.value) || 0 })} />
                </Field>
              )}
            </Card>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onSave} loading={saving}>
          {saving ? "Guardando…" : "Guardar juego"}
        </Button>
      </div>
    </div>
  );
}
