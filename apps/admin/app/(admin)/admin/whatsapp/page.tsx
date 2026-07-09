"use client";
import { useState } from "react";
import { PageShell, PageHeader, Segmented } from "@/components/ds";
import AssistantTab from "./_components/AssistantTab";
import ReportsTab from "./_components/ReportsTab";
import ContactsTab from "./_components/ContactsTab";
import CampaignsTab from "./_components/CampaignsTab";
import GamesTab from "./_components/GamesTab";
import UpsellTab from "./_components/UpsellTab";
import type { Tab } from "./_components/types";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "asistente", label: "Asistente (IA)" },
  { value: "reportes", label: "Reportes" },
  { value: "contactos", label: "Clientes" },
  { value: "campanas", label: "Campañas" },
  { value: "juegos", label: "Juegos" },
  { value: "sugerencias", label: "Sugerencias" },
];

export default function WhatsappPage() {
  const [tab, setTab] = useState<Tab>("reportes");

  return (
    <PageShell>
      <PageHeader
        eyebrow="Canal WhatsApp"
        title="WhatsApp Bot"
        subtitle="Asistente IA, clientes, campañas, juegos y reportes del canal WhatsApp"
      />

      {/* Tabs internas de la página (no son tabs de hub). */}
      <Segmented value={tab} onChange={setTab} options={TAB_OPTIONS} className="mb-5 md:max-w-2xl" />

      {tab === "asistente" && <AssistantTab />}
      {tab === "reportes" && <ReportsTab />}
      {tab === "contactos" && <ContactsTab />}
      {tab === "campanas" && <CampaignsTab />}
      {tab === "juegos" && <GamesTab />}
      {tab === "sugerencias" && <UpsellTab />}
    </PageShell>
  );
}
