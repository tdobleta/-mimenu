import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export default function TeamTab({ restaurant }) {
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('Mozo');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (restaurant?.id) loadMembers(); }, [restaurant?.id]);

  async function loadMembers() {
    if (!restaurant?.id) return;
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('created_at');
    setMembers(data ?? []);
  }

  async function handleAdd() {
    if (!email.trim() || !nombre.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('team_members').insert({
        restaurant_id: restaurant.id,
        email: email.trim().toLowerCase(),
        nombre: nombre.trim(),
        rol,
      });
      if (error) throw error;
      toast.success('Miembro agregado. El usuario podrá ingresar con este email.');
      setOpen(false);
      setEmail(''); setNombre(''); setRol('Mozo');
      loadMembers();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(member) {
    if (!confirm(`¿Eliminar a ${member.nombre || member.email} del equipo?`)) return;
    const { error } = await supabase.from('team_members').delete().eq('id', member.id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Miembro eliminado');
    loadMembers();
  }

  const ROL_LABELS = { Dueno: 'Dueño', Encargado: 'Encargado', Mozo: 'Mozo', Cocinero: 'Cocinero' };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h3 style={{ fontSize:15, fontWeight:600, color:'#111827' }}>Equipo del restaurante</h3>
        <button onClick={() => setOpen(true)}
          style={{ padding:'7px 14px', backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:7, fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + Agregar miembro
        </button>
      </div>

      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
        {members.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No hay miembros en el equipo todavía.</div>
        ) : members.map(m => (
          <div key={m.id} style={{ display:'flex', alignItems:'center', padding:'12px 16px', borderBottom:'0.5px solid rgba(0,0,0,0.05)', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', backgroundColor:'#E1F5EE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, color:'#0F6E56', flexShrink:0 }}>
              {(m.nombre || m.email).charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:500, color:'#111827' }}>{m.nombre || '—'}</div>
              <div style={{ fontSize:12, color:'#6B7280' }}>{m.email}</div>
            </div>
            <span style={{ backgroundColor:'#F3F4F6', color:'#374151', padding:'2px 10px', borderRadius:99, fontSize:12, fontWeight:500 }}>
              {ROL_LABELS[m.rol] || m.rol}
            </span>
            <button onClick={() => handleRemove(m)}
              style={{ padding:'4px 8px', border:'0.5px solid rgba(239,68,68,0.3)', borderRadius:6, fontSize:12, color:'#EF4444', backgroundColor:'white', cursor:'pointer' }}>
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar miembro al equipo</DialogTitle></DialogHeader>
          <div style={{ display:'flex', flexDirection:'column', gap:14, paddingTop:8 }}>
            <div>
              <label style={{ fontSize:13, color:'#374151', display:'block', marginBottom:5 }}>Nombre</label>
              <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Nombre completo"
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:13, color:'#374151', display:'block', marginBottom:5 }}>Email</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@ejemplo.com" type="email"
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:13, color:'#374151', display:'block', marginBottom:5 }}>Rol</label>
              <select value={rol} onChange={e=>setRol(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:7, fontSize:13, backgroundColor:'white' }}>
                <option value="Encargado">Encargado</option>
                <option value="Mozo">Mozo</option>
                <option value="Cocinero">Cocinero</option>
              </select>
            </div>
            <p style={{ fontSize:12, color:'#6B7280', margin:0 }}>
              El usuario debe registrarse con este email en mimenú para poder ingresar.
            </p>
            <button onClick={handleAdd} disabled={saving}
              style={{ padding:'9px 0', backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:7, fontSize:14, fontWeight:500, cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1 }}>
              {saving ? 'Guardando...' : 'Agregar al equipo'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
