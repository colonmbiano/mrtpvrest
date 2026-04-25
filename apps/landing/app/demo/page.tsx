'use client'

import Link from 'next/link'
import { Stage } from '@/lib/animation/engine'
import { Scene } from './scene'

export default function DemoPage() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', pointerEvents: 'none',
      }}>
        <Link href="/" style={{
          pointerEvents: 'auto',
          fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500,
          color: '#c4c4de', textDecoration: 'none',
          padding: '8px 14px', borderRadius: 8,
          background: 'rgba(15,15,28,.6)', border: '1px solid rgba(255,255,255,.1)',
          backdropFilter: 'blur(8px)',
        }}>
          ← Volver
        </Link>
        <a
          href="https://admin.mrtpvrest.com/register"
          style={{
            pointerEvents: 'auto',
            fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700,
            color: '#000', textDecoration: 'none',
            padding: '9px 18px', borderRadius: 8,
            background: '#7c3aed',
            boxShadow: '0 0 20px #7c3aed55',
            letterSpacing: '0.01em',
            transition: 'opacity .2s',
          }}
        >
          Registrarse ahora →
        </a>
      </div>

      <Stage
        width={1280}
        height={720}
        duration={22}
        background="#08080f"
        loop={true}
        autoplay={true}
      >
        <Scene />
      </Stage>
    </div>
  )
}
