"use client";
import React from "react";

interface ChipProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "brand";
  className?: string;
  onClick?: () => void;
}

const Chip: React.FC<ChipProps> = ({ children, variant = "default", className = "", onClick }) => {
  const baseStyles = "h-[26px] px-2.5 rounded-full inline-flex items-center justify-center font-sans font-bold text-[11px] uppercase tracking-wider transition-pos";
  
  const variants = {
    default: "bg-surf-2 text-tx-sec",
    brand:   "bg-iris-soft text-iris-500 border border-iris-500/10",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger:  "bg-danger-soft text-danger",
    info:    "bg-info-soft text-info",
  };

  return (
    <div 
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${onClick ? "cursor-pointer active:scale-95" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

export default Chip;
