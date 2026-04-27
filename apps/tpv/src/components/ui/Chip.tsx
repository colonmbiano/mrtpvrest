"use client";
import React from "react";

interface ChipProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "brand";
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
  onClick?: () => void;
}

const Chip: React.FC<ChipProps> = ({ children, variant = "default", size = "md", dot = false, className = "", onClick }) => {
  const sizeStyles = size === "sm"
    ? "h-[22px] px-2 text-[10px]"
    : "h-[26px] px-2.5 text-[11px]";

  const baseStyles = `${sizeStyles} rounded-full inline-flex items-center justify-center gap-1.5 font-sans font-bold uppercase tracking-wider transition-pos`;
  
  const variants = {
    default: "bg-surf-2 text-tx-sec",
    brand:   "bg-iris-soft text-iris-500 border border-iris-500/10",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger:  "bg-danger-soft text-danger",
    info:    "bg-info-soft text-info",
  };

  const dotColors: Record<string, string> = {
    default: "bg-tx-sec",
    brand:   "bg-iris-500",
    success: "bg-success",
    warning: "bg-warning",
    danger:  "bg-danger",
    info:    "bg-info",
  };

  return (
    <div 
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${onClick ? "cursor-pointer active:scale-95" : ""} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </div>
  );
};

export default Chip;
