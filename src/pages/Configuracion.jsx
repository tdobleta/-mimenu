import { useState } from 'react';
import RestauranteTab from '../components/config/RestauranteTab';
import SucursalesTab from '../components/config/SucursalesTab';
import MenuTab from '../components/config/MenuTab';
import EquipoTab from '../components/config/EquipoTab';
import AuditoriaTab from '../components/config/AuditoriaTab';

const TABS = [['restaurante','Mi restaurante'],['sucursales','Sucursales'],['menu','Menú'],['equipo','Equipo'],['auditoria','Auditoría']];

export default function Configuracion() {
  const [tab, setTab] = useState('restaurante');
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Configuración</h1>
      <div style={{ display:'flex', borderBottom:'0.5px solid rgba(0,0,0,0.08)', overflowX:'auto' }}>
        {TABS.map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)}
            style={{ padding:'8px 16px', fontSize:13, border:'none', background:'none', cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1, fontWeight:tab===k?500:400, color:tab===k?'#1D9E75':'#9CA3AF', borderBottom:tab===k?'2px solid #1D9E75':'2px solid transparent', transition:'all .15s' }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ paddingTop:8 }}>
        {tab==='restaurante' && <RestauranteTab />}
        {tab==='sucursales'  && <SucursalesTab />}
        {tab==='menu'        && <MenuTab />}
        {tab==='equipo'      && <EquipoTab />}
        {tab==='auditoria'   && <AuditoriaTab />}
      </div>
    </div>
  );
}


