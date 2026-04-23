import type { ReactNode } from "react";

type IconBadgeSize = "sm" | "md" | "lg";

type IconBadgeProps = {
  icon: ReactNode;
  gradient: string;
  size?: IconBadgeSize;
  className?: string;
};

const SIZE_CLASSES: Record<IconBadgeSize, string> = {
  sm: "w-8 h-8 rounded-lg",
  md: "w-10 h-10 rounded-xl",
  lg: "w-12 h-12 rounded-2xl",
};

export function IconBadge({
  icon,
  gradient,
  size = "md",
  className = "",
}: IconBadgeProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} shadow-lg flex items-center justify-center text-white ${className}`.trim()}
      style={{ background: gradient }}
    >
      {icon}
    </div>
  );
}

export default IconBadge;
