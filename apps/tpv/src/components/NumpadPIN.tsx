'use client';

import { useState } from 'react';

interface NumpadPINProps {
  onSubmit: (pin: string) => void | Promise<void>;
  disabled?: boolean;
  maxDigits?: number;
}

export default function NumpadPIN({
  onSubmit,
  disabled = false,
  maxDigits = 4,
}: NumpadPINProps) {
  const [pin, setPin] = useState('');

  // Play sound on keypress
  const playSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  };

  const handleDigitClick = (digit: string) => {
    if (disabled || pin.length >= maxDigits) return;

    playSound();
    const newPin = pin + digit;
    setPin(newPin);

    if (newPin.length === maxDigits) {
      onSubmit(newPin);
    }
  };

  const handleDelete = () => {
    if (disabled) return;
    setPin(pin.slice(0, -1));
  };

  const handleOK = () => {
    if (disabled || pin.length === 0) return;
    onSubmit(pin);
  };

  return (
    <div className="w-full">
      {/* PIN Display */}
      <div className="flex justify-center gap-3 mb-6">
        {Array.from({ length: maxDigits }).map((_, i) => (
          <div
            key={i}
            className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-colors ${
              i < pin.length
                ? 'bg-primary border-primary'
                : 'border-border bg-transparent'
            }`}
          >
            <span className="text-foreground font-bold">
              {i < pin.length ? '●' : '○'}
            </span>
          </div>
        ))}
      </div>

      {/* Numpad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigitClick(digit)}
            disabled={disabled || pin.length >= maxDigits}
            className="bg-card hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed border border-border rounded-lg py-4 text-lg font-bold text-foreground transition-colors"
          >
            {digit}
          </button>
        ))}

        {/* DEL Button */}
        <button
          onClick={handleDelete}
          disabled={disabled || pin.length === 0}
          className="bg-danger/10 hover:bg-danger/20 disabled:opacity-50 disabled:cursor-not-allowed border border-danger rounded-lg py-4 text-sm font-bold text-danger transition-colors"
        >
          DEL
        </button>

        {/* 0 Button */}
        <button
          onClick={() => handleDigitClick('0')}
          disabled={disabled || pin.length >= maxDigits}
          className="bg-card hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed border border-border rounded-lg py-4 text-lg font-bold text-foreground transition-colors"
        >
          0
        </button>

        {/* OK Button */}
        <button
          onClick={handleOK}
          disabled={disabled || pin.length === 0}
          className="bg-success hover:bg-success/80 disabled:opacity-50 disabled:cursor-not-allowed border border-success rounded-lg py-4 text-sm font-bold text-background transition-colors col-span-1"
        >
          OK
        </button>
      </div>
    </div>
  );
}
