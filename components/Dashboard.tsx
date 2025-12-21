
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';

interface DashboardProps {
  user: UserProfile;
  onSignOut: () => void;
}

interface LiveMetrics {
  totalAssessments: number;
  totalDemand: number;
  netCollections: number;
  pendingAmount: number;
  efficiency: number;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  const [collections, setCollections] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'data'>('home');
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [isSyncing, setIsSyncing] = useState(false);

  const [metrics, setMetrics] = useState<LiveMetrics>({
    totalAssessments: 0,
    totalDemand: 0,
    netCollections: 0,
    pendingAmount: 0,
    efficiency: 0
  });

  // Helper to fetch ALL rows across pages to bypass the 1000 row limit
  const fetchAllRows = async (table: string, columns: string) => {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) {
        console.error(`Error fetching ${table}:`, error);
        break;
      }
      
      if (!data || data.length === 0) break;
      
      allData = [...allData, ...data];
      if (data.length < pageSize) break;
      page++;
    }
    return allData;
  };

  const fetchRealTimeStats = useCallback(async () => {
    setIsSyncing(true);
    try {
      // 1. Get exact count of assessments
      const { count: assessmentCount } = await supabase
        .from('assessments')
        .select('*', { count: 'exact', head: true });

      // 2. Fetch ALL demand records to sum accurately
      const demandRows = await fetchAllRows('demands', 'total_demand');
      const totalDemand = demandRows.reduce((acc, curr) => acc + (Number(curr.total_demand) || 0), 0);

      // 3. Fetch ALL collection records with ALL needed fields (Fixes N/A name issue)
      const collectionRows = await fetchAllRows('collections', 'id, owner_name, total_tax, date_of_payment, receipt_no, assessment_no');
      const totalCollected = collectionRows.reduce((acc, curr) => acc + (Number(curr.total_tax) || 0), 0);

      const assessments = assessmentCount || 0;
      const efficiency = totalDemand > 0 ? (totalCollected / totalDemand) * 100 : 0;

      setMetrics({
        totalAssessments: assessments,
        totalDemand: totalDemand,
        netCollections: totalCollected,
        pendingAmount: totalDemand - totalCollected,
        efficiency
      });
      
      // Update the local list for the history tab
      setCollections(collectionRows.sort((a, b) => 
        new Date(b.date_of_payment).getTime() - new Date(a.date_of_payment).getTime()
      ));

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Metrics sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchRealTimeStats();

    const channels = [
      supabase.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchRealTimeStats();
      }).subscribe()
    ];

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [fetchRealTimeStats]);

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter(c => 
      (c.owner_name?.toLowerCase() || '').includes(query) ||
      (c.assessment_no?.toLowerCase() || '').includes(query) ||
      (c.receipt_no?.toLowerCase() || '').includes(query)
    );
  }, [searchQuery, collections]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val).replace('INR', '₹');
  };

  const userInitials = (user.full_name || user.email || '?').charAt(0).toUpperCase();

  const dashboardCards = [
    { label: 'Assessments', value: metrics.totalAssessments, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { label: 'Total Demand', value: formatCurrency(metrics.totalDemand), color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { label: 'Collected', value: formatCurrency(metrics.netCollections), color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Net Pending', value: formatCurrency(metrics.pendingAmount), color: 'text-rose-600', bg: 'bg-rose-50', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
      <header className="px-6 pt-10 pb-6 bg-white shrink-0 border-b border-slate-100 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-100">
              {userInitials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 leading-none mb-1 truncate max-w-[180px]">
                {user.full_name || 'Administrator'}
              </h1>
              <div className="flex items-center space-x-2">
                 <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase rounded-md tracking-tighter shrink-0">
                   {user.role || 'Superuser'}
                 </span>
                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">Live Sync Active</span>
              </div>
            </div>
          </div>
          <button onClick={onSignOut} className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors border border-slate-100 shadow-sm active:scale-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6 no-scrollbar">
        {activeTab === 'home' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Analytics</p>
              <p className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${isSyncing ? 'text-amber-500' : 'text-indigo-600'}`}>
                {isSyncing ? 'Synchronizing...' : `Last Sync: ${lastUpdated}`}
              </p>
            </div>
            
            <section className="grid grid-cols-2 gap-4">
              {dashboardCards.map((card, i) => (
                <div key={i} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className={`w-8 h-8 ${card.bg} ${card.color} rounded-xl flex items-center justify-center shrink-0`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={card.icon} /></svg>
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate leading-none">{card.label}</p>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight truncate pl-1">
                    {isSyncing ? '...' : card.value}
                  </h3>
                </div>
              ))}
            </section>

            <section className="bg-indigo-900 rounded-[3rem] p-7 text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full -mr-16 -mt-16 blur-2xl"></div>
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <h3 className="text-lg font-black mb-1">Collection Progress</h3>
                   <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest truncate">Recovery Status</p>
                 </div>
                 <div className="text-right">
                   <p className="text-xl font-black">{metrics.efficiency.toFixed(1)}%</p>
                   <p className="text-[8px] font-bold uppercase opacity-50 tracking-widest">Achieved</p>
                 </div>
               </div>
               <div className="w-full bg-indigo-800/50 rounded-full h-3 mb-6 relative overflow-hidden">
                 <div 
                   className={`h-full bg-emerald-400 transition-all duration-1000 ease-out rounded-full ${isSyncing ? 'opacity-50' : 'opacity-100'}`}
                   style={{ width: `${Math.min(metrics.efficiency, 100)}%` }}
                 ></div>
               </div>
               <button 
                onClick={fetchRealTimeStats} 
                disabled={isSyncing}
                className="w-full bg-white text-indigo-900 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:bg-slate-200"
               >
                 {isSyncing ? 'Recalculating...' : 'Force Refresh All Records'}
               </button>
            </section>

            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1 flex items-center justify-between">
                <span>Recent Payments</span>
                <button onClick={() => setActiveTab('data')} className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter">History</button>
              </h3>
              <div className="space-y-3">
                {collections.length > 0 ? (
                  collections.slice(0, 5).map((reg) => (
                    <div key={reg.id} className="p-4 bg-white rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:border-indigo-100 transition-colors cursor-pointer group">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-black text-xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">₹</div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{reg.owner_name || 'N/A'}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Assmt: {reg.assessment_no}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-900">{formatCurrency(reg.total_tax)}</p>
                        <p className="text-[8px] font-bold text-slate-300">{new Date(reg.date_of_payment).toLocaleDateString('en-IN')}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center">
                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">No Activity Records</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-4">
             <div className="mb-6 px-1">
               <h2 className="text-xl font-black text-slate-900 mb-4">Collection Records</h2>
               <div className="relative group">
                 <input 
                   type="text"
                   placeholder="Search name, assessment or receipt..."
                   className="w-full bg-white border border-slate-100 px-12 py-4 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                 />
                 <svg className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                 </svg>
                 {searchQuery && (
                   <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                 )}
               </div>
             </div>

             <div className="space-y-3 pb-20">
               {filteredCollections.length > 0 ? (
                 filteredCollections.map((reg) => (
                   <div key={reg.id} className="p-5 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm transition-transform active:scale-[0.98]">
                     <div className="flex justify-between items-start mb-3">
                       <div className="min-w-0 pr-2">
                         <h4 className="font-bold text-slate-900 text-sm leading-tight mb-0.5 truncate">{reg.owner_name || 'Unnamed'}</h4>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Assmnt: {reg.assessment_no}</p>
                       </div>
                       <span className="text-sm font-black text-emerald-600 shrink-0">{formatCurrency(reg.total_tax)}</span>
                     </div>
                     <div className="flex items-center justify-between pt-3 border-t border-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                       <span className="bg-slate-50 px-2 py-1 rounded-md">RCPT: {reg.receipt_no}</span>
                       <span>{new Date(reg.date_of_payment).toLocaleDateString('en-IN')}</span>
                     </div>
                   </div>
                 ))
               ) : (
                 <div className="p-12 text-center">
                   <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                     <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   </div>
                   <p className="text-slate-400 text-xs font-bold italic">No matching results for your query</p>
                 </div>
               )}
             </div>
          </div>
        )}
      </main>

      <nav className="bg-white border-t border-slate-50 px-10 py-5 shrink-0 rounded-t-[3rem] z-30 flex justify-between items-center shadow-[0_-15px_40px_rgba(0,0,0,0.03)]">
          <button onClick={() => setActiveTab('home')} className={`p-3.5 rounded-2xl transition-all duration-300 ${activeTab === 'home' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-110' : 'text-slate-300 hover:text-indigo-400'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={() => setActiveTab('data')} className={`p-3.5 rounded-2xl transition-all duration-300 ${activeTab === 'data' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-110' : 'text-slate-300 hover:text-indigo-400'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
      </nav>
    </div>
  );
};

export default Dashboard;
