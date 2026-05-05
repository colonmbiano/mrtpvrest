"use client";
import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && <span className="eyebrow ml-1">{label}</span>}
        <input
          ref={ref}
          className={`
            h-[38px] px-3 rounded-md bg-surf-2 border border-bd 
            text-tx-pri text-[14px] font-sans placeholder:text-tx-dis
            focus:outline-none focus:border-iris-500 focus:ring-2 focus:ring-iris-glow
            transition-pos ${error ? "border-danger" : ""} ${className}
          `}
          {...props}
        />
        {error && <span className="text-[10px] font-bold text-danger ml-1 uppercase">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
