"use client";
import { useEffect, useState, useCallback } from "react";
import { Users, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import {
  StatTile, DataTable, LoadingState, ErrorState, EmptyState, useToast, type Col,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { fecha, type Contact } from "./types";

export default function ContactsTab() {
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<{ total: number; optedIn: number }>({ total: 0, optedIn: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get("/api/whatsapp/marketing/contacts");
      setContacts(data.contacts || []);
      setStats(data.stats || { total: 0, optedIn: 0 });
    } catch {
      setError(true);
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const cols: Col<Contact>[] = [
    {
      key: "name", header: "Cliente",
      render: (c) => (
        <span className="font-bold text-tx">
          {c.name || "Cliente"}
          {!c.optIn && <span className="ml-2 text-[9px] uppercase" style={{ color: "var(--err)" }}>sin marketing</span>}
        </span>
      ),
    },
    { key: "phone", header: "Teléfono", mono: true, render: (c) => <span className="text-tx-mut">{c.phone}</span> },
    { key: "orderCount", header: "Pedidos", align: "center", render: (c) => <span className="text-tx">{c.orderCount}</span> },
    { key: "totalSpent", header: "Gastado", align: "right", mono: true, render: (c) => <span className="font-bold text-primary">{formatMoney(c.totalSpent)}</span> },
    { key: "last", header: "Último", render: (c) => <span className="text-xs text-tx-mut">{fecha(c.lastOrderAt)}</span> },
  ];

  if (loading) return <LoadingState label="Cargando clientes…" />;
  if (error) return <ErrorState hint="No pudimos cargar tus clientes de WhatsApp." onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Users} value={String(stats.total)} label="Total de clientes" />
        <StatTile icon={CheckCircle2} value={String(stats.optedIn)} label="Aceptan marketing" />
      </div>
      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aún no tienes clientes registrados."
          hint="Se irán creando solos cuando lleguen pedidos por WhatsApp."
        />
      ) : (
        <DataTable columns={cols} rows={contacts} rowKey={(c) => c.id} />
      )}
    </div>
  );
}
