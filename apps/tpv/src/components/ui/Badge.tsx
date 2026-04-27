"use client";
import React from "react";

interface BadgeProps {
  count?: number;
  dot?: boolean;
  variant?: "brand" | "danger" | "success" | "warning";
  className?: string;
  children?: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({ count, dot = false, variant = "brand", className = "", children }) => {
  const variants = {
    brand:   "bg-iris-500",
    danger:  "bg-danger",
    success: "bg-success",
    warning: "bg-warning",
  };

  return (
    <div className="relative inline-flex align-middle">
      {children}
      {(count !== undefined || dot) && (
        <span className={`
          absolute -top-1 -right-1 flex items-center justify-center
          ${dot ? "w-2.5 h-2.5" : "min-w-[18px] h-[18px] px-1 text-[10px]"}
          rounded-full text-white font-black leading-none border-2 border-surf-1
          ${variants[variant]} ${className}
        `}>
          {!dot && count}
        </span>
      )}
    </div>
  );
};

export default Badge;
