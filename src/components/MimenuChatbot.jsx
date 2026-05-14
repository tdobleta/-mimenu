import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import useUserRole from '@/lib/useUserRole';
import { useAuth } from '@/lib/AuthContext';

// ── Avatar SVG del Bot (alta calidad) ────────────────────────────────────────
const BotAvatar = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="12" fill="url(#botGrad)"/>
    <defs>
      <linearGradient id="botGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1D9E75"/>
        <stop offset="100%" stopColor="#0A5C47"/>
      </linearGradient>
    </defs>
    {/* Cabeza del robot */}
    <rect x="9" y="8" width="14" height="11" rx="3" fill="white" fillOpacity="0.95"/>
    {/* Ojos */}
    <circle cx="13" cy="13" r="1.8" fill="#1D9E75"/>
    <circle cx="19" cy="13" r="1.8" fill="#1D9E75"/>
    <circle cx="13.7" cy="12.3" r="0.6" fill="white"/>
    <circle cx="19.7" cy="12.3" r="0.6" fill="white"/>
    {/* Boca */}
    <rect x="12" y="16" width="8" height="1.5" rx="0.75" fill="#1D9E75"/>
    {/* Antena */}
    <rect x="15.2" y="4" width="1.6" height="4" rx="0.8" fill="white" fillOpacity="0.9"/>
    <circle cx="16" cy="3.5" r="1.5" fill="white" fillOpacity="0.9"/>
    {/* Cuerpo */}
    <rect x="10" y="21" width="12" height="7" rx="3" fill="white" fillOpacity="0.8"/>
    {/* Botones cuerpo */}
    <circle cx="14" cy="24.5" r="1" fill="#1D9E75"/>
    <circle cx="18" cy="24.5" r="1" fill="#1D9E75"/>
    {/* Orejas/laterales */}
    <rect x="6" y="10" width="3" height="5" rx="1.5" fill="white" fillOpacity="0.7"/>
    <rect x="23" y="10" width="3" height="5" rx="1.5" fill="white" fillOpacity="0.7"/>
  </svg>
);

// ── Avatar SVG del Usuario (abstracto, moderno) ───────────────────────────────
const UserAvatar = ({ email = '' }) => {
  // Generar color basado en el email
  const colors = [
    ['#6366F1', '#8B5CF6'], ['#EC4899', '#F43F5E'],
    ['#F97316', '#EAB308'], ['#06B6D4', '#3B82F6'],
    ['#10B981', '#14B8A6'],
  ];
  const idx = email.charCodeAt(0) % colors.length || 0;
  const [c1, c2] = colors[idx];
  const initials = email ? email[0].toUpperCase() : 'U';
  const id = `userGrad_${idx}`;

  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c1}/>
          <stop offset="100%" stopColor={c2}/>
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="12" fill={`url(#${id})`}/>
      {/* Patrón de fondo sutil */}
      <circle cx="28" cy="4" r="8" fill="white" fillOpacity="0.08"/>
      <circle cx="4" cy="28" r="6" fill="white" fillOpacity="0.06"/>
      {/* Inicial */}
      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="700" fill="white" fontFamily="'DM Sans', system-ui, sans-serif">{initials}</text>
    </svg>
  );
};

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sos el asistente oficial de mimenú, un sistema POS SaaS para restaurantes en Argentina. Respondés dudas de dueños, encargados, mozos y cocineros sobre cómo usar el sistema.

Conocés todo sobre mimenú:

MÓDULOS:
- Dashboard: Facturación del día, ticket promedio, mesas activas, top productos, hora pico, gráfico comparativo.
- Salón: Mozos abren mesas, agregan ítems, notas por ítem, envían comanda a cocina.
- POS: Cajero selecciona mesa, cobra con numpad, múltiples métodos (Efectivo, Tarjeta, MercadoPago, Transferencia), pagos mixtos, propina, división por persona, ítems libres. Imprime ticket y ofrece factura AFIP.
- Caja: Abre turno con fondo inicial, ve ventas por método, registra retiros, cierra turno con resumen. Botón "Abrir POS". No se puede cerrar si hay mesas abiertas.
- Reservas: Gestión con nombre, fecha, hora, personas, canal y estado.
- Stock y Costos: Ingredientes, Recetas (food cost %), Movimientos. Stock se descuenta automáticamente al cerrar mesas si hay recetas configuradas.
- Reportes: Ventas por día, desglose por método de pago, top productos.
- Configuración: Mi restaurante, Sucursales, Menú, Equipo, Impresora, Facturación AFIP, Auditoría.
- Vista Cocina: Tablet de cocina con comandas en tiempo real.

