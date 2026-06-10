'use client';
// handoff/screens/ChatScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import { C, S } from '@/lib/tokens';
import { whatsappUrl } from '@/lib/phone';

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
        {order?.customerPhone && (
          <a
            href={whatsappUrl(order.customerPhone, undefined, order?.countryCode)}
            target="_blank"
            rel="noreferrer"
            style={{
              width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(37,211,102,0.28)',
              background: 'rgba(37,211,102,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25d366', textDecoration: 'none', marginRight: 8,
            }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        )}
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
