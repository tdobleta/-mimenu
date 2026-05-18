import { supabase } from '@/api/supabaseClient';

export default function UserNotRegisteredError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-50 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Sin acceso</h1>
        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          Tu usuario no está registrado en esta aplicación. Pedile al dueño del restaurante que te invite desde Configuración → Equipo.
        </p>
        <ul className="text-sm text-slate-600 text-left bg-slate-50 rounded-lg p-4 mb-6 space-y-2">
          <li className="flex gap-2">
            <span className="text-slate-400">•</span>
            <span>Verificá que estás usando el email correcto</span>
          </li>
          <li className="flex gap-2">
            <span className="text-slate-400">•</span>
            <span>Pedile al encargado que te agregue al equipo</span>
          </li>
          <li className="flex gap-2">
            <span className="text-slate-400">•</span>
            <span>Intentá cerrar sesión y volver a entrar</span>
          </li>
        </ul>
        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
          style={{ width:'100%', padding:'10px 0', backgroundColor:'#EF4444', color:'white', border:'none', borderRadius:6, fontSize:14, fontWeight:500, cursor:'pointer' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}


