'use client'

import { Sprite, TextSprite, ImageSprite, useTime, useSprite, Easing, clamp } from '@/lib/animation/engine'

function PhaseTitle() {
  const t = useTime()
  const phases = [
    { start: 3,  end: 7,  num: '01', label: 'CLIENTE ORDENA',  color: '#10b981' },
    { start: 7,  end: 11, num: '02', label: 'COCINA RECIBE',   color: '#ef4444' },
    { start: 11, end: 15, num: '03', label: 'EN CAMINO',        color: '#3b82f6' },
    { start: 15, end: 19, num: '04', label: 'DUEÑO VE TODO',   color: '#7c3aed' },
  ]
  const current = phases.find(p => t >= p.start && t <= p.end)
  if (!current) return null

  const localT = t - current.start
  const fadeIn = clamp(localT / 0.4, 0, 1)
  const fadeOut = clamp((current.end - current.start - localT) / 0.4, 0, 1)
  const opacity = Math.min(fadeIn, fadeOut)

  return (
    <div style={{
      position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 16, opacity,
    }}>
      <span style={{
        fontFamily: 'DM Mono, monospace', fontSize: 14, color: current.color,
        background: `${current.color}22`, border: `1px solid ${current.color}55`,
        padding: '4px 12px', borderRadius: 999, letterSpacing: '0.1em', fontWeight: 600,
      }}>
        {current.num}
      </span>
      <span style={{
        fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 700, color: '#f4f4fb',
        letterSpacing: '-0.01em',
      }}>
        {current.label}
      </span>
    </div>
  )
}

