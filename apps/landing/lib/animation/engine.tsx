'use client'

import React, {
  createContext, useContext, useState, useEffect, useRef, useMemo, useCallback,
  type ReactNode,
} from 'react'

export const Easing = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutQuart: (t: number) => 1 - --t * t * t * t,
  easeInOutExpo: (t: number) => {
    if (t === 0) return 0
    if (t === 1) return 1
    if (t < 0.5) return 0.5 * Math.pow(2, 20 * t - 10)
    return 1 - 0.5 * Math.pow(2, -20 * t + 10)
  },
  easeOutBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3
    if (t === 0) return 0
    if (t === 1) return 1
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function animate({
  from = 0, to = 1, start = 0, end = 1, ease = Easing.easeInOutCubic,
}: { from?: number; to?: number; start?: number; end?: number; ease?: (t: number) => number }) {
  return (t: number) => {
    if (t <= start) return from
    if (t >= end) return to
    const local = (t - start) / (end - start)
    return from + (to - from) * ease(local)
  }
}

type TimelineCtx = { time: number; duration: number; playing: boolean }
const TimelineContext = createContext<TimelineCtx>({ time: 0, duration: 10, playing: false })
export const useTime = () => useContext(TimelineContext).time
export const useTimeline = () => useContext(TimelineContext)

type SpriteCtx = { localTime: number; progress: number; duration: number; visible?: boolean }
const SpriteContext = createContext<SpriteCtx>({ localTime: 0, progress: 0, duration: 0 })
export const useSprite = () => useContext(SpriteContext)

export function Sprite({
  start = 0, end = Infinity, children, keepMounted = false,
}: {
  start?: number; end?: number; children: ReactNode | ((s: SpriteCtx) => ReactNode); keepMounted?: boolean
}) {
  const { time } = useTimeline()
  const visible = time >= start && time <= end
  if (!visible && !keepMounted) return null

  const duration = end - start
  const localTime = Math.max(0, time - start)
  const progress =
    duration > 0 && isFinite(duration) ? clamp(localTime / duration, 0, 1) : 0

  const value: SpriteCtx = { localTime, progress, duration, visible }

  return (
    <SpriteContext.Provider value={value}>
      {typeof children === 'function' ? children(value) : children}
    </SpriteContext.Provider>
  )
}

export function TextSprite({
  text, x = 0, y = 0, size = 48, color = '#111', font = 'Inter, system-ui, sans-serif',
  weight = 600, entryDur = 0.45, exitDur = 0.35,
  entryEase = Easing.easeOutBack, exitEase = Easing.easeInCubic,
  align = 'left' as 'left' | 'center' | 'right', letterSpacing = '-0.01em',
}: any) {
  const { localTime, duration } = useSprite()
  const exitStart = Math.max(0, duration - exitDur)

  let opacity = 1, ty = 0
  if (localTime < entryDur) {
    const t = entryEase(clamp(localTime / entryDur, 0, 1))
    opacity = t; ty = (1 - t) * 16
  } else if (localTime > exitStart) {
    const t = exitEase(clamp((localTime - exitStart) / exitDur, 0, 1))
    opacity = 1 - t; ty = -t * 8
  }

  const translateX = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0'

  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      transform: `translate(${translateX}, ${ty}px)`,
      opacity, fontFamily: font, fontSize: size, fontWeight: weight, color,
      letterSpacing, whiteSpace: 'pre', lineHeight: 1.1, willChange: 'transform, opacity',
    }}>
      {text}
    </div>
  )
}

export function ImageSprite({
  src, x = 0, y = 0, width = 400, height = 300,
  entryDur = 0.6, exitDur = 0.4, kenBurns = false, kenBurnsScale = 1.08,
  radius = 12, fit = 'cover',
}: any) {
  const { localTime, duration } = useSprite()
  const exitStart = Math.max(0, duration - exitDur)

  let opacity = 1, scale = 1
  if (localTime < entryDur) {
    const t = Easing.easeOutCubic(clamp(localTime / entryDur, 0, 1))
    opacity = t; scale = 0.96 + 0.04 * t
  } else if (localTime > exitStart) {
    const t = Easing.easeInCubic(clamp((localTime - exitStart) / exitDur, 0, 1))
    opacity = 1 - t; scale = (kenBurns ? kenBurnsScale : 1) + 0.02 * t
  } else if (kenBurns) {
    const holdSpan = exitStart - entryDur
    const holdT = holdSpan > 0 ? (localTime - entryDur) / holdSpan : 0
    scale = 1 + (kenBurnsScale - 1) * holdT
  }

  return (
    <div style={{
      position: 'absolute', left: x, top: y, width, height,
      opacity, transform: `scale(${scale})`, transformOrigin: 'center',
      borderRadius: radius, overflow: 'hidden', willChange: 'transform, opacity',
      boxShadow: '0 20px 60px rgba(0,0,0,.5)',
    }}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />
    </div>
  )
}

