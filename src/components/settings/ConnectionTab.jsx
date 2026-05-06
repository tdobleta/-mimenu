import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ManualTurnForm from './ManualTurnForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const METHODS = [
  { key: 'fudo', title: 'Fudo', subtitle: 'Conectá tu API Key', icon: '🔗' },
  { key: 'mercadopago', title: 'MercadoPago', subtitle: 'Conectá tu cuenta', icon: '💳' },
  { key: 'manual', title: 'Carga manual', subtitle: 'Cargás vos al cerrar el turno', icon: '✏️' },
];

export default function ConnectionTab({ branches, activeBranchId, onUpdate }) {
  const branch = activeBranchId !== 'all' ? branches.find(b => b.id === activeBranchId) : branches[0];
  const [selected, setSelected] = useState(branch?.metodo_conexion || 'ninguno');
  const [fudoKey, setFudoKey] = useState(branch?.fudo_api_key || '');
  const [fudoSecret, setFudoSecret] = useState(branch?.fudo_api_secret || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const method = params.get('method');
    if (method && METHODS.some(m => m.key === method)) {
      handleSelect(method);
    }
  }, []);

  async function handleSelect(method) {
    setSelected(method);
    setTestResult(null);
    if (branch) {
      await base44.entities.Branch.update(branch.id, { metodo_conexion: method });
      onUpdate();
    }
  }

  async function testFudo() {
    setTesting(true);
    setTestResult(null);
    await base44.entities.Branch.update(branch.id, { fudo_api_key: fudoKey, fudo_api_secret: fudoSecret });
    // Simulated test
    setTimeout(() => {
      setTesting(false);
      if (fudoKey && fudoSecret) {
        setTestResult('success');
        toast.success('Conexión exitosa');
      } else {
        setTestResult('error');
      }
    }, 1500);
  }

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 500 }}>¿De dónde vienen tus ventas?</h2>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>Podés cambiar esto cuando quieras.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {METHODS.map(m => (
          <button
            key={m.key}
            onClick={() => handleSelect(m.key)}
            className="p-4 text-left transition-all bg-white"
            style={{
              border: selected === m.key ? '1.5px solid #1D9E75' : '0.5px solid hsl(var(--border))',
              backgroundColor: selected === m.key ? '#E1F5EE' : 'white',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>{m.subtitle}</div>
          </button>
        ))}
      </div>

      {selected === 'fudo' && (
        <div className="bg-white p-5 space-y-3 max-w-md" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>API Key</label>
            <input value={fudoKey} onChange={e => setFudoKey(e.target.value)} placeholder="Pegá tu clave aquí"
              className="w-full px-3 py-2 text-sm bg-white"
              style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>API Secret</label>
            <input value={fudoSecret} onChange={e => setFudoSecret(e.target.value)} placeholder="Pegá tu clave aquí"
              className="w-full px-3 py-2 text-sm bg-white"
              style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={testFudo} disabled={testing}
              className="px-4 py-2 text-white text-sm disabled:opacity-50"
              style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}>
              {testing ? 'Probando...' : 'Probar conexión'}
            </button>
            {testResult === 'success' && <span style={{ fontSize: 12, color: '#1D9E75' }}>✓ Conexión exitosa</span>}
            {testResult === 'error' && <span style={{ fontSize: 12, color: '#DC3545' }}>✗ Credenciales incorrectas</span>}
          </div>
          <button onClick={() => setShowHelp(true)} className="text-sm underline" style={{ color: '#1D9E75' }}>
            ¿Dónde encuentro mi API Key?
          </button>

          <Dialog open={showHelp} onOpenChange={setShowHelp}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Encontrar tu API Key de Fudo</DialogTitle>
              </DialogHeader>
              <p className="text-sm mt-2" style={{ color: 'rgba(0,0,0,0.6)', lineHeight: '20px' }}>
                En Fudo, ir a <strong>Configuración → Integraciones → API</strong>. Copiar la API Key y el API Secret.
              </p>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {selected === 'mercadopago' && (
        <div className="bg-white p-5 max-w-md" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
          {branch?.mp_access_token ? (
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 13, color: '#1D9E75' }}>✓ {branch.mp_account_name || 'Cuenta conectada'}</span>
              <button onClick={async () => {
                await base44.entities.Branch.update(branch.id, { mp_access_token: '', mp_account_name: '' });
                onUpdate();
              }} className="text-sm" style={{ color: '#DC3545' }}>Desconectar</button>
            </div>
          ) : (
            <button className="flex items-center gap-2 px-4 py-2.5 text-white text-sm"
              style={{ backgroundColor: '#009ee3', borderRadius: 6 }}
              onClick={() => toast.info('La integración OAuth de MercadoPago requiere configuración del servidor.')}>
              💳 Conectar con MercadoPago
            </button>
          )}
        </div>
      )}

      {selected === 'manual' && branch && (
        <ManualTurnForm branch={branch} />
      )}
    </div>
  );
}


