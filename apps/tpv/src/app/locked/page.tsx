"use client";
import React, { useState } from "react";
import LockScreen from "@/components/pos/LockScreen";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function LockedPage() {
  const router = useRouter();
  const [pinInput, setPinInput] = useState("");
  const [pinMode, setPinMode] = useState<"login" | "unlink">("login");

  const {
    restaurantName,
    locationName,
    isVerifying,
    loginWithPin,
  } = useTPVAuth();

  const handlePinDigit = (digit: string) => {
    if (pinInput.length < 6) setPinInput(prev => prev + digit);
  };

  const handlePinSubmit = async () => {
    if (pinMode === "unlink") {
      try {
        const { data } = await api.post("/api/employees/login", { pin: pinInput });
        const emp = data.employee || data.user;
        if (emp.role === "OWNER" || emp.role === "ADMIN") {
          localStorage.removeItem("restaurantId");
          localStorage.removeItem("locationId");
          localStorage.removeItem("terminalId");
          localStorage.removeItem("deviceName");
          document.cookie = `tpv-device-linked=; path=/; max-age=0; SameSite=Lax`;
          document.cookie = `tpv-session-active=; path=/; max-age=0; SameSite=Lax`;
          toast.success("Terminal desvinculada exitosamente");
          router.replace("/setup");
        } else {
          toast.error("Acceso denegado: Se requiere rol Administrador o Dueño para desvincular");
          setPinInput("");
        }
      } catch (e: any) {
        toast.error("Error al verificar PIN: " + (e.response?.data?.error || "PIN Incorrecto"));
        setPinInput("");
      }
      return;
    }

    try {
      await loginWithPin(pinInput);
      setPinInput("");
      // El middleware capturará tpv-session-active y el enrutador debe ir a /pos/order-type
      router.replace("/pos/order-type");
    } catch {
      setPinInput("");
    }
  };

  return (
    <LockScreen
      restaurantName={restaurantName}
      locationName={locationName}
      pinInput={pinInput}
      onDigit={handlePinDigit}
      onBackspace={() => setPinInput(prev => prev.slice(0, -1))}
      onClear={() => setPinInput("")}
      onSubmit={handlePinSubmit}
      onUnlinkStart={() => {
        setPinMode("unlink");
        setPinInput("");
      }}
      onCancelUnlink={() => {
        setPinMode("login");
        setPinInput("");
      }}
      isVerifying={isVerifying}
      mode={pinMode}
    />
  );
}
