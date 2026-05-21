'use client';
// handoff/screens/ChatScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import { C, S } from '@/lib/tokens';

interface Message { id: string; message: string; fromDriver: boolean; createdAt: string | Date; }
interface ChatScreenProps { order: any; messages: Message[]; onBack: () => void; onSend: (text: string) => void; }

export function ChatScreen({ order, messages, onBack, onSend }: ChatScreenProps) {
  const [msg, setMsg] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => { if (!msg.trim()) return; onSend(msg.trim()); setMsg(''); };

  return (
    <div style={{ height: '100vh', background: C.bg, fontFamily: C.fontBody, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...S.header, flexShrink: 0 }}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{order?.customerName}</div>
          <div style={{ fontSize: 9, color: C.amber, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
            Pedido #{order?.orderNumber}
          </div>
        </div>
        <a href={`tel:${order?.customerPhone}`} style={{
          width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,184,77,0.28)',
          background: C.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.amber, textDecoration: 'none',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.4 9.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.32 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.29 6.29l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
          </svg>
        </a>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.fromDriver ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 18,
              borderBottomRightRadius: m.fromDriver ? 4 : 18,
              borderBottomLeftRadius: m.fromDriver ? 18 : 4,
              background: m.fromDriver ? C.amber : C.surf2,
              color: m.fromDriver ? '#090909' : C.text,
              border: m.fromDriver ? 'none' : `1px solid ${C.border}`,
              boxShadow: m.fromDriver ? '0 4px 20px rgba(255,184,77,0.2)' : 'none',
            }}>
              <div style={{ fontSize: 13, fontWeight: m.fromDriver ? 600 : 400, lineHeight: 1.5 }}>{m.message}</div>
              <div style={{ fontSize: 9, marginTop: 4, opacity: 0.55, textAlign: 'right', fontWeight: 600 }}>
                {new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{ flexShrink: 0, padding: '10px 14px', background: 'rgba(9,9,9,0.96)', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Escribe un mensaje…"
          style={{ flex: 1, height: 46, background: C.surf1, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0 14px', fontSize: 13, color: C.text, fontFamily: C.fontBody, outline: 'none' }} />
        <button onClick={send} style={{ width: 46, height: 46, borderRadius: 14, background: C.amber, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(255,184,77,0.32)', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#090909" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
