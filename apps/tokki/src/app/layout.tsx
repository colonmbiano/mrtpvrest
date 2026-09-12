import "./globals.css";
import React from "react";
import { Toaster } from "sonner";
import { Nunito } from "next/font/google";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata = {
  title: "Tokki Boba TPV",
  description: "POS Ligero para llevar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={nunito.variable} suppressHydrationWarning>
      <body className="overflow-hidden">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
