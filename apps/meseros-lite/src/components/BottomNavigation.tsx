"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Map, Trophy } from "lucide-react";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";

const tabs = [
  { href: "/mesas", label: "Mesas", icon: Map },
  { href: "/menu", label: "Comanda", icon: ClipboardList },
  { href: "/perfil", label: "Perfil", icon: Trophy },
];

export default function BottomNavigation() {
  const pathname = usePathname();
  const pendingCount = useOfflineQueueStore(
    (state) =>
      state.queue.filter(
        (transaction) => !transaction.synced && !transaction.failedPermanently,
      ).length,
  );
  const failedCount = useOfflineQueueStore(
    (state) => state.queue.filter((transaction) => transaction.failedPermanently).length,
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-20 bg-[#0c0c0e] border-t border-neutral-800">
      <div className="grid h-full grid-cols-3 px-3 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={[
                "mx-1 my-2 flex min-h-[64px] items-center justify-center gap-3 rounded-lg border px-3",
                "active:scale-95 transition-all duration-150",
                isActive
                  ? "border-[#ffb84d] bg-[#18181b] text-[#ffb84d]"
                  : "border-transparent bg-[#0c0c0e] text-neutral-200",
              ].join(" ")}
            >
              <Icon size={26} strokeWidth={2.4} aria-hidden="true" />
              <span className="text-base font-black leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
      {(pendingCount > 0 || failedCount > 0) && (
        <div className="absolute right-3 top-[-34px] flex gap-2">
          {pendingCount > 0 && (
            <div className="rounded-lg border border-[#ffb84d] bg-[#121214] px-3 py-2 text-xs font-black uppercase text-[#ffb84d]">
              {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}
            </div>
          )}
          {failedCount > 0 && (
            <div className="rounded-lg border border-[#ff6b6b] bg-[#121214] px-3 py-2 text-xs font-black uppercase text-[#ff6b6b]">
              {failedCount} fallida{failedCount === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
