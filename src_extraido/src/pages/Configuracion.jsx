import { useState } from 'react';
import RestauranteTab from '../components/configuracion/RestauranteTab';
import SucursalesTab from '../components/configuracion/SucursalesTab';
import EquipoTab from '../components/configuracion/EquipoTab';
import AuditoriaTab from '../components/configuracion/AuditoriaTab';
import PrinterSetup from '../components/printer/PrinterSetup';
import FacturacionSetup from '../components/facturacion/FacturacionSetup';
import { G, fontDisplay } from '@/lib/glass';

const TABS = [
  ['restaurante', 'Mi restaurante'],
  ['sucursales',  'Sucursales'],
  ['equipo',      'Equipo'],
  ['impresora',   'Impresora'],
  ['facturacion', 'Facturación AFIP'],
  ['auditoria',   'Auditoría'],
];

export default function Configuracion() {
  const [tab, setTab] = useState('restaurante');
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <h1 style={{ fontSize:22, fontWeight:700, color:G.text, margin:0, fontFamily:fontDisplay, letterSpacing:'-0.02em' }}>
        Configuración
      </h1>
      <div style={{ display:'flex', gap:4, overflowX:'auto', paddingBottom:2 }}>
        {TABS.map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding:'7px 16px', fontSize:13, fontWeight: tab===k ? 700 : 500,
            cursor:'pointer', borderRadius:12, border:'none', transition:'all .15s',
            whiteSpace:'nowrap',
            background: tab===k ? 'rgba(255,255,255,0.75)' : 'transparent',
            color: tab===k ? G.teal : G.textFaint,
            boxShadow: tab===k ? '0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)' : 'none',
          }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ paddingTop:4 }}>
        {tab === 'restaurante' && <RestauranteTab />}
        {tab === 'sucursales'  && <SucursalesTab />}
        {tab === 'equipo'      && <EquipoTab />}
        {tab === 'impresora'   && <PrinterSetup />}
        {tab === 'facturacion' && <FacturacionSetup />}
        {tab === 'auditoria'   && <AuditoriaTab />}
      </div>
    </div>
  );
}
