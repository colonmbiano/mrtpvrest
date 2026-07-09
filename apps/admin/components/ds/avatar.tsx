"use client";
import type { LucideIcon } from "lucide-react";
import { TONE_BG, TONE_FG, type Tone } from "./badge";

export function Avatar({
  initials,
  size = 40,
  gradient,
}: {
  initials: string;
  size?: number;
  gradient?: string;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center font-display font-extrabold"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        fontSize: size * 0.33,
        color: "var(--accent-contrast)",
        background: gradient || "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
      }}
    >
      {initials}
    </span>
  );
}

export function IconBadge({
  icon: Icon,
  tone = "ac",
  size = 34,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px]"
      style={{ width: size, height: size, background: TONE_BG[tone], color: TONE_FG[tone] }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  );
}
