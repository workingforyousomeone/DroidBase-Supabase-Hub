
import React, { useState } from 'react';
import { supabase } from '../services/supabase';

const Login: React.FC = () => {
  const [email, setEmail] = useState('workingforyousomeone@gmail.com');
  const [password, setPassword] = useState('Hemal@151108');
  const [fullName, setFullName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string; raw?: any; type: 'error' | 'success' } | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // Sign up with default role 'Administrator' for the first user
        const { data, error: signUpError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: { 
              full_name: fullName || 'New User',
              role: 'Administrator' 
            }
          }
        });

        if (signUpError) throw signUpError;
        handleSuccess(data);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      console.error('Auth failure:', err);
      setError({ 
        message: err.message || 'Authentication failed', 
        code: err.code || err.status?.toString(),
        raw: err,
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = (data: any) => {
    if (data.user && data.session === null) {
      setError({ 
        message: 'Registration successful! Check your email for a confirmation link.', 
        type: 'success' 
      });
    } else {
      setError({ message: 'Welcome back!', type: 'success' });
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError(null);
    if (!isSignUp) {
      setEmail('');
      setPassword('');
    } else {
      setEmail('workingforyousomeone@gmail.com');
      setPassword('Hemal@151108');
    }
  };

  return (
    <div className="flex-1 flex flex-col px-8 pt-16 pb-10 bg-white overflow-y-auto no-scrollbar">
      <div className="mb-10 text-center flex flex-col items-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center mb-6 shadow-xl shadow-indigo-100 transform rotate-6">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          {isSignUp ? 'New Account' : 'DroidBase Hub'}
        </h1>
        <p className="text-slate-500 mt-2 font-medium text-sm">
          {isSignUp ? 'Register as project administrator' : 'Secure gateway to tsmjhesy...'}
        </p>
      </div>

      <form onSubmit={handleAuth} className="space-y-4">
        {isSignUp && (
          <div className="animate-in fade-in slide-in-from-top-2">
            <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
            <input
              type="text"
              required
              className="w-full px-5 py-4 bg-slate-50 border-0 ring-1 ring-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
              placeholder="e.g. John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 ml-1">Email</label>
          <input
            type="email"
            required
            className="w-full px-5 py-4 bg-slate-50 border-0 ring-1 ring-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
            placeholder="admin@droidbase.io"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 ml-1">Password</label>
          <input
            type="password"
            required
            className="w-full px-5 py-4 bg-slate-50 border-0 ring-1 ring-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className={`p-5 rounded-[2rem] border animate-in slide-in-from-bottom-2 duration-300 ${
            error.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-900 border-rose-100 shadow-sm'
          }`}>
            <div className="flex items-start space-x-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase mb-0.5">{error.type === 'success' ? 'Info' : 'Error'}</p>
                <p className="text-sm font-bold leading-tight break-words">{error.message}</p>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? 'Wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </button>
      </form>

      <div className="mt-10 text-center">
        <button
          onClick={toggleMode}
          className="text-indigo-600 font-black text-xs uppercase tracking-widest px-4 py-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
        >
          {isSignUp ? 'Return to Login' : 'Create Admin Account'}
        </button>
      </div>
    </div>
  );
};

export default Login;
