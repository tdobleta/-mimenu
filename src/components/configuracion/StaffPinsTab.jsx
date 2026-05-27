// components/configuracion/StaffPinsTab.jsx
// Gestion de personal operativo con PIN. Los PINs se guardan y verifican
// via Edge Function; el navegador nunca lee el PIN ni el hash.

import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { G } from '@/lib/glass';

const ROLES = ['Mozo', 'Encargado', 'Cocinero'];

const INPUT = {
  width: '100%',
  padding: '8px 11px',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  fontSize: 13,
  color: G.text,
  background: '#FFFFFF',
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

async function invokeStaffPin(body) {
  const { data, error } = await supabase.functions.invoke('staff-pin-auth', { body });
  if (error) throw new Error(error.message || 'Error en PIN de personal');
  if (data?.error) throw new Error(data.error);
  return data;
}

function PinPad({ value, onChange }) {
  const PAD = ['1','2','3','4','5','6','7','8','9','','0','<-'];
  return (
    <div>
      <div style={{ display:'flex', gap:8, justifyContent:'center', margin:'10px 0' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width:12, height:12, borderRadius:'50%', background:i < value.length ? G.teal : '#E2E8F0' }} />
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
        {PAD.map((k, i) => (
          <button
            key={i}
            type="button"
            disabled={k === ''}
            onClick={() => {
              if (k === '<-') { onChange(value.slice(0, -1)); return; }
              if (value.length < 4) onChange(value + k);
            }}
            style={{
              padding:'10px 0',
              borderRadius:8,
              fontSize:16,
              fontWeight:600,
              background:k === '' ? 'transparent' : '#F8FAFC',
              border:k === '' ? 'none' : '1px solid #E2E8F0',
              color:G.text,
              cursor:k === '' ? 'default' : 'pointer',
            }}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function StaffModal({ member, branchId, onSave, onClose }) {
  const isNew = !member?.id;
  const [nombre, setNombre] = useState(member?.nombre || '');
  const [rol, setRol] = useState(member?.rol || 'Mozo');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (isNew && pin.length !== 4) { setError('El PIN debe tener 4 digitos'); return; }
    if (pin.length > 0 && pin.length !== 4) { setError('El PIN debe tener exactamente 4 digitos'); return; }

    setSaving(true);
    setError('');
    try {
      const data = await invokeStaffPin({
        action: 'save',
        branchId,
        staffId: isNew ? null : member.id,
        nombre: nombre.trim(),
        rol,
        pin: pin.length === 4 ? pin : '',
      });
      onSave(data.staff, isNew);
    } catch (e) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#FFF', borderRadius:16, padding:'clamp(16px, 3vw, 24px)', width:'100%', maxWidth:'min(380px, 95vw)', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.18)', fontFamily:"'DM Sans', system-ui, sans-serif" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:16, fontWeight:700, color:G.text, marginBottom:18 }}>
          {isNew ? 'Nuevo mozo' : `Editar - ${member.nombre}`}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Nombre</div>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Valentina" style={INPUT} />
          </div>

          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Rol</div>
            <select value={rol} onChange={e => setRol(e.target.value)} style={INPUT}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>
              {isNew ? 'PIN (4 digitos)' : 'Nuevo PIN (opcional - dejar vacio para no cambiar)'}
            </div>
            <PinPad value={pin} onChange={setPin} />
          </div>

          {error && (
            <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#DC2626' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'9px 0', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, color:G.textMid, background:'#FFF', cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} style={{ flex:2, padding:'9px 0', border:'none', borderRadius:10, fontSize:13, fontWeight:700, color:'#FFF', background:G.teal, cursor:saving ? 'not-allowed' : 'pointer', opacity:saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : isNew ? 'Crear mozo' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StaffPinsTab() {
  const store = useStore();
  const { addToast } = useToast();
  const branchId = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    invokeStaffPin({ action:'list', branchId })
      .then(data => setStaff(data.staff || []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, [branchId]);

  function handleSave(result, isNew) {
    if (isNew) {
      setStaff(prev => [...prev, result].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      addToast(`Mozo "${result.nombre}" creado`, 'success');
    } else {
      setStaff(prev => prev.map(m => m.id === result.id ? result : m));
      addToast(`Mozo "${result.nombre}" actualizado`, 'success');
    }
    setModal(null);
  }

  async function toggleActivo(member) {
    const nuevo = !member.activo;
    try {
      const data = await invokeStaffPin({ action:'toggle', branchId, staffId:member.id, activo:nuevo });
      setStaff(prev => prev.map(m => m.id === member.id ? data.staff : m));
      addToast(`${member.nombre} ${nuevo ? 'activado' : 'desactivado'}`, 'info');
    } catch {
      addToast('Error al cambiar estado', 'error');
    }
  }

  async function doDelete(member) {
    if (!window.confirm(`Eliminar a ${member.nombre}? Esta accion no se puede deshacer.`)) return;
    try {
      await invokeStaffPin({ action:'delete', branchId, staffId:member.id });
      setStaff(prev => prev.filter(m => m.id !== member.id));
      addToast(`${member.nombre} eliminado`, 'info');
    } catch {
      addToast('Error al eliminar', 'error');
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:600 }}>
      <div>
        <h2 style={{ fontSize:16, fontWeight:700, color:G.text, margin:'0 0 6px' }}>Mozos y PINs</h2>
        <p style={{ fontSize:13, color:'#64748B', margin:0, lineHeight:'20px' }}>
          En tablets compartidas, cada persona se identifica con su nombre y un PIN de 4 digitos.
          El PIN no se lee en el navegador; se valida en servidor.
        </p>
      </div>

      <div style={{ background:'rgba(29,158,117,0.06)', border:'1px solid rgba(29,158,117,0.2)', borderRadius:10, padding:14, fontSize:12, color:'#0F6E56', lineHeight:'18px' }}>
        <strong>Operacion segura:</strong> la tablet queda logueada con una cuenta autorizada, pero cada accion se atribuye al staff activo por PIN.
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={() => setModal('new')} style={{ padding:'8px 18px', background:G.teal, color:'#FFF', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(29,158,117,0.25)' }}>
          + Agregar persona
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'30px 0', color:'#9CA3AF', fontSize:13 }}>Cargando...</div>
      ) : staff.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0' }}>
          <div style={{ fontSize:14, color:'#6B7280', marginBottom:12 }}>Sin personal configurado</div>
          <button onClick={() => setModal('new')} style={{ padding:'8px 18px', background:G.teal, color:'#FFF', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Agregar primera persona
          </button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {staff.map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FFF', border:'1px solid #E2E8F0', borderRadius:12 }}>
              <div style={{ width:38, height:38, borderRadius:'50%', background:m.activo ? 'rgba(29,158,117,0.10)' : '#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:m.activo ? G.teal : '#9CA3AF', flexShrink:0 }}>
                {m.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color:m.activo ? G.text : '#9CA3AF' }}>{m.nombre}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{m.rol} - PIN protegido</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99, background:m.activo ? 'rgba(29,158,117,0.10)' : '#F1F5F9', color:m.activo ? G.teal : '#9CA3AF' }}>
                {m.activo ? 'Activo' : 'Inactivo'}
              </span>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => setModal(m)} style={{ padding:'5px 12px', background:'#EFF6FF', color:'#3B82F6', border:'1px solid #BFDBFE', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  Editar
                </button>
                <button onClick={() => toggleActivo(m)} style={{ padding:'5px 12px', background:'#F8FAFC', color:'#64748B', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12, cursor:'pointer' }}>
                  {m.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => doDelete(m)} style={{ padding:'5px 12px', background:'#FEF2F2', color:'#EF4444', border:'1px solid #FECACA', borderRadius:8, fontSize:12, cursor:'pointer' }}>
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <StaffModal
          member={modal === 'new' ? null : modal}
          branchId={branchId}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