export function Stage({
  width = 1280, height = 720, duration = 10, background = '#08080f',
  loop = true, autoplay = true, persistKey: _persistKey = 'mrtpvrest-demo',
  children,
}: {
  width?: number; height?: number; duration?: number; background?: string;
  loop?: boolean; autoplay?: boolean; persistKey?: string; children: ReactNode
}) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(autoplay)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [scale, setScale] = useState(1)

  const stageRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  useEffect(() => {
    if (!stageRef.current) return
    const el = stageRef.current
    const measure = () => {
      const barH = 56
      const s = Math.min(el.clientWidth / width, (el.clientHeight - barH) / height)
      setScale(Math.max(0.05, s))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [width, height])

  useEffect(() => {
    if (!playing) { lastTsRef.current = null; return }
    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      setTime(t => {
        let next = t + dt
        if (next >= duration) {
          if (loop) next = next % duration
          else { next = duration; setPlaying(false) }
        }
        return next
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTsRef.current = null
    }
  }, [playing, duration, loop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p) }
      else if (e.code === 'ArrowLeft') setTime(t => clamp(t - (e.shiftKey ? 1 : 0.1), 0, duration))
      else if (e.code === 'ArrowRight') setTime(t => clamp(t + (e.shiftKey ? 1 : 0.1), 0, duration))
      else if (e.key === '0' || e.code === 'Home') setTime(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration])

  const displayTime = hoverTime != null ? hoverTime : time
  const ctxValue = useMemo(
    () => ({ time: displayTime, duration, playing }),
    [displayTime, duration, playing]
  )

  return (
    <div ref={stageRef} style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', background: '#000', fontFamily: 'inherit',
    }}>
      <div style={{
        flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', minHeight: 0,
      }}>
        <div style={{
          width, height, background, position: 'relative',
          transform: `scale(${scale})`, transformOrigin: 'center', flexShrink: 0,
          boxShadow: '0 20px 80px rgba(124,58,237,.2)', overflow: 'hidden',
          borderRadius: 12,
        }}>
          <TimelineContext.Provider value={ctxValue}>{children}</TimelineContext.Provider>
        </div>
      </div>
      <PlaybackBar
        time={displayTime} duration={duration} playing={playing}
        onPlayPause={() => setPlaying(p => !p)}
        onReset={() => setTime(0)}
        onSeek={(t: number) => setTime(t)}
        onHover={(t: number | null) => setHoverTime(t)}
      />
    </div>
  )
}

function PlaybackBar({
  time, duration, playing, onPlayPause, onReset, onSeek, onHover,
}: any) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const timeFromEvent = useCallback((e: { clientX: number }) => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    return x * duration
  }, [duration])

  useEffect(() => {
    if (!dragging) return
    const onUp = () => setDragging(false)
    const onMove = (e: MouseEvent) => onSeek(timeFromEvent(e))
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    return () => { window.removeEventListener('mouseup', onUp); window.removeEventListener('mousemove', onMove) }
  }, [dragging, timeFromEvent, onSeek])

  const pct = duration > 0 ? (time / duration) * 100 : 0
  const fmt = (t: number) => {
    const total = Math.max(0, t)
    const m = Math.floor(total / 60)
    const s = Math.floor(total % 60)
    const cs = Math.floor((total * 100) % 100)
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
      background: 'rgba(15,15,28,.95)', border: '1px solid rgba(255,255,255,.08)',
      width: '100%', maxWidth: 720, alignSelf: 'center',
      borderRadius: 10, color: '#f4f4fb', userSelect: 'none', flexShrink: 0,
      margin: '0 0 16px',
    }}>
      <IconButton onClick={onReset} title="Inicio (0)">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 2v10M12 2L5 7l7 5V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      </IconButton>
      <IconButton onClick={onPlayPause} title="Play/pausa (espacio)">
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="2" width="3" height="10" fill="currentColor"/><rect x="8" y="2" width="3" height="10" fill="currentColor"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 2l9 5-9 5V2z" fill="currentColor"/></svg>
        )}
      </IconButton>
      <div style={{ fontFamily: 'var(--f-m), monospace', fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 64, textAlign: 'right' }}>
        {fmt(time)}
      </div>
      <div
        ref={trackRef}
        onMouseMove={(e) => { if (dragging) onSeek(timeFromEvent(e)); else onHover(timeFromEvent(e)) }}
        onMouseLeave={() => { if (!dragging) onHover(null) }}
        onMouseDown={(e) => { setDragging(true); onSeek(timeFromEvent(e)); onHover(null) }}
        style={{ flex: 1, height: 22, position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: 'rgba(255,255,255,.12)', borderRadius: 2 }}/>
        <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: 4, background: '#7c3aed', borderRadius: 2, boxShadow: '0 0 8px rgba(124,58,237,.6)' }}/>
        <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', width: 14, height: 14, marginLeft: -7, marginTop: -7, background: '#fff', borderRadius: 7, boxShadow: '0 2px 6px rgba(0,0,0,.6)' }}/>
      </div>
      <div style={{ fontFamily: 'var(--f-m), monospace', fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 64, color: 'rgba(244,244,251,.55)' }}>
        {fmt(duration)}
      </div>
    </div>
  )
}

function IconButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'rgba(124,58,237,.2)' : 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.1)', borderRadius: 7,
        color: '#f4f4fb', cursor: 'pointer', padding: 0, transition: 'background .12s',
      }}
    >
      {children}
    </button>
  )
}
