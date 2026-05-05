"use client";
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "soft" | "danger";
  size?: "sm" | "md" | "lg" | "xl";
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth = false, className = "", children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-sans font-semibold transition-pos active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
    
    const variants = {
      primary: "bg-iris-500 text-iris-fg hover:bg-iris-600 shadow-sm",
      ghost:   "bg-transparent text-tx-sec border border-bd hover:bg-surf-2",
      soft:    "bg-surf-2 text-tx-pri border border-bd hover:bg-surf-3",
      danger:  "bg-danger text-white hover:bg-danger/90 shadow-sm",
    };

    const sizes = {
      sm: "h-8 px-3 text-[11px] rounded-sm",
      md: "h-[38px] px-3.5 text-[13px] rounded-md",
      lg: "h-[48px] px-6 text-[15px] rounded-lg",
      xl: "h-[56px] px-8 text-[17px] rounded-xl",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