ROLES:
- Dueño: Acceso total.
- Encargado: Salón, Caja, Reservas, Stock, Reportes. Sin Configuración.
- Mozo: Solo Salón y Reservas.
- Cocinero: Solo Vista Cocina.

FLUJO TÍPICO:
1. Encargado abre turno en Caja
2. Mozos abren mesas en Salón y toman pedidos
3. Envían a cocina (imprime comanda automáticamente)
4. Cajero abre POS desde Caja, selecciona mesa, cobra
5. Sistema imprime ticket y ofrece factura AFIP
6. Stock se descuenta automáticamente según recetas

AFIP: Via TusFacturasAPP. Configurar en Configuración → Facturación AFIP. Soporta Factura A y B.
IMPRESIÓN: Epson por red o browser print. Configurar en Configuración → Impresora.

ERRORES COMUNES:
- No puedo cobrar en POS: Abrí el turno de caja primero
- No aparecen productos: Verificá que estén activos en Configuración → Menú
- No se imprime: Configurá el método en Configuración → Impresora
- Factura da error: Verificá credenciales en Configuración → Facturación AFIP
- No puedo cerrar el turno: Cerrá todas las mesas primero

Respondé en español argentino, claro y conciso. Máximo 3 párrafos. Usá emojis con moderación.`;

// ── Sugerencias iniciales ─────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: '💰', text: '¿Cómo abro el turno de caja?' },
  { icon: '🖨️', text: '¿Cómo configuro la impresora?' },
  { icon: '📄', text: '¿Cómo emito una factura AFIP?' },
  { icon: '👥', text: '¿Qué puede hacer cada rol?' },
  { icon: '📦', text: '¿Cómo funciona el stock automático?' },
  { icon: '🍽️', text: '¿Cómo agrego productos al menú?' },
];

// ── Typing dots ───────────────────────────────────────────────────────────────
const TypingDots = () => (
  <div style={{ display:'flex', gap:4, alignItems:'center', padding:'4px 2px' }}>
    {[0,1,2].map(i => (
      <div key={i} style={{
        width:7, height:7, borderRadius:'50%',
        background:'#1D9E75',
        animation:`typingBounce 1.4s ease-in-out ${i*0.16}s infinite`,
        opacity:0.7,
      }}/>
    ))}
  </div>
);

// ── MimenuChatbot ─────────────────────────────────────────────────────────────
export default function MimenuChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const store = useStore();
  const role = useUserRole();
  const { user } = useAuth();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => inputRef.current?.focus(), 150); }
  }, [open]);

  async function sendMessage(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setShowSuggestions(false);

    const newMsgs = [...messages, { role: 'user', content: msg }];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const ctx = role ? `\nContexto del usuario: rol "${role}", restaurante "${store.restaurante?.nombre || 'sin nombre'}".` : '';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT + ctx,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || 'No pude procesar tu consulta. Intentá de nuevo.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      if (!open) setUnread(u => u + 1);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión. Verificá tu internet e intentá de nuevo.' }]);
    }
    setLoading(false);
  }

  return (
    <>
      <style>{`
        @keyframes typingBounce { 0%,60%,100%{transform:translateY(0);opacity:0.7} 30%{transform:translateY(-5px);opacity:1} }
        @keyframes chatPop { from{opacity:0;transform:scale(0.94) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes fabPulse { 0%,100%{box-shadow:0 8px 24px rgba(29,158,117,0.4)} 50%{box-shadow:0 8px 32px rgba(29,158,117,0.65)} }
        @keyframes msgIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .chat-msg { animation: msgIn 0.2s ease forwards; }
        .chat-scroll::-webkit-scrollbar { width:4px; }
        .chat-scroll::-webkit-scrollbar-track { background:transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background:rgba(0,0,0,0.1); border-radius:99px; }
        .suggest-btn:hover { background:rgba(29,158,117,0.08) !important; border-color:rgba(29,158,117,0.3) !important; transform:translateY(-1px); }
        .send-btn:not(:disabled):hover { transform:scale(1.05); }
      `}</style>

      {/* ── Panel principal ── */}
      {open && (
        <div style={{
          position:'fixed', bottom:84, right:20, zIndex:9999,
          width:380, maxWidth:'calc(100vw - 32px)',
          height:560, maxHeight:'calc(100vh - 110px)',
          background:'rgba(248,250,255,0.96)',
          backdropFilter:'blur(40px) saturate(200%)',
          WebkitBackdropFilter:'blur(40px) saturate(200%)',
          borderRadius:24,
          border:'1px solid rgba(255,255,255,0.9)',
          boxShadow:'0 32px 80px rgba(0,0,0,0.16), 0 8px 24px rgba(29,158,117,0.08), 0 0 0 0.5px rgba(255,255,255,0.5)',
          display:'flex', flexDirection:'column', overflow:'hidden',
          animation:'chatPop 0.28s cubic-bezier(0.34,1.4,0.64,1)',
          fontFamily:"'DM Sans', system-ui, sans-serif",
        }}>

          {/* Header */}
          <div style={{
            padding:'16px 18px', flexShrink:0,
            background:'linear-gradient(135deg, #1D9E75 0%, #0A5C47 100%)',
            display:'flex', alignItems:'center', gap:12,
          }}>
            <div style={{ position:'relative', flexShrink:0 }}>
              <BotAvatar />
              <div style={{ position:'absolute', bottom:-1, right:-1, width:10, height:10, borderRadius:'50%', background:'#4ADE80', border:'2px solid #0A5C47' }}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'white', letterSpacing:'-0.01em' }}>mimenú Chatbot</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:1 }}>Asistente de mimenú · siempre disponible</div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background:'rgba(255,255,255,0.12)', border:'none', borderRadius:10,
              width:32, height:32, color:'white', cursor:'pointer', fontSize:18,
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'background 0.15s',
            }}>×</button>
          </div>

          {/* Mensajes o pantalla inicial */}
          <div className="chat-scroll" style={{ flex:1, overflowY:'auto', padding:'16px 16px 8px' }}>

            {/* Pantalla inicial con sugerencias */}
            {showSuggestions && messages.length === 0 && (
              <div style={{ paddingBottom:8 }}>
                {/* Saludo */}
                <div style={{ textAlign:'center', padding:'8px 0 20px' }}>
                  <div style={{ width:56, height:56, borderRadius:18, background:'linear-gradient(135deg,#1D9E75,#0A5C47)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', boxShadow:'0 8px 24px rgba(29,158,117,0.25)' }}>
                    <BotAvatar />
                  </div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#111827', letterSpacing:'-0.02em', marginBottom:6 }}>¿En qué puedo ayudarte?</div>
                  <div style={{ fontSize:13, color:'#6B7280', lineHeight:1.5 }}>Soy el asistente de mimenú. Preguntame lo que quieras sobre el sistema.</div>
                </div>

                {/* Sugerencias */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s.text} className="suggest-btn" onClick={() => sendMessage(s.text)} style={{
                      padding:'11px 12px', borderRadius:14, cursor:'pointer', textAlign:'left',
                      background:'rgba(255,255,255,0.8)', border:'1px solid rgba(0,0,0,0.07)',
                      transition:'all 0.15s', fontFamily:'inherit',
                      boxShadow:'0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ fontSize:18, marginBottom:5 }}>{s.icon}</div>
                      <div style={{ fontSize:12, color:'#374151', fontWeight:500, lineHeight:1.4 }}>{s.text}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mensajes */}
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div key={i} className="chat-msg" style={{
                  display:'flex', gap:9, marginBottom:14,
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems:'flex-end',
                }}>
                  {/* Avatar */}
                  <div style={{ flexShrink:0, marginBottom:2 }}>
                    {isUser ? <UserAvatar email={user?.email || ''} /> : <BotAvatar />}
                  </div>

                  {/* Burbuja */}
                  <div style={{
                    maxWidth:'72%',
                    padding:'11px 14px',
                    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isUser
                      ? 'linear-gradient(135deg, #1D9E75, #0A5C47)'
                      : 'rgba(255,255,255,0.9)',
                    color: isUser ? 'white' : '#1F2937',
                    fontSize:13, lineHeight:1.6,
                    boxShadow: isUser
                      ? '0 4px 16px rgba(29,158,117,0.28)'
                      : '0 2px 12px rgba(0,0,0,0.07)',
                    border: isUser ? 'none' : '1px solid rgba(0,0,0,0.06)',
                    whiteSpace:'pre-wrap',
                    backdropFilter: isUser ? 'none' : 'blur(8px)',
                  }}>
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {/* Typing del bot */}
            {loading && (
              <div className="chat-msg" style={{ display:'flex', gap:9, marginBottom:14, alignItems:'flex-end' }}>
                <div style={{ flexShrink:0 }}><BotAvatar /></div>
                <div style={{
                  padding:'12px 16px', borderRadius:'18px 18px 18px 4px',
                  background:'rgba(255,255,255,0.9)', border:'1px solid rgba(0,0,0,0.06)',
                  boxShadow:'0 2px 12px rgba(0,0,0,0.07)',
                }}>
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding:'12px 14px',
            borderTop:'1px solid rgba(0,0,0,0.06)',
            background:'rgba(255,255,255,0.6)',
            display:'flex', gap:10, alignItems:'flex-end', flexShrink:0,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }}
              placeholder="Escribí tu consulta..."
              rows={1}
              style={{
                flex:1, padding:'10px 14px',
                background:'rgba(255,255,255,0.9)',
                border:'1.5px solid rgba(0,0,0,0.08)',
                borderRadius:14, fontSize:13, color:'#1F2937',
                resize:'none', outline:'none', fontFamily:'inherit',
                lineHeight:1.5, maxHeight:90, overflowY:'auto',
                transition:'border-color 0.15s',
                boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
              }}
              onFocus={e => e.target.style.borderColor='rgba(29,158,117,0.5)'}
              onBlur={e => e.target.style.borderColor='rgba(0,0,0,0.08)'}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width:42, height:42, borderRadius:13, border:'none', flexShrink:0,
                background: input.trim() && !loading
                  ? 'linear-gradient(135deg, #1D9E75, #0A5C47)'
                  : 'rgba(0,0,0,0.06)',
                color: input.trim() && !loading ? 'white' : '#9CA3AF',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all 0.15s',
                boxShadow: input.trim() && !loading ? '0 4px 14px rgba(29,158,117,0.35)' : 'none',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Botón flotante ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:'fixed', bottom:20, right:20, zIndex:9999,
          width:58, height:58, borderRadius:'50%', border:'none',
          background: open
            ? 'rgba(17,24,39,0.85)'
            : 'linear-gradient(135deg, #1D9E75 0%, #0A5C47 100%)',
          cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all 0.25s cubic-bezier(0.34,1.4,0.64,1)',
          boxShadow: open ? 'none' : '0 8px 28px rgba(29,158,117,0.45)',
          animation: !open ? 'fabPulse 3s ease-in-out infinite' : 'none',
        }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="white" fillOpacity="0.9"/>
            <circle cx="9" cy="10" r="1.2" fill="#1D9E75"/>
            <circle cx="12" cy="10" r="1.2" fill="#1D9E75"/>
            <circle cx="15" cy="10" r="1.2" fill="#1D9E75"/>
          </svg>
        )}
        {unread > 0 && !open && (
          <div style={{
            position:'absolute', top:-2, right:-2,
            width:20, height:20, borderRadius:'50%',
            background:'#EF4444', color:'white',
            fontSize:10, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center',
            border:'2.5px solid white',
            boxShadow:'0 2px 6px rgba(239,68,68,0.4)',
          }}>{unread > 9 ? '9+' : unread}</div>
        )}
      </button>
    </>
  );
}
