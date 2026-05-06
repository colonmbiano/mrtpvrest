"use client";
import React, { useState } from "react";
import BaseModal from "@/components/ui/BaseModal";
import Button from "@/components/ui/Button";
import { Monitor, Info } from "lucide-react";

interface KDSConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initialData?: any;
}

export default function KDSConfigModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: KDSConfigModalProps) {
  const [name, setName] = useState(initialData?.name || "KDS Principal");
  const [ip, setIp] = useState(initialData?.ip || "");
  const [port, setPort] = useState(initialData?.port || 9100);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({
        ...initialData,
        name,
        type: "KITCHEN",
        connectionType: "NETWORK",
        ip: ip || "0.0.0.0",
        port: parseInt(String(port), 10) || 9100,
        isVirtual: !ip,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Monitor size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight">Vincular Pantalla KDS</span>
            <span className="text-[10px] uppercase tracking-widest text-amber-500/80 font-black">App Nativa / IP Local</span>
          </div>
        </div>
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex gap-4 items-start">
          <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-zinc-400">
            Ingresa la <strong className="text-amber-500">IP local de la aplicación KDS</strong> instalada en tu terminal de cocina. El sistema enviará los pedidos directamente a esa IP a través de la red local.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 ml-1">
              Nombre de la Estación
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-all"
              placeholder="Ej. KDS Parrilla"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 ml-1">
                Dirección IP Física
              </label>
              <input
                required
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-all"
                placeholder="192.168.1.x"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 ml-1">
                Puerto
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 9100)}
                className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={loading}
            className="flex-[2] h-14 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs shadow-lg shadow-amber-500/20"
          >
            Vincular KDS
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}
