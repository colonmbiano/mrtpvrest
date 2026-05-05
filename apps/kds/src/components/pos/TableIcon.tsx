"use client";
import React from "react";

interface TableIconProps {
  color?: string;
  fill?: string;
  className?: string;
}

const TableIcon: React.FC<TableIconProps> = ({ 
  color = "currentColor", 
  fill = "transparent",
  className = ""
}) => {
  return (
    <svg 
      viewBox="0 0 100 100" 
      preserveAspectRatio="xMidYMid meet" 
      className={`block overflow-visible ${className}`}
      fill="none"
    >
      {/* Top surface (perspective trapezoid) */}
      <path
        d="M 18 38 L 82 38 L 92 52 L 8 52 Z"
        fill={fill}
        stroke={color}
        strokeWidth="2.6"
        strokeLinejoin="round" 
      />
      {/* Front edge highlight */}
      <line x1="8" y1="52" x2="92" y2="52" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      
      {/* 4 legs */}
      <path d="M 16 52 L 18 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 36 52 L 36 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 64 52 L 64 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 84 52 L 82 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
};

export default TableIcon;
