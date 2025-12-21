
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
        <div className="w-20 h-20 bg-[#9A287E] rounded-[2.5rem] flex items-center justify-center mb-6 shadow-xl shadow-pink-100 transform -rotate-3 hover:rotate-0 transition-transform duration-300">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          {isSignUp ? 'Join Manager' : 'House Tax Manager'}
        </h1>
        <p className="text-slate-500 mt-2 font-medium text-sm px-4">
          {isSignUp ? 'Create your administrator account' : 'your complete guide to house tax'}
        </p>
      </div>

      <form onSubmit={handleAuth} className="space-y-5">
        {isSignUp && (
          <div className="animate-in fade-in slide-in-from-top-2">
            <label className="block text-[10px] font-black text-[#9A287E] uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#9A287E]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </span>
              <input
                type="text"
                required
                className="w-full pl-14 pr-5 py-4 bg-slate-50 border-0 ring-1 ring-slate-200 rounded-2xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-[#E94155]"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-black text-[#9A287E] uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#9A287E]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </span>
            <input
              type="email"
              required
              className="w-full pl-14 pr-5 py-4 bg-slate-50 border-0 ring-1 ring-slate-200 rounded-2xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-[#E94155]"
              placeholder="admin@taxmanager.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5 ml-1">
            <label className="block text-[10px] font-black text-[#9A287E] uppercase tracking-widest">Password</label>
            {!isSignUp && (
              <button type="button" className="text-[10px] font-black text-[#9A287E] uppercase tracking-widest hover:opacity-80 transition-opacity">
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#9A287E]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </span>
            <input
              type="password"
              required
              className="w-full pl-14 pr-5 py-4 bg-slate-50 border-0 ring-1 ring-slate-200 rounded-2xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-[#E94155]"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
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
          className="w-full bg-[#9A287E] text-white py-5 rounded-[2rem] font-black uppercase tracking-widest shadow-xl shadow-pink-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center space-x-3"
        >
          {loading ? (
            <span>Processing...</span>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>{isSignUp ? 'Get Started' : 'Enter Manager'}</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-10 text-center">
        <button
          onClick={toggleMode}
          className="text-[#9A287E] font-black text-xs uppercase tracking-widest px-6 py-3 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-100"
        >
          {isSignUp ? 'Return to Login' : 'Create Admin Account'}
        </button>
      </div>
    </div>
  );
};

export default Login;
