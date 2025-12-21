
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { DataService } from '../services/api';
import { DataTransformer } from '../utils/transformers';
import { 
  UserProfile, 
  AssessmentRecord, 
  ZoneMetrics, 
  LiveMetrics, 
  OwnerSummary 
} from '../types';

interface DashboardProps {
  user: UserProfile;
  onSignOut: () => void;
}

type TabType = 'home' | 'zones' | 'assessment_reg' | 'demand_reg' | 'collections' | 'records' | 'ownerDetail';

const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  // Data State
  const [collections, setCollections] = useState<any[]>([]);
  const [zones, setZones] = useState<ZoneMetrics[]>([]);
  const [allAssessments, setAllAssessments] = useState<AssessmentRecord[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  
  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [selectedZone, setSelectedZone] = useState<ZoneMetrics | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<OwnerSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const syncData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [zoneRes, assessments, demands, rawCollections, rawOwners] = await Promise.all([
        DataService.getZones(),
        DataService.fetchAll('assessments'),
        DataService.fetchAll('demands'),
        DataService.fetchAll('collections'),
        DataService.getOwners()
      ]);

      if (zoneRes.error) throw zoneRes.error;

      const result = DataTransformer.processMasterData(
        assessments, 
        demands, 
        rawCollections, 
        zoneRes.data,
        rawOwners
      );

      setAllAssessments(result.enriched);
      setZones(result.zoneMetrics);
      setMetrics(result.liveMetrics);
      
      const enrichedHistory = rawCollections.map(c => {
        const normId = DataTransformer.normalizeId(c.assessment_no);
        return {
          ...c,
          owner_name: (normId ? result.nameMap.get(normId) : null) || c.owner_name || 'Property Owner'
        };
      }).sort((a, b) => new Date(b.date_of_payment).getTime() - new Date(a.date_of_payment).getTime());

      setCollections(enrichedHistory);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Master Sync Error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    syncData();
    const channel = supabase.channel('db-master-sync').on('postgres_changes', { event: '*', schema: 'public' }, () => {
      syncData();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [syncData]);

  // Unified Search
  const globalFilteredRecords = useMemo(() => {
    if (!searchQuery) return allAssessments;
    const q = searchQuery.toLowerCase();
    return allAssessments.filter(a => 
      a.owner_name.toLowerCase().includes(q) || 
      a.assessment_no.toLowerCase().includes(q)
    );
  }, [allAssessments, searchQuery]);

  // Zone Individual Records Processing
  const zoneIndividualRecords = useMemo(() => {
    if (!selectedZone) return [];
    return globalFilteredRecords
      .filter(a => a.zone_id === selectedZone.id)
      .sort((a, b) => b.pending - a.pending);
  }, [selectedZone, globalFilteredRecords]);

  const navigateToOwner = (ownerName: string, records: AssessmentRecord[]) => {
    // Logic: Use the already resolved guardian_name from the record itself
    const guardian = records[0]?.guardian_name || '';

    setSelectedOwner({
      owner_name: ownerName,
      guardian_name: guardian,
      totalDemand: records.reduce((s, r) => s + r.demand, 0),
      totalCollected: records.reduce((s, r) => s + r.collected, 0),
      totalPending: records.reduce((s, r) => s + r.pending, 0),
      records: records
    });
    setActiveTab('ownerDetail');
  };

  const getZoneStatus = (pending: number, demand: number) => {
    if (pending <= 0) return { color: 'bg-emerald-500', label: 'Settled', text: 'text-emerald-700', bg: 'bg-emerald-50' };
    const ratio = pending / (demand || 1);
    if (ratio > 0.5) return { color: 'bg-rose-500', label: 'Action Needed', text: 'text-rose-700', bg: 'bg-rose-50' };
    return { color: 'bg-amber-500', label: 'Ongoing', text: 'text-amber-700', bg: 'bg-amber-50' };
  };

  const userInitials = (user.full_name || user.email || '?').charAt(0).toUpperCase();

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative selection:bg-pink-100">
      {/* FIXED TOP SECTION */}
      <div className="shrink-0 bg-white z-50 shadow-sm">
        <header className="px-6 pt-12 pb-4 border-b border-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 bg-[#9A287E] rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-pink-200/50 uppercase ring-4 ring-white">
                {userInitials}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-black text-slate-900 leading-none mb-1 truncate max-w-[180px]">
                  {user.full_name || 'Admin'}
                </h1>
                <div className="flex items-center space-x-2">
                  <span className="px-1.5 py-0.5 bg-pink-50 text-[#9A287E] text-[8px] font-black uppercase rounded tracking-tighter">
                    {user.role}
                  </span>
                  <div className="flex items-center space-x-1.5 ml-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      {isSyncing ? 'Syncing' : `Live ${lastUpdated}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button 
              onClick={onSignOut} 
              className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-600 transition-all border border-slate-100 hover:shadow-md active:scale-90"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        {activeTab === 'home' && metrics && (
          <div className="px-5 py-4 space-y-4 bg-slate-50/50 border-b border-slate-100">
            <button 
              onClick={syncData} 
              disabled={isSyncing}
              className="w-full h-10 bg-white border border-slate-100 text-[#9A287E] rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center justify-center active:scale-95 disabled:opacity-50"
            >
              {isSyncing ? 'Syncing Master Data...' : 'Refresh Master Data'}
            </button>
            
            <section className="grid grid-cols-2 gap-2">
              {[
                { label: 'ASSETS', value: metrics.totalAssessments, color: 'text-[#9A287E]', bg: 'bg-[#9A287E]/10', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
                { label: 'Demand', value: DataTransformer.formatCurrency(metrics.totalDemand), color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M13 7h8m0 0v8m0-8l-8 8' },
                { label: 'Collected', value: DataTransformer.formatCurrency(metrics.netCollections), color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4' },
                { label: 'Pending', value: DataTransformer.formatCurrency(metrics.pendingAmount), color: 'text-rose-600', bg: 'bg-rose-50', icon: 'M12 8v4l3 3' },
              ].map((card, i) => (
                <div key={i} className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex flex-col min-h-[64px] justify-center items-center text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight truncate w-full">{card.value}</h3>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-5 py-6 no-scrollbar pb-32">
        {activeTab === 'home' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1">Recent Collections</h3>
              <div className="space-y-3">
                {collections.slice(0, 10).map((reg) => (
                  <div key={reg.id} className="p-4 bg-white rounded-xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 font-black text-xs shrink-0">₹</div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate uppercase">{reg.owner_name}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">ID: {reg.assessment_no}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-slate-900">{DataTransformer.formatCurrency(reg.total_tax)}</p>
                      <p className="text-[8px] font-bold text-slate-300">{new Date(reg.date_of_payment).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'zones' && (
          <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-400">
            <div className="mb-2 px-1">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Zone Directory</h2>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{zones.length} Verified Zones</p>
            </div>
            {zones.map((zone) => {
              const status = getZoneStatus(zone.pending, zone.demand);
              return (
                <div key={zone.id} onClick={() => { setSelectedZone(zone); setActiveTab('records'); }} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-[#9A287E] active:scale-[0.98] cursor-pointer group relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 ${zone.id === 'unassigned' ? 'bg-slate-200' : 'bg-[#9A287E]'} rounded-xl flex items-center justify-center text-white shadow-md group-hover:rotate-3 transition-transform relative`}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${status.color}`}></div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-slate-900 text-base leading-tight uppercase tracking-tight">{zone.name}</h4>
                        <p className="text-[9px] text-[#9A287E] font-bold uppercase tracking-widest mt-0.5">{zone.recordCount} Assets</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-rose-50 p-3 rounded-xl text-center">
                      <p className="text-[8px] font-black text-rose-600 uppercase mb-0.5">Pending</p>
                      <p className="text-xs font-black text-rose-700">{DataTransformer.formatCurrency(zone.pending)}</p>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-xl text-center">
                      <p className="text-[8px] font-black text-emerald-600 uppercase mb-0.5">Paid</p>
                      <p className="text-xs font-black text-emerald-700">{DataTransformer.formatCurrency(zone.collected)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(activeTab === 'assessment_reg' || activeTab === 'demand_reg' || activeTab === 'records') && (
          <div className="space-y-4">
             {activeTab === 'records' && (
                <button onClick={() => setActiveTab('zones')} className="flex items-center space-x-2 text-[#9A287E] font-black text-[9px] uppercase tracking-widest bg-white px-4 py-2.5 rounded-lg border border-slate-100 active:scale-95 transition-all mb-4">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                  <span>Back</span>
                </button>
             )}
             <div className="relative group">
               <input 
                type="text" 
                placeholder="Search owner or ID..." 
                className="w-full bg-white border border-slate-100 px-5 py-3.5 rounded-xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-[#9A287E] transition-all" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
               />
             </div>
             <div className="space-y-3">
               {(activeTab === 'records' ? zoneIndividualRecords : globalFilteredRecords).map(record => (
                 <div key={record.assessment_no} onClick={() => navigateToOwner(record.owner_name, [record])} className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm hover:border-[#9A287E] active:scale-[0.98] cursor-pointer transition-all">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-4">
                        <h4 className="font-black text-slate-900 text-xs truncate uppercase tracking-tight">{record.owner_name}</h4>
                        <p className="text-[8px] font-bold text-[#9A287E] uppercase tracking-tighter mt-1">ID: {record.assessment_no}</p>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${record.pending <= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {record.pending <= 0 ? 'Clear' : 'Unpaid'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-50 text-center">
                       <div><p className="text-[7px] text-slate-400 font-bold uppercase">Demand</p><p className="text-[9px] font-black">{DataTransformer.formatCurrency(record.demand)}</p></div>
                       <div><p className="text-[7px] text-emerald-500 font-bold uppercase">Paid</p><p className="text-[9px] font-black text-emerald-600">{DataTransformer.formatCurrency(record.collected)}</p></div>
                       <div><p className="text-[7px] text-rose-500 font-bold uppercase">Bal</p><p className="text-[9px] font-black text-rose-600">{DataTransformer.formatCurrency(record.pending)}</p></div>
                    </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'collections' && (
          <div className="space-y-4">
             <div className="mb-4 px-1">
               <h2 className="text-xl font-black text-slate-900 tracking-tight">Audit Ledger</h2>
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">History</p>
             </div>
             <div className="space-y-3">
               {collections.map(c => (
                 <div key={c.id} className="p-4 bg-white rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                    <div className="min-w-0 pr-4">
                      <p className="text-xs font-black text-slate-900 truncate uppercase tracking-tight">{c.owner_name}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Ref: {c.assessment_no}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-emerald-600">{DataTransformer.formatCurrency(c.total_tax)}</p>
                      <p className="text-[8px] font-bold text-slate-300 uppercase">{new Date(c.date_of_payment).toLocaleDateString()}</p>
                    </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'ownerDetail' && selectedOwner && (
          <div className="space-y-5 animate-in slide-in-from-right-4 duration-300 pb-12">
            <button onClick={() => setActiveTab('home')} className="flex items-center space-x-2 text-[#9A287E] font-black text-[9px] uppercase tracking-widest bg-white px-4 py-2.5 rounded-lg border border-slate-100 shadow-sm active:scale-95 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Overview</span>
            </button>
            
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 w-24 h-24 bg-pink-50 rounded-full -mr-12 -mt-12 opacity-30"></div>
              
              <div className="flex items-center space-x-4 mb-6 relative z-10">
                <div className="w-14 h-14 bg-[#9A287E] rounded-xl flex items-center justify-center text-white text-xl font-black uppercase shadow-lg shadow-pink-100 shrink-0">
                  {selectedOwner.owner_name.charAt(0)}
                </div>
                
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight truncate leading-tight">
                    {selectedOwner.owner_name}
                  </h2>
                  <p className="text-[9px] font-bold text-[#9A287E] uppercase tracking-widest mt-0.5 truncate">
                    {selectedOwner.guardian_name ? `Guardian: ${selectedOwner.guardian_name}` : 'Property Portfolio'}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 relative z-10">
                 <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/50">
                   <p className="text-[7px] font-black text-slate-400 uppercase mb-1">Demand</p>
                   <p className="text-[11px] font-black text-slate-900">{DataTransformer.formatCurrency(selectedOwner.totalDemand)}</p>
                 </div>
                 <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100/50">
                   <p className="text-[7px] font-black text-emerald-500 uppercase mb-1">Collected</p>
                   <p className="text-[11px] font-black text-emerald-600">{DataTransformer.formatCurrency(selectedOwner.totalCollected)}</p>
                 </div>
                 <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100/50">
                   <p className="text-[7px] font-black text-rose-500 uppercase mb-1">Outstanding</p>
                   <p className="text-[11px] font-black text-rose-700">{DataTransformer.formatCurrency(selectedOwner.totalPending)}</p>
                 </div>
              </div>
            </div>

            <div className="space-y-6">
              {selectedOwner.records.map((rec) => {
                const ownerCollections = collections.filter(c => DataTransformer.normalizeId(c.assessment_no) === rec.assessment_no);
                
                return (
                  <div key={rec.assessment_no} className="space-y-4">
                    <div className="flex flex-col px-2">
                       <div className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#9A287E]"></div>
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Asset: {rec.assessment_no}</p>
                       </div>
                       {rec.guardian_name && (
                         <p className="text-[9px] font-bold text-[#9A287E] uppercase ml-3.5 mt-1 tracking-tight">Guardian: {rec.guardian_name}</p>
                       )}
                    </div>

                    <section className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
                       <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center">
                          <svg className="w-3 h-3 mr-1.5 text-[#9A287E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                          Demand Collection Balance (DCB)
                       </h3>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-3">
                             <div>
                                <p className="text-[7px] font-black text-slate-400 uppercase">Total Demand</p>
                                <p className="text-sm font-black text-slate-900">{DataTransformer.formatCurrency(rec.demand)}</p>
                             </div>
                             <div>
                                <p className="text-[7px] font-black text-emerald-500 uppercase">Net Collected</p>
                                <p className="text-sm font-black text-emerald-600">{DataTransformer.formatCurrency(rec.collected)}</p>
                             </div>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3 flex flex-col justify-center text-center">
                             <p className="text-[7px] font-black text-rose-500 uppercase mb-1">Current Balance</p>
                             <p className="text-lg font-black text-rose-700">{DataTransformer.formatCurrency(rec.pending)}</p>
                          </div>
                       </div>
                    </section>

                    {rec.details && Object.entries(rec.details).map(([catName, fields]) => (
                      <section key={catName} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
                         <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">
                           {catName}
                         </h3>
                         <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                            {Object.entries(fields as any).map(([k, v]) => (
                              <div key={k}>
                                <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">{k}</p>
                                <p className="text-[10px] font-bold text-slate-800 break-words">{String(v)}</p>
                              </div>
                            ))}
                         </div>
                      </section>
                    ))}

                    <section className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
                       <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center">
                          <svg className="w-3 h-3 mr-1.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Payment Ledger
                       </h3>
                       {ownerCollections.length > 0 ? (
                         <div className="space-y-3">
                            {ownerCollections.map(c => (
                              <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                 <div>
                                    <p className="text-[7px] font-black text-slate-400 uppercase">Transaction Date</p>
                                    <p className="text-[10px] font-bold text-slate-900">{new Date(c.date_of_payment).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                 </div>
                                 <div className="text-right">
                                    <p className="text-[7px] font-black text-emerald-500 uppercase">Amount Paid</p>
                                    <p className="text-sm font-black text-emerald-600">{DataTransformer.formatCurrency(c.total_tax)}</p>
                                 </div>
                              </div>
                            ))}
                         </div>
                       ) : (
                         <div className="py-4 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">No verified payments found</p>
                         </div>
                       )}
                    </section>

                    <div className="bg-[#9A287E] text-white p-5 rounded-2xl shadow-lg shadow-pink-100/50 flex items-center justify-between">
                       <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                             <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                          </div>
                          <div>
                             <p className="text-[7px] font-black uppercase text-white/60">Asset Location</p>
                             <p className="text-xs font-black uppercase truncate max-w-[140px]">{zones.find(z => z.id === rec.zone_id)?.name || 'Central Registry'}</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-[7px] font-black uppercase text-white/60">Audit Rank</p>
                          <p className="text-xs font-black uppercase">Verified</p>
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-6 py-4 z-50 flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
          {[
            { id: 'home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'zones', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
            { id: 'assessment_reg', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { id: 'demand_reg', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
            { id: 'collections', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as TabType); setSearchQuery(''); }}
              className={`p-3.5 rounded-xl transition-all duration-200 relative ${
                (activeTab === tab.id || (tab.id === 'zones' && activeTab === 'records') || (activeTab === 'ownerDetail' && tab.id === 'home'))
                  ? 'bg-[#9A287E] text-white shadow-md' 
                  : 'text-slate-300 hover:text-[#9A287E]'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={tab.id === 'zones' ? "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" : tab.icon} />
              </svg>
            </button>
          ))}
      </nav>
    </div>
  );
};

export default Dashboard;
