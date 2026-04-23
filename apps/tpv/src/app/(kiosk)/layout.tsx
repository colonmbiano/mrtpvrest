import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kiosko de pedidos",
  description: "Haz tu pedido y paga con QR",
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
