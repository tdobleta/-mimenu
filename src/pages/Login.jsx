import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [mode,     setMode]     = useState('login'); // 'login' | 'register'

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        const from = new URLSearchParams(window.location.search).get('from');
        const safeTo = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
        window.location.href = safeTo;
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setError({ type: 'success', message: 'Cuenta creada. Revisá tu email para confirmarla y luego iniciá sesión.' });
        setMode('login');
      }
    } catch (err) {
      const msg = err.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos'
        : err.message;
      setError({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', backgroundColor: '#F6F8FA',
      fontFamily: "'DM Sans', 'Inter', sans-serif", padding: 20,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 40,
        width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>
            mi<span style={{ color: '#1D9E75' }}>menú</span>
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', marginTop: 6 }}>
            {mode === 'login' ? 'Iniciá sesión en tu cuenta' : 'Creá tu cuenta nueva'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="tu@email.com"
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14,
                boxSizing: 'border-box', outline: 'none',
                transition: 'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor = '#1D9E75'}
              onBlur={e => e.target.style.borderColor = '#D1D5DB'}
            />
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14,
                boxSizing: 'border-box', outline: 'none',
                transition: 'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor = '#1D9E75'}
              onBlur={e => e.target.style.borderColor = '#D1D5DB'}
            />
          </div>

          {/* Mensaje de error / éxito */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
              backgroundColor: error.type === 'success' ? '#E1F5EE' : '#FEE2E2',
              color: error.type === 'success' ? '#0F6E56' : '#991B1B',
              border: `1px solid ${error.type === 'success' ? '#9FE1CB' : '#FECACA'}`,
            }}>
              {error.message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0',
              backgroundColor: loading ? '#9FE1CB' : '#1D9E75',
              color: 'white', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color .15s',
            }}>
            {loading
              ? 'Cargando...'
              : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        {/* Toggle login/register */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            style={{
              background: 'none', border: 'none', color: '#1D9E75',
              fontSize: 13, cursor: 'pointer', fontWeight: 500,
            }}>
            {mode === 'login'
              ? '¿No tenés cuenta? Registrate'
              : '¿Ya tenés cuenta? Iniciá sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}
