
import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabase';
import { AuthStatus, UserProfile } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

const App: React.FC = () => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const mapSessionToUser = (session: any): UserProfile | null => {
      if (!session) return null;
      const meta = session.user.user_metadata;
      return {
        id: session.user.id,
        email: session.user.email || '',
        user_id: meta?.user_id,
        full_name: meta?.name || meta?.full_name,
        phone: meta?.phone,
        role: meta?.role || 'USER',
        clusters: meta?.clusters,
      };
    };

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(mapSessionToUser(session));
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(mapSessionToUser(session));
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white">
        <div className="w-12 h-12 border-4 border-[#9A287E] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] animate-pulse">Initializing Hub...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 shadow-2xl relative overflow-hidden flex flex-col">
      {status === 'authenticated' ? (
        <Dashboard user={user!} onSignOut={() => supabase.auth.signOut()} />
      ) : (
        <Login />
      )}
    </div>
  );
};

export default App;
