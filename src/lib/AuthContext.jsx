import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

function normalizeUser(u) {
  return { id: u.id, email: u.email, role: u.app_metadata?.role ?? 'user' };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser]                   = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError]         = useState(null);
  const [authChecked, setAuthChecked]     = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(normalizeUser(session.user));
      } else {
        setAuthError({ type: 'auth_required', message: 'Autenticación requerida' });
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(normalizeUser(session.user));
        setAuthError(null);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setAuthError({ type: 'auth_required', message: 'Autenticación requerida' });
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(normalizeUser(session.user));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = (shouldRedirect = true) => {
    supabase.auth.signOut().then(() => {
      setUser(null);
      if (shouldRedirect) window.location.href = '/login';
    });
  };

  const navigateToLogin = () => {
    const from = window.location.pathname !== '/login' ? window.location.href : undefined;
    window.location.href = from ? '/login?from=' + encodeURIComponent(from) : '/login';
  };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user,
      isLoadingAuth, isLoadingPublicSettings: false,
      authError, authChecked,
      logout, navigateToLogin,
      checkUserAuth: () => {}, checkAppState: () => {},
      appPublicSettings: null,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