function PhaseDots() {
  const t = useTime()
  const phases = [
    { start: 3, end: 7, color: '#10b981', label: 'CLIENTE' },
    { start: 7, end: 11, color: '#ef4444', label: 'KDS' },
    { start: 11, end: 15, color: '#3b82f6', label: 'DELIVERY' },
    { start: 15, end: 19, color: '#7c3aed', label: 'ADMIN' },
  ]
  return (
    <div style={{
      position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 64, alignItems: 'center',
    }}>
      {phases.map((p, i) => {
        const active = t >= p.start && t <= p.end
        const done = t > p.end
        return (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: done || active ? p.color : 'rgba(255,255,255,.15)',
              boxShadow: active ? `0 0 18px ${p.color}` : 'none',
              transform: active ? 'scale(1.4)' : 'scale(1)',
              transition: 'all .3s ease',
              margin: '0 auto',
            }}/>
            <div style={{
              fontSize: 10, fontFamily: 'DM Mono, monospace',
              color: active ? p.color : (done ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.25)'),
              letterSpacing: '0.1em', marginTop: 10, fontWeight: 600,
            }}>
              {p.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HighlightPill({ text, color }: { text: string; color: string }) {
  const { localTime, duration } = useSprite()
  const fadeIn = clamp((localTime - 0.6) / 0.4, 0, 1)
  const fadeOut = clamp((duration - localTime - 0.5) / 0.4, 0, 1)
  const opacity = Math.min(fadeIn, fadeOut)
  const scale = 0.9 + 0.1 * Easing.easeOutBack(fadeIn)

  return (
    <div style={{
      position: 'absolute', bottom: 130, left: '50%',
      transform: `translateX(-50%) scale(${scale})`,
      opacity, fontFamily: 'DM Mono, monospace', fontSize: 18,
      fontWeight: 600, color, background: `${color}1a`,
      border: `1px solid ${color}55`, padding: '8px 20px', borderRadius: 999,
      letterSpacing: '0.06em', boxShadow: `0 8px 24px ${color}33`,
    }}>
      {text}
    </div>
  )
}

function KPICounter() {
  const { localTime, duration } = useSprite()
  const t = clamp((localTime - 0.8) / 1.5, 0, 1)
  const eased = Easing.easeOutCubic(t)
  const value = Math.round(3110 + (3240 - 3110) * eased)
  const fadeOut = clamp((duration - localTime - 0.5) / 0.4, 0, 1)
  const opacity = Math.min(clamp((localTime - 0.6) / 0.3, 0, 1), fadeOut)

  return (
    <div style={{
      position: 'absolute', bottom: 130, left: '50%',
      transform: 'translateX(-50%)', opacity, textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#9494b8',
        letterSpacing: '0.14em', marginBottom: 6,
      }}>
        VENTAS HOY
      </div>
      <div style={{
        fontFamily: 'Syne, sans-serif', fontSize: 36, fontWeight: 800,
        color: '#b89eff', letterSpacing: '-0.02em',
      }}>
        ${value.toLocaleString()} <span style={{ fontSize: 18, color: '#10b981' }}>↑ +$130</span>
      </div>
    </div>
  )
}

function Outro() {
  const { localTime } = useSprite()
  const apps = [
    '/showcase/app-cliente.png', '/showcase/kiosko.png', '/showcase/tpv.png',
    '/showcase/kds.png', '/showcase/delivery.jpg', '/showcase/admin.jpg',
  ]
  const titleOpacity = clamp((localTime - 0.5) / 0.5, 0, 1)

  return (
    <>
      {apps.map((src, i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        const x = 220 + col * 290
        const y = 90 + row * 200
        const delay = i * 0.08
        const local = clamp((localTime - delay) / 0.5, 0, 1)
        const eased = Easing.easeOutBack(local)

        return (
          <div key={src} style={{
            position: 'absolute', left: x, top: y, width: 270, height: 180,
            opacity: local, transform: `scale(${0.7 + 0.3 * eased})`,
            transformOrigin: 'center', borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(124,58,237,.25)',
          }}>
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )
      })}
      <div style={{
        position: 'absolute', left: '50%', top: 540,
        transform: 'translateX(-50%)', textAlign: 'center', opacity: titleOpacity,
      }}>
        <div style={{
          fontFamily: 'Syne, sans-serif', fontSize: 42, fontWeight: 800,
          color: '#f4f4fb', letterSpacing: '-0.02em', marginBottom: 6,
        }}>
          Todo conectado.
        </div>
        <div style={{
          fontFamily: 'DM Mono, monospace', fontSize: 14, color: '#b89eff',
          letterSpacing: '0.16em', fontWeight: 600,
        }}>
          MRTPVREST.COM
        </div>
      </div>
    </>
  )
}

export function Scene() {
  return (
    <>
      <PhaseTitle />
      <PhaseDots />

      <Sprite start={0} end={3}>
        <TextSprite
          text="MRTPVREST" x={640} y={290} size={92} color="#f4f4fb"
          align="center" weight={800} font="Syne, sans-serif"
          entryDur={0.6} exitDur={0.4}
        />
        <TextSprite
          text="El flujo de un pedido en tiempo real" x={640} y={410} size={20}
          color="#b89eff" align="center" font="DM Sans, sans-serif" weight={500}
          entryDur={0.8} exitDur={0.4}
        />
      </Sprite>

      <Sprite start={3} end={7}>
        <ImageSprite
          src="/showcase/app-cliente.png" x={190} y={140} width={900} height={388}
          radius={20} entryDur={0.7} exitDur={0.5}
        />
        <HighlightPill text="ORDEN ENVIADA · $130 MXN" color="#10b981" />
      </Sprite>

      <Sprite start={7} end={11}>
        <ImageSprite
          src="/showcase/kds.png" x={190} y={140} width={900} height={388}
          radius={20} entryDur={0.7} exitDur={0.5}
        />
        <HighlightPill text="EN COCINA · LISTO EN 6 MIN" color="#ef4444" />
      </Sprite>

      <Sprite start={11} end={15}>
        <ImageSprite
          src="/showcase/delivery.jpg" x={190} y={140} width={900} height={388}
          radius={20} entryDur={0.7} exitDur={0.5}
        />
        <HighlightPill text="EN RUTA · 1.2 KM" color="#3b82f6" />
      </Sprite>

      <Sprite start={15} end={19}>
        <ImageSprite
          src="/showcase/admin.jpg" x={190} y={140} width={900} height={388}
          radius={20} entryDur={0.7} exitDur={0.5}
        />
        <KPICounter />
      </Sprite>

      <Sprite start={19} end={22}>
        <Outro />
      </Sprite>
    </>
  )
}
