import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function PageNotFound() {
  const location = useLocation();
  const { user } = useAuth();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-7xl font-light text-slate-300">404</h1>
        <div className="h-0.5 w-16 bg-slate-200 mx-auto" />
        <h2 className="text-2xl font-medium text-slate-800">Página no encontrada</h2>
        <p className="text-slate-600">
          La ruta <span className="font-medium">"{pageName}"</span> no existe en esta aplicación.
        </p>
        {user?.role === 'admin' && (
          <div className="p-4 bg-slate-100 rounded-lg border border-slate-200 text-sm text-left text-slate-600">
            <strong>Admin:</strong> Esta página puede no estar implementada todavía.
          </div>
        )}
        <button
          onClick={() => window.location.href = '/'}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          ← Volver al inicio
        </button>
      </div>
    </div>
  );
}
