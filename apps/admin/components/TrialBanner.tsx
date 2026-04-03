"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface TrialInfo {
  status: string;
  daysLeft: number | null;
  isExpired: boolean;
  plan: string;
}

export default function TrialBanner() {
  const router = useRouter();
  const [info, setInfo]       = useState<TrialInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    fetch(`${API}/api/tenant/subscription`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setInfo(data); })
      .catch(() => {});
  }, []);

  if (!info || info.status !== "TRIAL" || dismissed) return null;

  const { daysLeft, isExpired } = info;

  const urgent   = isExpired || (daysLeft !== null && daysLeft <= 1);
  const warning  = !urgent   && daysLeft !== null && daysLeft <= 3;
  const bg       = urgent  ? "bg-red-500/10 border-red-500/30"
                 : warning ? "bg-amber-500/10 border-amber-500/30"
                 :           "bg-orange-500/10 border-orange-500/30";
  const textCol  = urgent  ? "text-red-400"
                 : warning ? "text-amber-400"
                 :           "text-orange-400";
  const icon     = urgent  ? "🚨" : warning ? "⚠️" : "⏳";
  const message  = isExpired
    ? "Tu período de prueba venció. Reactiva tu cuenta para seguir recibiendo pedidos."
    : daysLeft === 0
    ? "Tu prueba vence hoy. Elige un plan para no perder el acceso."
    : `Tu prueba gratuita vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}.`;

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b ${bg} text-sm`}>
      <span className="flex items-center gap-2">
        <span>{icon}</span>
        <span className={`${textCol} font-semibold`}>{message}</span>
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => router.push("/admin/billing")}
          className={`${textCol} border border-current px-3 py-1 rounded-lg text-xs font-black hover:opacity-80 transition-opacity`}>
          Ver planes
        </button>
        {!isExpired && (
          <button onClick={() => setDismissed(true)}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none transition-colors">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
