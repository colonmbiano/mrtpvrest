"use client";
import React from "react";
import { Clock, MapPin, Delete, X, ChevronRight } from "lucide-react";
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

  return (
    <div className="fixed inset-0 z-[100] bg-surf-0 flex items-center justify-center p-8 font-sans text-tx-pri overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-iris-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 w-full max-w-5xl relative z-10">
        {/* LEFT PANEL: BRANDING */}
        <div className="flex flex-col justify-between py-4">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-iris-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-iris-glow">
                M
              </div>
              <span className="mono text-sm font-black tracking-[0.2em] uppercase opacity-60">
                {restaurantName}
              </span>
            </div>

            <div className="space-y-2">
              <span className="eyebrow !text-xs opacity-60 uppercase tracking-widest">
                {locationName} · TERMINAL 01
              </span>
              <h1 className="text-5xl font-black tracking-tight leading-[0.95] text-tx-pri">
                Buenas<br />tardes.
              </h1>
              <p className="text-lg text-tx-sec leading-relaxed max-w-sm pt-4">
                Ingresa tu PIN de empleado para iniciar sesión y gestionar el turno actual.
              </p>
            </div>
          </div>

          <div className="space-y-3 opacity-40">
            <div className="flex items-center gap-3 text-sm font-bold mono uppercase tracking-tight">
              <Clock size={16} /> 14:42 · LUNES 27 ABR
            </div>
            <div className="flex items-center gap-3 text-sm font-bold opacity-80 uppercase tracking-tight">
              <MapPin size={16} /> AV. REFORMA 142, CDMX
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: PIN KEYPAD */}
        <div className="bg-surf-1 border border-bd rounded-3xl p-10 shadow-2xl flex flex-col gap-8">
          <div className="space-y-1">
            <span className="eyebrow">ACCESO SEGURO</span>
            <h2 className="text-xl font-black">PIN del empleado</h2>
          </div>

          {/* PIN DISPLAY */}
          <div className="flex justify-center gap-4 py-4">
            {Array.from({ length: pinLength }).map((_, i) => (
              <div 
                key={i}
                className={`
                  w-14 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-200
                  ${i < pinInput.length ? "border-iris-500 bg-iris-soft/20 scale-105" : "border-bd bg-surf-2"}
                `}
              >
                {i < pinInput.length && (
                  <div className="w-3 h-3 rounded-full bg-iris-500 shadow-lg shadow-iris-glow" />
                )}
              </div>
            ))}
          </div>

          {/* KEYPAD */}
          <div className="grid grid-cols-3 gap-3">
            {digits.map((digit) => (
              <button
                key={digit}
                onClick={() => onDigit(digit.toString())}
                className="h-16 rounded-2xl bg-surf-2 border border-bd text-2xl font-black mono hover:bg-surf-3 active:scale-95 transition-pos"
              >
                {digit}
              </button>
            ))}
            <button 
              onClick={onClear}
              className="h-16 text-xs font-black uppercase tracking-widest text-tx-dis hover:text-tx-mut transition-colors"
            >
              Limpiar
            </button>
            <button
              onClick={() => onDigit("0")}
              className="h-16 rounded-2xl bg-surf-2 border border-bd text-2xl font-black mono hover:bg-surf-3 active:scale-95 transition-pos"
            >
              0
            </button>
            <button 
              onClick={onBackspace}
              className="h-16 flex items-center justify-center text-tx-dis hover:text-tx-mut transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            <Button 
              variant="primary" 
              fullWidth 
              size="xl" 
              className="h-14 font-black uppercase tracking-[0.1em] text-sm"
              onClick={onSubmit}
              disabled={isVerifying || pinInput.length < pinLength}
            >
              {isVerifying ? "Verificando..." : "Acceder al TPV"}
            </Button>
            <button 
              onClick={onChangeLocation}
              className="w-full h-10 rounded-xl border border-bd text-[11px] font-black uppercase tracking-widest text-tx-dis hover:bg-surf-2 transition-colors"
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
