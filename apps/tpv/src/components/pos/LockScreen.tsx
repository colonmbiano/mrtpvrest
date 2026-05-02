"use client";
import React, { useEffect, useState } from "react";
import { Clock, MapPin, X } from "lucide-react";
import Button from "@/components/ui/Button";

interface LockScreenProps {
  restaurantName: string;
  locationName: string;
  pinInput: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  onChangeLocation: () => void;
  isVerifying?: boolean;
}

function getGreeting(hour: number): string {
  if (hour < 6) return "Buenas\nnoches.";
  if (hour < 13) return "Buenos\ndías.";
  if (hour < 20) return "Buenas\ntardes.";
  return "Buenas\nnoches.";
}

function formatDateTime(d: Date): string {
  const time = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" });
  return `${time} · ${date.toUpperCase()}`;
}

const LockScreen: React.FC<LockScreenProps> = ({
  restaurantName,
  locationName,
  pinInput,
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
  onChangeLocation,
  isVerifying = false
}) => {
  const pinLength = 4;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const [now, setNow] = useState<Date | null>(null);
  const [terminalId, setTerminalId] = useState<string>("");
  const [address, setAddress] = useState<string>("");

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    if (typeof window !== "undefined") {
      setTerminalId(localStorage.getItem("terminalId") || localStorage.getItem("deviceName") || "");
      setAddress(localStorage.getItem("locationAddress") || "");
    }
    return () => clearInterval(id);
  }, []);

  const greeting = getGreeting((now ?? new Date()).getHours());
  const initial = (restaurantName?.trim()?.[0] || "M").toUpperCase();
  const terminalLabel = terminalId ? `TERMINAL ${terminalId}` : "TERMINAL";

  return (
    <div className="fixed inset-0 z-[100] bg-surf-0 flex items-center justify-center px-4 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8 font-sans text-tx-pri overflow-auto md:overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-15%] left-[-15%] w-[60vw] h-[60vw] sm:w-[50vw] sm:h-[50vw] md:w-[40%] md:h-[40%] bg-iris-500/10 blur-[80px] sm:blur-[100px] md:blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[60vw] h-[60vw] sm:w-[50vw] sm:h-[50vw] md:w-[40%] md:h-[40%] bg-brand/10 blur-[80px] sm:blur-[100px] md:blur-[120px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-10 lg:gap-16 w-full max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-6xl relative z-10 items-center">
        {/* LEFT PANEL: BRANDING */}
        <div className="flex flex-col justify-between py-2 sm:py-3 md:py-4 lg:py-4 gap-8">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-iris-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-iris-glow">
                {initial}
              </div>
              <span className="mono text-xs sm:text-xs md:text-sm font-black tracking-[0.15em] sm:tracking-[0.2em] uppercase opacity-60">
                {restaurantName}
              </span>
            </div>

            <div className="space-y-2">
              <span className="eyebrow !text-xs opacity-60 uppercase tracking-widest">
                {locationName} · {terminalLabel}
              </span>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight leading-[0.95] text-tx-pri whitespace-pre-line">
                {greeting}
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-tx-sec leading-relaxed max-w-sm pt-2 sm:pt-3 md:pt-4">
                Ingresa tu PIN de empleado para iniciar sesión y gestionar el turno actual.
              </p>
            </div>
          </div>

          <div className="space-y-2 sm:space-y-2.5 md:space-y-3 opacity-40">
            <div className="flex items-center gap-3 text-sm font-bold mono uppercase tracking-tight">
              <Clock size={16} /> {now ? formatDateTime(now) : "—"}
            </div>
            {address && (
              <div className="flex items-center gap-3 text-sm font-bold opacity-80 uppercase tracking-tight">
                <MapPin size={16} /> {address}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: PIN KEYPAD */}
        <div className="bg-surf-1 border border-bd rounded-2xl lg:rounded-3xl p-5 sm:p-6 md:p-8 lg:p-10 shadow-2xl flex flex-col gap-4 md:gap-6 lg:gap-7 w-full max-w-md mx-auto lg:max-w-none">
          <div className="space-y-1">
            <span className="eyebrow">ACCESO SEGURO</span>
            <h2 className="text-lg md:text-xl lg:text-2xl font-black">PIN del empleado</h2>
          </div>

          {/* PIN DISPLAY */}
          <div className="flex justify-center gap-3 md:gap-4 py-2 md:py-3">
            {Array.from({ length: pinLength }).map((_, i) => (
              <div
                key={i}
                className={`
                  flex-1 max-w-[72px] aspect-[3/4] rounded-xl md:rounded-2xl border-2 flex items-center justify-center transition-all duration-200
                  ${i < pinInput.length ? "border-iris-500 bg-iris-soft/20 scale-105" : "border-bd bg-surf-2"}
                `}
              >
                {i < pinInput.length && (
                  <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-iris-500 shadow-lg shadow-iris-glow" />
                )}
              </div>
            ))}
          </div>

          {/* KEYPAD */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {digits.map((digit) => (
              <button
                key={digit}
                onClick={() => onDigit(digit.toString())}
                className="aspect-square rounded-xl md:rounded-2xl bg-surf-2 border border-bd text-2xl md:text-3xl lg:text-4xl font-black mono hover:bg-surf-3 active:scale-95 transition-pos"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={onClear}
              className="aspect-square rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase tracking-widest text-tx-dis hover:text-tx-mut hover:bg-surf-2 transition-colors"
            >
              Limpiar
            </button>
            <button
              onClick={() => onDigit("0")}
              className="aspect-square rounded-xl md:rounded-2xl bg-surf-2 border border-bd text-2xl md:text-3xl lg:text-4xl font-black mono hover:bg-surf-3 active:scale-95 transition-pos"
            >
              0
            </button>
            <button
              onClick={onBackspace}
              className="aspect-square rounded-xl md:rounded-2xl flex items-center justify-center text-tx-dis hover:text-tx-mut hover:bg-surf-2 transition-colors"
            >
              <X size={28} />
            </button>
          </div>

          <div className="space-y-2 md:space-y-3 pt-1 md:pt-2">
            <Button
              variant="primary"
              fullWidth
              size="xl"
              className="h-12 md:h-14 lg:h-16 font-black uppercase tracking-[0.1em] text-sm md:text-base"
              onClick={onSubmit}
              disabled={isVerifying || pinInput.length < pinLength}
            >
              {isVerifying ? "Verificando..." : "Acceder al TPV"}
            </Button>
            <button
              onClick={onChangeLocation}
              className="w-full h-9 md:h-10 rounded-lg md:rounded-xl border border-bd text-[10px] md:text-[11px] font-black uppercase tracking-widest text-tx-dis hover:bg-surf-2 transition-colors"
            >
              Cambiar sucursal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LockScreen;
