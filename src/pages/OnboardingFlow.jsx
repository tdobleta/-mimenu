import GuidedTour from '@/components/GuidedTour';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';

const STEPS = ['Tu restaurante', 'Las mesas', 'El menú', '¡Listo!'];
const MESAS_OPCIONES = [4, 6, 8, 10, 12, 15, 20, 25, 30];
const CATEGORIAS = ['Entradas', 'Principales', 'Postres', 'Bebidas'];
const CAT_BADGE = {
  Entradas:    { bg:'#FFEDD5', c:'#EA580C' },
  Principales: { bg:'#E8F7F2', c:'#1D9E75' },
  Postres:     { bg:'#FCE7F3', c:'#DB2777' },
  Bebidas:     { bg:'#DBEAFE', c:'#3B82F6' },
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const store = useStore();
  const [step, setStep] = useState(1);
  const [showTour, setShowTour] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [form1, setForm1] = useState({ nombre:'', telefono:'', direccion:'' });
  const [numMesas, setNumMesas] = useState(8);
  const [productos, setProductos] = useState([]);
  const [prodForm, setProdForm] = useState({ nombre:'', precio:'', categoria:'Principales' });
  const [prodError, setProdError] = useState({ nombre:false, precio:false });

  async function handleStep1() {
    setSaving(true); setErrorMsg(null);
    try {
      await base44.entities.Restaurant.update(store.restaurantId, {
        nombre: form1.nombre.trim(),
        telefono: form1.telefono,
        direccion: form1.direccion,
      });
      store.updateRestaurante({ nombre: form1.nombre.trim(), direccion: form1.direccion, telefono: form1.telefono });
      setStep(2);
    } catch(err) {
      setErrorMsg('No se pudo guardar. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStep2() {
    setSaving(true); setErrorMsg(null);
    try {
      await base44.entities.Branch.update(store.branchId, { mesas: numMesas });
      const newTables = Array.from({ length: numMesas }, (_, i) => ({
        id: i + 1, num: i + 1, status: 'libre', sillas: 4,
        gridCol: (i % 4) + 1, gridRow: Math.floor(i / 4) + 1,
        order: [], mozo: null, openedAt: null, clientName: null, turnId: null,
      }));
      store.saveLayout(store.branchId, newTables, { cols: 4, rows: Math.ceil(numMesas / 4) });
      setStep(3);
    } catch(err) {
      setErrorMsg('No se pudo guardar. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function addProducto() {
    const errs = { nombre: !prodForm.nombre.trim(), precio: !prodForm.precio || Number(prodForm.precio) <= 0 };
    if (errs.nombre || errs.precio) { setProdError(errs); return; }
    setProductos(p => [...p, { id:'p_'+Date.now(), nombre: prodForm.nombre.trim(), precio: Number(prodForm.precio), categoria: prodForm.categoria }]);
    setProdForm({ nombre:'', precio:'', categoria: prodForm.categoria });
    setProdError({ nombre:false, precio:false });
  }

  async function handleSkip3() {
    setSaving(true); setErrorMsg(null);
    try {
      await base44.entities.Restaurant.update(store.restaurantId, { onboarding_completado: true });
      setStep(4);
    } catch(err) {
      setErrorMsg('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStep3() {
    setSaving(true); setErrorMsg(null);
    try {
      const created = await Promise.all(productos.map(p =>
        base44.entities.MenuItem.create({
          branch_id: store.branchId,
          nombre: p.nombre,
          precio: p.precio,
          categoria: p.categoria,
          activo: true,
        })
      ));
      await base44.entities.Restaurant.update(store.restaurantId, { onboarding_completado: true });
      store.setMenuItems((created || []).map(m => ({
        id: m.id, nombre: m.nombre, precio: m.precio, categoria: m.categoria, disponible: m.activo !== false,
      })));
      setStep(4);
    } catch(err) {
      setErrorMsg('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    store.completeOnboarding();
    if (store.refreshCharts) store.refreshCharts();
    setShowTour(true);
  }

  if (showTour) return <GuidedTour onFinish={() => { setShowTour(false); navigate('/salon'); }} />;

  return (
    <div style={{ minHeight:'100vh', display:'flex', backgroundColor:'#0D1117', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
      {/* Panel izquierdo */}
      <div style={{ width: window.innerWidth < 768 ? '100%' : 280, flexShrink:0, backgroundColor:'rgba(255,255,255,0.04)', padding:'40px 28px', display:'flex', flexDirection:'column' }}>
        <div style={{ fontSize:22, fontWeight:700, color:'white', marginBottom:6 }}>
          mi<span style={{ color:'#1D9E75' }}>menú</span>
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:40 }}>Configuración inicial</div>
        <div>
          {STEPS.map((label, i) => {
            const num = i + 1;
            const completed = num < step;
            const active = num === step;
            const circleStyle = completed
              ? { backgroundColor:'#1D9E75', color:'white' }
              : active
                ? { backgroundColor:'#1D9E75', color:'white', fontWeight:700 }
                : { border:'1px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.3)' };
            const textColor = active ? 'white' : (completed ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)');
            return (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0, ...circleStyle }}>
                  {completed
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : num
                  }
                </div>
                <span style={{ fontSize:14, color:textColor, fontWeight: active?500:400 }}>{label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop:'auto', fontSize:11, color:'rgba(255,255,255,0.15)' }}>Menos de 5 minutos</div>
      </div>

      {/* Panel derecho */}
      <div style={{ backgroundColor:'#F6F8FA', flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 24px' }}>
        <div style={{ maxWidth:500, width:'100%' }}>
          {step === 1 && (
            <Step1
              form1={form1} setForm1={setForm1}
              errorMsg={errorMsg} saving={saving}
              onContinue={handleStep1}
            />
          )}
          {step === 2 && (
            <Step2
              numMesas={numMesas} setNumMesas={setNumMesas}
              errorMsg={errorMsg} saving={saving}
              onBack={()=>{ setErrorMsg(null); setStep(1); }}
              onContinue={handleStep2}
            />
          )}
          {step === 3 && (
            <Step3
              productos={productos} setProductos={setProductos}
              prodForm={prodForm} setProdForm={setProdForm}
              prodError={prodError}
              addProducto={addProducto}
              errorMsg={errorMsg} saving={saving}
              onBack={()=>{ setErrorMsg(null); setStep(2); }}
              onContinue={handleStep3}
              onSkip={handleSkip3}
            />
          )}
          {step === 4 && (
            <Step4 store={store} numMesas={numMesas} productosCount={productos.length} onFinish={finish} />
          )}
        </div>
      </div>
    </div>
  );

  if (showTour) return <GuidedTour onFinish={() => { setShowTour(false); navigate('/'); }} />;

}

const inputStyle = { width:'100%', padding:'11px 14px', border:'1px solid rgba(0,0,0,0.12)', borderRadius:8, fontSize:14, backgroundColor:'white', boxSizing:'border-box', outline:'none' };
const primaryBtn = (disabled) => ({ width:'100%', padding:14, backgroundColor:'#1D9E75', color:'white', borderRadius:8, fontSize:15, fontWeight:600, border:'none', marginTop:24, cursor: disabled?'not-allowed':'pointer', opacity: disabled?0.4:1 });
const backBtn = { backgroundColor:'transparent', border:'none', color:'#9CA3AF', fontSize:13, cursor:'pointer', textAlign:'center', padding:'8px 0' };

function ErrorBox({ msg }) {
  if (!msg) return null;
  return <div style={{ backgroundColor:'#FEE2E2', color:'#EF4444', borderRadius:8, padding:'10px 14px', fontSize:13, marginTop:16 }}>{msg}</div>;
}

function Step1({ form1, setForm1, errorMsg, saving, onContinue }) {
  const disabled = form1.nombre.trim() === '' || saving;
  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, color:'#111827', letterSpacing:'-0.4px', marginBottom:8, margin:0 }}>¿Cómo se llama tu restaurante?</h1>
      <p style={{ fontSize:14, color:'#6B7280', marginTop:8, marginBottom:32 }}>Estos datos aparecen en el sistema. Podés cambiarlos después.</p>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <Field label="Nombre del restaurante" required>
          <input style={inputStyle} placeholder="Ej: La Parrilla de Don Carlos" value={form1.nombre} onChange={e=>setForm1(f=>({...f,nombre:e.target.value}))} onFocus={e=>e.target.style.outline='2px solid #1D9E75'} onBlur={e=>e.target.style.outline='none'} />
        </Field>
        <Field label="Teléfono (opcional)">
          <input style={inputStyle} placeholder="Ej: 261-4123456" value={form1.telefono} onChange={e=>setForm1(f=>({...f,telefono:e.target.value}))} onFocus={e=>e.target.style.outline='2px solid #1D9E75'} onBlur={e=>e.target.style.outline='none'} />
        </Field>
        <Field label="Dirección (opcional)">
          <input style={inputStyle} placeholder="Ej: San Martín 450, Mendoza" value={form1.direccion} onChange={e=>setForm1(f=>({...f,direccion:e.target.value}))} onFocus={e=>e.target.style.outline='2px solid #1D9E75'} onBlur={e=>e.target.style.outline='none'} />
        </Field>
      </div>
      <ErrorBox msg={errorMsg} />
      <button onClick={onContinue} disabled={disabled} style={primaryBtn(disabled)}>{saving ? 'Guardando...' : 'Continuar →'}</button>
    </div>
  );

  if (showTour) return <GuidedTour onFinish={() => { setShowTour(false); navigate('/'); }} />;

}

function Step2({ numMesas, setNumMesas, errorMsg, saving, onBack, onContinue }) {
  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, color:'#111827', letterSpacing:'-0.4px', marginBottom:8, margin:0 }}>¿Cuántas mesas tiene tu salón?</h1>
      <p style={{ fontSize:14, color:'#6B7280', marginTop:8, marginBottom:32 }}>Podés reorganizarlas después desde el Salón.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8 }}>
        {MESAS_OPCIONES.map(n => {
          const selected = numMesas === n;
          return (
            <div key={n} onClick={()=>setNumMesas(n)}
              style={{ cursor:'pointer', padding:'14px 8px', borderRadius:8, textAlign:'center', border:'1.5px solid', transition:'all 0.15s', backgroundColor: selected?'#1D9E75':'white', borderColor: selected?'#1D9E75':'rgba(0,0,0,0.1)', color: selected?'white':'#374151' }}
              onMouseEnter={e=>{ if(!selected){ e.currentTarget.style.borderColor='#1D9E75'; e.currentTarget.style.color='#1D9E75'; } }}
              onMouseLeave={e=>{ if(!selected){ e.currentTarget.style.borderColor='rgba(0,0,0,0.1)'; e.currentTarget.style.color='#374151'; } }}>
              <div style={{ fontSize:20, fontWeight:700 }}>{n}</div>
              <div style={{ fontSize:10, opacity:0.7, marginTop:2 }}>mesas</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop:18, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center' }}>o ingresá tu número</div>
        <input
          type="number"
          min="1"
          max="99"
          placeholder="0"
          value={MESAS_OPCIONES.includes(numMesas) ? '' : (numMesas || '')}
          onChange={e => {
            const raw = e.target.value;
            if (raw === '' || raw === '0') { setNumMesas(''); return; }
            const v = Number(raw);
            if (v > 0 && v < 100) setNumMesas(v);
          }}
          style={{ width:120, padding:'10px 14px', border:'1.5px solid rgba(0,0,0,0.12)', borderRadius:8, fontSize:20, fontWeight:700, textAlign:'center', boxSizing:'border-box', outline:'none' }}
        />
      </div>
      <div style={{ marginTop:24 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>Vista previa</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(44px, 1fr))', gap:6 }}>
          {Array.from({ length: numMesas }, (_, i) => (
            <div key={i} style={{ height:36, borderRadius:6, border:'1.5px solid #1D9E75', backgroundColor:'#E8F7F2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#1D9E75' }}>{i+1}</div>
          ))}
        </div>
      </div>
      <ErrorBox msg={errorMsg} />
      <div style={{ marginTop:32, display:'flex', flexDirection:'column', gap:8 }}>
        <button onClick={onContinue} disabled={saving} style={primaryBtn(saving)}>{saving?'Guardando...':'Continuar →'}</button>
        <button onClick={onBack} style={backBtn}>← Volver</button>
      </div>
    </div>
  );

  if (showTour) return <GuidedTour onFinish={() => { setShowTour(false); navigate('/'); }} />;

}

function Step3({ productos, setProductos, prodForm, setProdForm, prodError, addProducto, errorMsg, saving, onBack, onContinue, onSkip }) {
  const disabled = productos.length === 0 || saving;
  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, color:'#111827', letterSpacing:'-0.4px', marginBottom:8, margin:0 }}>Cargá tus primeros productos</h1>
      <p style={{ fontSize:14, color:'#6B7280', marginTop:8, marginBottom:24 }}>Con 5 ya podés empezar. Agregá más después desde Configuración → Menú.</p>

      <div style={{ backgroundColor:'white', borderRadius:10, border:'0.5px solid rgba(0,0,0,0.08)', padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <input style={{ ...inputStyle, padding:'9px 12px', flex:3, borderColor: prodError.nombre?'#EF4444':'rgba(0,0,0,0.12)' }} placeholder="Nombre del producto" value={prodForm.nombre} onChange={e=>setProdForm(f=>({...f,nombre:e.target.value}))} />
          <input type="number" min="0" style={{ ...inputStyle, padding:'9px 12px', flex:1, borderColor: prodError.precio?'#EF4444':'rgba(0,0,0,0.12)' }} placeholder="Precio" value={prodForm.precio} onChange={e=>setProdForm(f=>({...f,precio:e.target.value}))} />
          <select style={{ ...inputStyle, padding:'9px 12px', flex:2 }} value={prodForm.categoria} onChange={e=>setProdForm(f=>({...f,categoria:e.target.value}))}>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
          <button onClick={addProducto} style={{ width:36, height:36, backgroundColor:'#1D9E75', color:'white', borderRadius:8, border:'none', fontSize:20, fontWeight:300, cursor:'pointer', flexShrink:0, lineHeight:1 }}>+</button>
        </div>
      </div>

      {productos.length === 0 ? (
        <div style={{ border:'1.5px dashed rgba(0,0,0,0.1)', borderRadius:8, padding:24, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
          Agregá al menos un producto para continuar
        </div>
      ) : (
        <div>
          {productos.map(p => {
            const badge = CAT_BADGE[p.categoria] || CAT_BADGE.Principales;
            return (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                <span style={{ flex:1, fontSize:14, fontWeight:500, color:'#111827' }}>{p.nombre}</span>
                <span style={{ backgroundColor:badge.bg, color:badge.c, fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99 }}>{p.categoria}</span>
                <span style={{ fontSize:14, fontWeight:700, color:'#1D9E75', minWidth:70, textAlign:'right' }}>${p.precio}</span>
                <button onClick={()=>setProductos(prev => prev.filter(x => x.id !== p.id))} style={{ fontSize:16, color:'#9CA3AF', backgroundColor:'transparent', border:'none', cursor:'pointer' }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      <ErrorBox msg={errorMsg} />
      <div style={{ marginTop:24, display:'flex', flexDirection:'column', gap:8 }}>
        <button onClick={onContinue} disabled={disabled} style={primaryBtn(disabled)}>
          {saving ? 'Guardando...' : 'Finalizar configuración →'}
        </button>
        <button onClick={onSkip} style={backBtn}>
          Saltar por ahora — cargo el menú después
        </button>
        <button onClick={onBack} style={backBtn}>← Volver</button>
      </div>
    </div>
  );

  if (showTour) return <GuidedTour onFinish={() => { setShowTour(false); navigate('/'); }} />;

}

function Step4({ store, numMesas, productosCount, onFinish }) {
  const cards = [
    { emoji:'🍽️', titulo:'Abrí una mesa', desc:'Tocá una mesa en el Salón' },
    { emoji:'💰', titulo:'Abrí el turno', desc:'Registrá el fondo inicial' },
    { emoji:'👥', titulo:'Invitá tu equipo', desc:'Agregá mozos desde Configuración' },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
      <div style={{ width:80, height:80, borderRadius:'50%', backgroundColor:'#1D9E75', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:24 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <h1 style={{ fontSize:28, fontWeight:700, color:'#111827', letterSpacing:'-0.4px', marginBottom:8, margin:0 }}>¡Todo listo!</h1>
      <p style={{ fontSize:15, color:'#374151', marginTop:8, marginBottom:32 }}>
        Configuraste {store.restaurante?.nombre} con {numMesas} mesas y {productosCount} productos.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:32, width:'100%' }}>
        {cards.map(c => (
          <div key={c.titulo} style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:16, textAlign:'center' }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{c.emoji}</div>
            <div style={{ fontSize:13, fontWeight:600, color:'#111827', marginBottom:4 }}>{c.titulo}</div>
            <div style={{ fontSize:12, color:'#6B7280' }}>{c.desc}</div>
          </div>
        ))}
      </div>
      <button onClick={onFinish} style={{ width:'100%', maxWidth:320, padding:14, backgroundColor:'#1D9E75', color:'white', borderRadius:8, fontSize:15, fontWeight:600, border:'none', cursor:'pointer' }}>
        Ir al Salón →
      </button>
    </div>
  );

  if (showTour) return <GuidedTour onFinish={() => { setShowTour(false); navigate('/'); }} />;

}

function Field({ label, required, children }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#374151', marginBottom:6 }}>{label}{required && <span style={{ color:'#EF4444', marginLeft:4 }}>*</span>}</label>
      {children}
    </div>
  );

  if (showTour) return <GuidedTour onFinish={() => { setShowTour(false); navigate('/'); }} />;

}


