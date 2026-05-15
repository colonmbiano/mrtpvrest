"use client";
import { useState } from "react";
import Link from "next/link";

export default function MobileTopBar() {
  return (
    <header className="mobile-topbar md:hidden">
      <div className="mobile-topbar-left">
        <Link href="/dashboard" className="mobile-logo">
          MRTPV<span>REST</span>
        </Link>
      </div>
      <div className="mobile-topbar-right">
        <button className="mobile-ia-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
            <path d="M12 12L2.7 7.3" />
            <path d="M12 12l9.3 4.7" />
          </svg>
          <span className="ia-dot-pulsing" />
        </button>
        <button className="mobile-tenants-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
      </div>

      <style jsx>{`
        .mobile-topbar {
          height: 60px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(10, 10, 12, 0.8);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .mobile-logo {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 16px;
          color: var(--text);
          text-decoration: none;
        }
        .mobile-logo span {
          color: var(--orange);
        }
        .mobile-topbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mobile-ia-btn, .mobile-tenants-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text2);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          cursor: pointer;
        }
        .ia-dot-pulsing {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 8px;
          height: 8px;
          background: var(--orange);
          border-radius: 50%;
          box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.7);
          animation: pulse-iris 2s infinite;
        }
        @keyframes pulse-iris {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(124, 58, 237, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
        }
      `}</style>
    </header>
  );
}
