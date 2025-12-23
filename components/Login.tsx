
import React, { useState } from 'react';
import { supabase } from '../services/supabase';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // New Signup Fields
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('USER');
  const [clusters, setClusters] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string; type: 'error' | 'success' } | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const testAccounts = [
    { email: 'workingforyousomeone@gmail.com', pass: 'Hemal@151108', label: 'Admin Access' },
    { email: 'srikanthkarini@gmail.com', pass: 'Hemal@151108', label: 'User Access' }
  ];

  const fillTestAccount = (acc: typeof testAccounts[0]) => {
    setIsSignUp(false);
    setEmail(acc.email);
    setPassword(acc.pass);
    setError(null);
  };

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
              user_id: userId.trim(),
              name: name.trim(),
              phone: phone.trim(),
              role: role,
              clusters: role === 'USER' ? clusters.trim() : null
            }
          }
        });

        if (signUpError) throw signUpError;
        
        if (data.user && data.session === null) {
          setError({ 
            message: 'Signup successful! Check your email for confirmation.', 
            type: 'success' 
          });
        } else {
          setError({ message: 'Welcome! Account created successfully.', type: 'success' });
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      let msg = err.message || 'Authentication failed';
      if (msg.toLowerCase().includes('database error')) {
        msg = 'Database error saving user. Please check if User ID or Email is unique.';
      }
      setError({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError(null);
    setEmail('');
    setPassword('');
    setUserId('');
    setName('');
    setPhone('');
    setRole('USER');
    setClusters('');
  };

  return (
    <div className="flex-1 flex flex-col justify-center px-8 py-10 bg-white overflow-y-auto no-scrollbar relative min-h-full">
      <div className="mb-6 text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-[#9A287E] rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-pink-100 transform -rotate-3">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          {isSignUp ? 'New Account' : 'House Tax Manager'}
        </h1>
        <p className="text-slate-400 mt-1 font-black uppercase text-[9px] tracking-[0.2em]">
          {isSignUp ? 'Registration Portal' : 'Administrator Access'}
        </p>
      </div>

      {/* Quick Test Login Buttons */}
      {!isSignUp && (
        <div className="mb-6 p-3 bg-slate-50 rounded-xl border border-slate-100 animate-in fade-in zoom-in-95">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center mb-2">Quick Test Access</p>
          <div className="flex gap-2">
            {testAccounts.map((acc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => fillTestAccount(acc)}
                className="flex-1 py-2 px-1 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase text-[#9A287E] hover:border-[#9A287E] active:scale-95 transition-all truncate"
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleAuth} className="space-y-4">
        {isSignUp && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
            {/* User ID */}
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">User ID (Application ID)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                </span>
                <input
                  type="text" required
                  className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-sm"
                  placeholder="e.g. 10190758-NEW"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </span>
                <input
                  type="text" required
                  className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-sm"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Phone Number</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </span>
                <input
                  type="tel" required
                  className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-sm"
                  placeholder="+91 00000 00000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Role & Clusters Grid */}
            <div className="grid grid-cols-2 gap-3">
               <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Access Role</label>
                  <select 
                    className="w-full px-4 py-3.5 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-sm appearance-none"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
               </div>
               <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Clusters</label>
                  <input
                    type="text"
                    disabled={role !== 'USER'}
                    className="w-full px-4 py-3.5 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-sm disabled:opacity-50"
                    placeholder="e.g. C1|C4"
                    value={clusters}
                    onChange={(e) => setClusters(e.target.value)}
                  />
               </div>
            </div>
          </div>
        )}

        {/* Email & Password (Common) */}
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </span>
            <input
              type="email" required
              className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-sm"
              placeholder="admin@manager.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Secure Password</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </span>
            <input
              type="password" required
              className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-xl focus:ring-2 focus:ring-[#9A287E] outline-none font-bold text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className={`p-4 rounded-xl border animate-in slide-in-from-bottom-2 ${
            error.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-900 border-rose-100'
          }`}>
            <p className="text-[10px] font-black uppercase mb-0.5">{error.type === 'success' ? 'Success' : 'Attention'}</p>
            <p className="text-xs font-bold leading-tight">{error.message}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#9A287E] text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-pink-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          {loading ? (
            <span className="text-xs">Processing...</span>
          ) : (
            <span>{isSignUp ? 'Create User' : 'Sign In'}</span>
          )}
        </button>
      </form>

      <div className="mt-8 text-center">
        <button
          onClick={toggleMode}
          className="text-[#9A287E] font-black text-[9px] uppercase tracking-widest px-6 py-3 bg-slate-50 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors"
        >
          {isSignUp ? 'Back to Login' : 'Create New Administrator'}
        </button>
      </div>

      <div className="mt-auto pt-8 text-center">
        <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.3em]">
          Registry v1.0.3
        </p>
      </div>
    </div>
  );
};

export default Login;
