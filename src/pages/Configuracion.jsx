import { useState } from 'react';
import RestauranteTab from '../components/configuracion/RestauranteTab';
import SucursalesTab from '../components/configuracion/SucursalesTab';
import EquipoTab from '../components/configuracion/EquipoTab';
import AuditoriaTab from '../components/configuracion/AuditoriaTab';
import PrinterSetup from '../components/printer/PrinterSetup';
import FacturacionSetup from '../components/facturacion/FacturacionSetup';
import TerminalTab from '../components/configuracion/TerminalTab';
import RelayTab from '../components/configuracion/RelayTab';
import StaffPinsTab from '../components/configuracion/StaffPinsTab';
import DeviceTokensTab from '../components/configuracion/DeviceTokensTab';
import JornadaAuditTab from '../components/configuracion/JornadaAuditTab';
import SupportOpsTab from '../components/configuracion/SupportOpsTab';
import { G, fontDisplay } from '@/lib/glass';

const TABS = [
  ['restaurante', 'Mi restaurante'],
  ['jornada',     'Auditoria jornada'],
  ['sucursales',  'Sucursales'],
  ['equipo',      'Equipo'],
  ['mozos',       'Mozos y PINs'],
  ['impresora',   'Impresora'],
  ['facturacion', 'Facturación AFIP'],
  ['terminal',    'Terminal de pago'],
  ['cocina',      'Cocina'],
  ['relay',       'Red local'],
  ['soporte',     'Soporte operativo'],
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
        {tab === 'jornada'     && <JornadaAuditTab />}
        {tab === 'sucursales'  && <SucursalesTab />}
        {tab === 'equipo'      && <EquipoTab />}
        {tab === 'impresora'   && <PrinterSetup />}
        {tab === 'facturacion' && <FacturacionSetup />}
        {tab === 'terminal'    && <TerminalTab />}
        {tab === 'mozos'       && <StaffPinsTab />}
        {tab === 'cocina'      && <DeviceTokensTab />}
        {tab === 'relay'       && <RelayTab />}
        {tab === 'soporte'     && <SupportOpsTab />}
        {tab === 'auditoria'   && <AuditoriaTab />}
      </div>
    </div>
  );
}
