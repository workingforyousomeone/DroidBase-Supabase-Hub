
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

const getZoneStatus = (pending: number, demand: number) => {
  if (demand === 0) return { color: 'bg-slate-300' };
  const ratio = pending / demand;
  if (ratio <= 0) return { color: 'bg-emerald-500' };
  if (ratio > 0.5) return { color: 'bg-rose-500' };
  return { color: 'bg-amber-500' };
};

const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  // Data State
  const [collections, setCollections] = useState<any[]>([]);
  const [zones, setZones] = useState<ZoneMetrics[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  
  // Specialized States
  const [zoneOwners, setZoneOwners] = useState<any[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<any[]>([]);
  const [ownerPayments, setOwnerPayments] = useState<any[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [selectedOwner, setSelectedOwner] = useState<OwnerSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vw_cluster_overall_summary')
        .select('no_of_assessments, total_demand, total_collected, total_pending');

      if (error) return null;

      const summary = data.reduce(
        (acc, curr) => ({
          totalAssessments: acc.totalAssessments + (curr.no_of_assessments || 0),
          totalDemand: acc.totalDemand + (curr.total_demand || 0),
          netCollections: acc.netCollections + (curr.total_collected || 0),
          pendingAmount: acc.pendingAmount + (curr.total_pending || 0),
        }),
        { totalAssessments: 0, totalDemand: 0, netCollections: 0, pendingAmount: 0 }
      );

      return {
        totalAssessments: summary.totalAssessments,
        totalDemand: summary.totalDemand,
        netCollections: summary.netCollections,
        pendingAmount: summary.pendingAmount,
        efficiency: summary.totalDemand > 0 ? (summary.netCollections / summary.totalDemand) * 100 : 0
      };
    } catch (err) {
      return null;
    }
  }, []);

  const syncData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [viewMetrics, collectionsRes, ownersRes, zoneSummaryRes] = await Promise.all([
        fetchMetrics(),
        supabase.from('collections').select('*').order('date_of_payment', { ascending: false }).limit(100),
        supabase.from('owners').select('assessment_no, owner_name, guardian_name'),
        supabase.from('vw_cluster_overall_summary').select('*')
      ]);

      setMetrics(viewMetrics ?? { totalAssessments: 0, totalDemand: 0, netCollections: 0, pendingAmount: 0, efficiency: 0 });

      const nameMap = new Map<string, string>();
      (ownersRes.data || []).forEach(o => {
        const id = DataTransformer.normalizeId(o.assessment_no);
        if (id && o.owner_name) nameMap.set(id, o.owner_name);
      });

      setCollections((collectionsRes.data || []).map(c => ({
        ...c,
        owner_name: nameMap.get(DataTransformer.normalizeId(c.assessment_no) || '') || c.owner_name || 'Property Owner'
      })));

      setZones((zoneSummaryRes.data || []).map(z => ({
        id: z.cluster_id,
        name: `Zone ${z.cluster_id}`,
        recordCount: z.no_of_assessments,
        demand: z.total_demand,
        collected: z.total_collected,
        pending: z.total_pending
      })));

      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchMetrics]);

  const loadZoneOwners = async (clusterId: string) => {
    setIsSyncing(true);
    const { data, error } = await supabase.from('vw_cluster_owner_summary').select('*').eq('cluster_id', clusterId);
    if (!error) {
      setZoneOwners(data || []);
      setActiveTab('records');
    }
    setIsSyncing(false);
  };

  const openOwner = async (owner: any) => {
    setIsSyncing(true);
    const [profileRes, paymentsRes] = await Promise.all([
      supabase.from('vw_owner_full_profile').select('*').eq('owner_name', owner.owner_name),
      supabase.from('vw_owner_payment_history').select('*').eq('assessment_no', owner.assessment_no || '')
    ]);

    setOwnerProfile(profileRes.data || []);
    setOwnerPayments(paymentsRes.data || []);
    setSelectedOwner({
      owner_name: owner.owner_name,
      guardian_name: owner.guardian_name || '',
      totalDemand: owner.total_demand || 0,
      totalCollected: owner.total_collected || 0,
      totalPending: owner.total_pending || 0,
      records: []
    });
    setActiveTab('ownerDetail');
    setIsSyncing(false);
  };

  useEffect(() => {
    syncData();
    const channel = supabase.channel('db-master-sync').on('postgres_changes', { event: '*', schema: 'public' }, () => syncData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [syncData]);

  const userInitials = (user.full_name || user.email || '?').charAt(0).toUpperCase();

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50 relative selection:bg-pink-100">
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
            <button onClick={onSignOut} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-600 transition-all border border-slate-100 active:scale-90">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </header>

        {activeTab === 'home' && metrics && (
          <div className="px-5 py-4 space-y-4 bg-slate-50/50 border-b border-slate-100">
            <button onClick={syncData} disabled={isSyncing} className="w-full h-10 bg-white border border-slate-100 text-[#9A287E] rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 active:scale-95 disabled:opacity-50">
              {isSyncing ? 'Syncing Master Data...' : 'Refresh Master Data'}
            </button>
            <section className="grid grid-cols-2 gap-2">
              {[
                { label: 'ASSETS', value: metrics.totalAssessments, color: 'text-[#9A287E]' },
                { label: 'Demand', value: DataTransformer.formatCurrency(metrics.totalDemand), color: 'text-amber-600' },
                { label: 'Collected', value: DataTransformer.formatCurrency(metrics.netCollections), color: 'text-emerald-600' },
                { label: 'Pending', value: DataTransformer.formatCurrency(metrics.pendingAmount), color: 'text-rose-600' },
              ].map((card, i) => (
                <div key={i} className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex flex-col min-h-[64px] justify-center items-center text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
                  <h3 className={`text-sm font-black tracking-tight truncate w-full ${card.color}`}>{card.value}</h3>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-5 py-6 pb-32 no-scrollbar">
        {activeTab === 'home' && (
          <div className="space-y-6 animate-in fade-in duration-500 min-h-full">
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1">Recent Collections</h3>
              <div className="space-y-3">
                {collections.length > 0 ? collections.slice(0, 10).map((reg) => (
                  <div key={reg.id} className="p-4 bg-white rounded-xl border border-slate-100 flex items-center justify-between shadow-sm">
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
                )) : (
                  <div className="py-10 text-center bg-white rounded-xl border border-dashed border-slate-200">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No collection data found</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'zones' && (
          <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-400 min-h-full">
            <div className="mb-2 px-1">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Zone Directory</h2>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{zones.length} Verified Zones</p>
            </div>
            {zones.map((zone) => {
              const status = getZoneStatus(zone.pending, zone.demand);
              return (
                <div key={zone.id} onClick={() => loadZoneOwners(zone.id)} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-[#9A287E] active:scale-[0.98] cursor-pointer group relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-[#9A287E] rounded-xl flex items-center justify-center text-white relative">
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

        {activeTab === 'records' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300 min-h-full">
            <button onClick={() => setActiveTab('zones')} className="flex items-center space-x-2 text-[#9A287E] font-black text-[9px] uppercase tracking-widest bg-white px-4 py-2.5 rounded-lg border border-slate-100 active:scale-95 transition-all mb-4">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Zones</span>
            </button>
            <div className="space-y-3">
              {zoneOwners.length > 0 ? zoneOwners.map(o => (
                <div key={o.owner_name} onClick={() => openOwner(o)} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm cursor-pointer hover:border-[#9A287E] active:scale-[0.98] transition-all">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-4">
                      <p className="font-black text-xs text-slate-900 uppercase truncate tracking-tight">{o.owner_name}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-widest">{o.no_of_properties} Properties</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${o.total_pending > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {o.total_pending > 0 ? 'Outstanding' : 'Settled'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mt-3 pt-3 border-t border-slate-50">
                    <div><p className="text-[7px] text-slate-400 font-black uppercase">Demand</p><p className="text-[9px] font-black">{DataTransformer.formatCurrency(o.total_demand)}</p></div>
                    <div><p className="text-[7px] text-emerald-500 font-black uppercase">Paid</p><p className="text-[9px] font-black text-emerald-600">{DataTransformer.formatCurrency(o.total_collected)}</p></div>
                    <div><p className="text-[7px] text-rose-500 font-black uppercase">Balance</p><p className="text-[9px] font-black text-rose-600">{DataTransformer.formatCurrency(o.total_pending)}</p></div>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No owners found in this zone</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ownerDetail' && selectedOwner && (
          <div className="space-y-5 animate-in slide-in-from-right-4 duration-300 pb-24 min-h-full">
            <button onClick={() => setActiveTab('records')} className="flex items-center space-x-2 text-[#9A287E] font-black text-[9px] uppercase tracking-widest bg-white px-4 py-2.5 rounded-lg border border-slate-100 shadow-sm active:scale-95 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to List</span>
            </button>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 w-24 h-24 bg-pink-50 rounded-full -mr-12 -mt-12 opacity-30"></div>
              <div className="flex items-center space-x-4 mb-6 relative z-10">
                <div className="w-14 h-14 bg-[#9A287E] rounded-xl flex items-center justify-center text-white text-xl font-black uppercase shadow-lg shadow-pink-100 shrink-0">
                  {selectedOwner.owner_name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight truncate leading-tight">{selectedOwner.owner_name}</h2>
                  <p className="text-[9px] font-bold text-[#9A287E] uppercase tracking-widest mt-0.5 truncate">Property Profile Portfolio</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 relative z-10 text-center">
                 <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/50"><p className="text-[7px] font-black text-slate-400 uppercase mb-1">Demand</p><p className="text-[11px] font-black text-slate-900">{DataTransformer.formatCurrency(selectedOwner.totalDemand)}</p></div>
                 <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100/50"><p className="text-[7px] font-black text-emerald-500 uppercase mb-1">Collected</p><p className="text-[11px] font-black text-emerald-600">{DataTransformer.formatCurrency(selectedOwner.totalCollected)}</p></div>
                 <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100/50"><p className="text-[7px] font-black text-rose-500 uppercase mb-1">Outstanding</p><p className="text-[11px] font-black text-rose-700">{DataTransformer.formatCurrency(selectedOwner.totalPending)}</p></div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="px-1"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Verified Asset Portfolio</h3></div>
              {ownerProfile.length > 0 ? ownerProfile.map((p, idx) => (
                <section key={idx} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                    <div><p className="text-[8px] font-black text-[#9A287E] uppercase tracking-widest">Asset Reference</p><p className="text-xs font-black text-slate-900">{p.assessment_no}</p></div>
                    <div className="text-right"><p className="text-[8px] font-black text-slate-400 uppercase">Usage Type</p><p className="text-[10px] font-bold text-slate-800 uppercase">{p.usage || 'N/A'}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div><p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Plot Area</p><p className="text-[10px] font-bold">{p.plot_area || '0'} sqft</p></div>
                    <div><p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Construction</p><p className="text-[10px] font-bold">{p.construction_type || 'N/A'}</p></div>
                    <div className="col-span-2"><p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Property Location</p><p className="text-[10px] font-bold text-slate-800 break-words">{p.address || 'Central Zone Registry'}</p></div>
                  </div>
                </section>
              )) : (
                 <div className="py-10 text-center bg-white rounded-xl border border-dashed border-slate-200">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Profile data sync pending</p>
                 </div>
              )}
              <div className="px-1"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Audit Payment History</h3></div>
              <section className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
                 {ownerPayments.length > 0 ? (
                    <div className="space-y-3">
                       {ownerPayments.map((pay, idx) => (
                         <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="text-left"><p className="text-[7px] font-black text-slate-400 uppercase">Audit Date</p><p className="text-[10px] font-bold text-slate-900">{new Date(pay.date_of_payment).toLocaleDateString()}</p></div>
                            <div className="text-right"><p className="text-[7px] font-black text-emerald-500 uppercase">Net Settled</p><p className="text-sm font-black text-emerald-600">{DataTransformer.formatCurrency(pay.total_tax)}</p></div>
                         </div>
                       ))}
                    </div>
                 ) : (
                    <div className="py-4 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">No verified transaction logs</p>
                    </div>
                 )}
              </section>
            </div>
          </div>
        )}

        {activeTab === 'collections' && (
          <div className="space-y-4 min-h-full">
             <div className="mb-4 px-1">
               <h2 className="text-xl font-black text-slate-900 tracking-tight">Audit Ledger</h2>
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global History</p>
             </div>
             <div className="space-y-3">
               {collections.length > 0 ? collections.map(c => (
                 <div key={c.id} className="p-4 bg-white rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                    <div className="min-w-0 pr-4 text-left">
                      <p className="text-xs font-black text-slate-900 truncate uppercase tracking-tight">{c.owner_name}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Ref: {c.assessment_no}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-emerald-600">{DataTransformer.formatCurrency(c.total_tax)}</p>
                      <p className="text-[8px] font-bold text-slate-300 uppercase">{new Date(c.date_of_payment).toLocaleDateString()}</p>
                    </div>
                 </div>
               )) : (
                 <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No global payments found</p>
                 </div>
               )}
             </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-6 py-4 z-50 flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
          {[
            { id: 'home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'zones', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
            { id: 'collections', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { if (['home', 'zones', 'collections'].includes(tab.id)) setActiveTab(tab.id as TabType); }}
              className={`p-3.5 rounded-xl transition-all relative ${
                (activeTab === tab.id || (tab.id === 'zones' && (activeTab === 'records' || activeTab === 'ownerDetail')))
                  ? 'bg-[#9A287E] text-white shadow-md' : 'text-slate-300 hover:text-[#9A287E]'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={tab.id === 'zones' ? "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" : tab.icon} /></svg>
            </button>
          ))}
      </nav>
    </div>
  );
};

export default Dashboard;
