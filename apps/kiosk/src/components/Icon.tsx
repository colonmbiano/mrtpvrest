import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlus     = (p: IconProps) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>;
export const IconMinus    = (p: IconProps) => <Base {...p}><path d="M5 12h14" /></Base>;
export const IconTrash    = (p: IconProps) => <Base {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" /></Base>;
export const IconClose    = (p: IconProps) => <Base {...p}><path d="M6 6l12 12M18 6L6 18" /></Base>;
export const IconCheck    = (p: IconProps) => <Base {...p}><path d="M5 13l4 4L19 7" /></Base>;
export const IconBackspace= (p: IconProps) => <Base {...p}><path d="M21 5H9l-6 7 6 7h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zM15 9l-4 4m0-4l4 4" /></Base>;
export const IconArrow    = (p: IconProps) => <Base {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Base>;
export const IconDineIn   = (p: IconProps) => <Base {...p}><path d="M3 3v18M7 3v8a4 4 0 0 1-4 4M17 3v18M17 15h4v-8a4 4 0 0 0-4-4" /></Base>;
export const IconTakeout  = (p: IconProps) => <Base {...p}><path d="M4 7h16l-1.5 12a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2L4 7zM8 7V5a4 4 0 0 1 8 0v2" /></Base>;
export const IconCash     = (p: IconProps) => <Base {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 10v4M18 10v4" /></Base>;
export const IconCard     = (p: IconProps) => <Base {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h2" /></Base>;
