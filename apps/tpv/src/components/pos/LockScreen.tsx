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
  if (hour < 12) return "Buenos días.";
  if (hour < 19) return "Buenas tardes.";
  return "Buenas noches.";
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

  // Reloj en vivo. Evita render mismatch en SSR usando un placeholder hasta
  // que monte en el cliente. Refresca cada 30s para que el "Buenas tardes"
  // y la hora estén siempre actuales.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const timeLabel = now
    ? now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "--:--";
  const dateLabel = now
    ? now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" }).toUpperCase()
    : "";
  const greeting = getGreeting(now?.getHours() ?? 12);
  const [g1, g2] = greeting.split(" ");

  // Dirección de la sucursal (opcional). Se persiste en localStorage durante
  // el setup si la API la devuelve; si no existe, no pintamos esa línea.
  const [locationAddress, setLocationAddress] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLocationAddress(localStorage.getItem("locationAddress") || "");
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-surf-0 flex items-center justify-center px-4 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8 font-sans text-tx-pri overflow-auto md:overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-15%] left-[-15%] w-[60vw] h-[60vw] sm:w-[50vw] sm:h-[50vw] md:w-[40%] md:h-[40%] bg-iris-500/10 blur-[80px] sm:blur-[100px] md:blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[60vw] h-[60vw] sm:w-[50vw] sm:h-[50vw] md:w-[40%] md:h-[40%] bg-brand/10 blur-[80px] sm:blur-[100px] md:blur-[120px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-10 lg:gap-16 w-full max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-5xl relative z-10">
        {/* LEFT PANEL: BRANDING */}
        <div className="flex flex-col justify-between py-2 sm:py-3 md:py-4 lg:py-4">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-iris-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-iris-glow">
                M
              </div>
              <span className="mono text-xs sm:text-xs md:text-sm font-black tracking-[0.15em] sm:tracking-[0.2em] uppercase opacity-60">
                {restaurantName}
              </span>
            </div>

            <div className="space-y-2">
              <span className="eyebrow !text-xs opacity-60 uppercase tracking-widest">
                {locationName}
              </span>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight leading-[0.95] text-tx-pri">
                {g1}<br />{g2}
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-tx-sec leading-relaxed max-w-sm pt-2 sm:pt-3 md:pt-4">
                Ingresa tu PIN de empleado para iniciar sesión y gestionar el turno actual.
              </p>
            </div>
          </div>

          <div className="space-y-2 sm:space-y-2.5 md:space-y-3 lg:space-y-3 opacity-40">
            <div className="flex items-center gap-3 text-sm font-bold mono uppercase tracking-tight">
              <Clock size={16} /> {timeLabel}{dateLabel ? ` · ${dateLabel}` : ""}
            </div>
            {locationAddress && (
              <div className="flex items-center gap-3 text-sm font-bold opacity-80 uppercase tracking-tight">
                <MapPin size={16} /> {locationAddress}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: PIN KEYPAD */}
        <div className="bg-surf-1 border border-bd rounded-xl sm:rounded-2xl md:rounded-2xl lg:rounded-3xl p-5 sm:p-6 md:p-8 lg:p-10 shadow-2xl flex flex-col gap-3 sm:gap-4 md:gap-6 lg:gap-8">
          <div className="space-y-1">
            <span className="eyebrow">ACCESO SEGURO</span>
            <h2 className="text-sm sm:text-base md:text-lg lg:text-xl font-black">PIN del empleado</h2>
          </div>

          {/* PIN DISPLAY */}
          <div className="flex justify-center gap-2 sm:gap-2.5 md:gap-3 lg:gap-4 py-1.5 sm:py-2 md:py-3 lg:py-4">
            {Array.from({ length: pinLength }).map((_, i) => (
              <div
                key={i}
                className={`
                  w-9 h-12 sm:w-11 sm:h-14 md:w-12 md:h-16 lg:w-14 lg:h-20 rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl border-2 flex items-center justify-center transition-all duration-200
                  ${i < pinInput.length ? "border-iris-500 bg-iris-soft/20 scale-105" : "border-bd bg-surf-2"}
                `}
              >
                {i < pinInput.length && (
                  <div className="w-3 h-3 rounded-full bg-iris-500 shadow-lg shadow-iris-glow" />
                )}
              </div>
            ))}
          </div>

          {/* KEYPAD — alturas y tamaño de fuente más grandes para tablet/celular.
              Botones con min-h ergonómico (target táctil ≥48px en móvil). */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 md:gap-3">
            {digits.map((digit) => (
              <button
                key={digit}
                onClick={() => onDigit(digit.toString())}
                className="aspect-square h-16 sm:h-18 md:h-20 lg:h-24 rounded-xl md:rounded-2xl bg-surf-2 border border-bd text-3xl sm:text-4xl md:text-4xl lg:text-5xl font-black mono hover:bg-surf-3 active:scale-95 transition-pos"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={onClear}
              className="h-16 sm:h-18 md:h-20 lg:h-24 text-[11px] sm:text-xs md:text-sm font-black uppercase tracking-widest text-tx-dis hover:text-tx-mut transition-colors active:scale-95"
            >
              Limpiar
            </button>
            <button
              onClick={() => onDigit("0")}
              className="aspect-square h-16 sm:h-18 md:h-20 lg:h-24 rounded-xl md:rounded-2xl bg-surf-2 border border-bd text-3xl sm:text-4xl md:text-4xl lg:text-5xl font-black mono hover:bg-surf-3 active:scale-95 transition-pos"
            >
              0
            </button>
            <button
              onClick={onBackspace}
              aria-label="Borrar"
              className="h-16 sm:h-18 md:h-20 lg:h-24 flex items-center justify-center rounded-xl md:rounded-2xl bg-surf-2 border border-bd text-tx-dis hover:text-tx-mut active:scale-95 transition-pos"
            >
              <X size={28} />
            </button>
          </div>

          <div className="space-y-2 sm:space-y-2.5 md:space-y-3 pt-1 sm:pt-1.5 md:pt-2">
            <Button
              variant="primary"
              fullWidth
              size="xl"
              className="h-11 sm:h-12 md:h-13 lg:h-14 font-black uppercase tracking-[0.05em] sm:tracking-[0.08em] md:tracking-[0.1em] text-xs sm:text-xs md:text-sm lg:text-base"
              onClick={onSubmit}
              disabled={isVerifying || pinInput.length < pinLength}
            >
              {isVerifying ? "Verificando..." : "Acceder al TPV"}
            </Button>
            <button
              onClick={onChangeLocation}
              className="w-full h-8 sm:h-9 md:h-9 lg:h-10 rounded-md sm:rounded-lg md:rounded-lg lg:rounded-xl border border-bd text-[9px] sm:text-[10px] md:text-[10px] lg:text-[11px] font-black uppercase tracking-widest text-tx-dis hover:bg-surf-2 transition-colors"
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
