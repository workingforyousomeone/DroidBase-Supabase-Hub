
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
    setSelectedOwner({
      owner_name: ownerName,
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
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative selection:bg-indigo-100">
      <header className="px-6 pt-12 pb-6 bg-white/80 backdrop-blur-xl shrink-0 border-b border-slate-100 z-30 sticky top-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-200/50 uppercase ring-4 ring-white">
              {userInitials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 leading-none mb-1 truncate max-w-[200px]">
                {user.full_name || 'Admin'}
              </h1>
              <div className="flex items-center space-x-2">
                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase rounded-md tracking-tighter">
                  {user.role}
                </span>
                <span className="flex items-center space-x-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{isSyncing ? 'Syncing' : 'Live'}</span>
                </span>
              </div>
            </div>
          </div>
          <button onClick={onSignOut} className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100 hover:shadow-md active:scale-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6 no-scrollbar pb-36">
        {activeTab === 'home' && metrics && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Status</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-600">Updated {lastUpdated}</p>
            </div>
            
            <section className="grid grid-cols-2 gap-4">
              {[
                { label: 'Registry', value: metrics.totalAssessments, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
                { label: 'Demand', value: DataTransformer.formatCurrency(metrics.totalDemand), color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M13 7h8m0 0v8m0-8l-8 8' },
                { label: 'Collected', value: DataTransformer.formatCurrency(metrics.netCollections), color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4' },
                { label: 'Pending', value: DataTransformer.formatCurrency(metrics.pendingAmount), color: 'text-rose-600', bg: 'bg-rose-50', icon: 'M12 8v4l3 3' },
              ].map((card, i) => (
                <div key={i} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-md active:scale-[0.98]">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className={`w-8 h-8 ${card.bg} ${card.color} rounded-xl flex items-center justify-center shrink-0`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={card.icon} /></svg>
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate leading-none">{card.label}</p>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight truncate pl-1">{card.value}</h3>
                </div>
              ))}
            </section>

            <section className="bg-indigo-900 rounded-[3.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/20 rounded-full -mr-24 -mt-24 blur-3xl transition-transform group-hover:scale-150 duration-700"></div>
               <div className="flex justify-between items-start mb-6 relative z-10">
                 <div>
                   <h3 className="text-xl font-black mb-1">Efficiency</h3>
                   <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest">Verified Recovery Rate</p>
                 </div>
                 <p className="text-2xl font-black">{metrics.efficiency.toFixed(1)}%</p>
               </div>
               <div className="w-full bg-indigo-800/50 rounded-full h-4 mb-6 relative overflow-hidden ring-4 ring-indigo-900/50">
                 <div className="h-full bg-emerald-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(metrics.efficiency, 100)}%` }}></div>
               </div>
               <button onClick={syncData} className="w-full bg-white text-indigo-900 py-4 rounded-3xl text-[11px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all relative z-10 hover:bg-slate-50">
                 Refresh Master Data
               </button>
            </section>

            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1">Recent Collections</h3>
              <div className="space-y-3">
                {collections.slice(0, 5).map((reg) => (
                  <div key={reg.id} className="p-4 bg-white rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-black text-xs shrink-0">₹</div>
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
            <div className="mb-2 px-1 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Zone Directory</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">32 Verified Zones</p>
              </div>
            </div>
            {zones.map((zone) => {
              const status = getZoneStatus(zone.pending, zone.demand);
              return (
                <div key={zone.id} onClick={() => { setSelectedZone(zone); setActiveTab('records'); }} className="p-7 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm transition-all hover:border-indigo-300 hover:shadow-lg active:scale-[0.98] cursor-pointer group relative overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className={`w-16 h-16 ${zone.id === 'unassigned' ? 'bg-slate-300' : 'bg-indigo-600'} rounded-[2rem] flex items-center justify-center text-white shadow-xl group-hover:rotate-6 transition-transform relative`}>
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${status.color}`}></div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-slate-900 text-xl leading-tight uppercase tracking-tight">{zone.name}</h4>
                        <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mt-1">{zone.recordCount} Linked Assets</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-2xl ${status.bg} ${status.text} text-[8px] font-black uppercase tracking-widest flex items-center space-x-1.5 shadow-sm`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.color}`}></span>
                      <span>{status.label}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-rose-50 p-5 rounded-[2.5rem] transition-colors group-hover:bg-rose-100">
                      <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-1">Total Pending</p>
                      <p className="text-lg font-black text-rose-700">{DataTransformer.formatCurrency(zone.pending)}</p>
                    </div>
                    <div className="bg-emerald-50 p-5 rounded-[2.5rem] transition-colors group-hover:bg-emerald-100">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total Collected</p>
                      <p className="text-lg font-black text-emerald-700">{DataTransformer.formatCurrency(zone.collected)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'records' && selectedZone && (
          <div className="space-y-6 animate-in slide-in-from-right-8 duration-500 pb-20">
            <button onClick={() => { setActiveTab('zones'); setSearchQuery(''); }} className="flex items-center space-x-2 text-indigo-600 font-black text-[11px] uppercase tracking-widest bg-white px-6 py-4 rounded-full border border-slate-100 shadow-sm active:scale-95 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Zone List</span>
            </button>

            <div className="px-1">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{selectedZone.name}</h2>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{zoneIndividualRecords.length} Individual Assets</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Pending: {DataTransformer.formatCurrency(selectedZone.pending)}</span>
              </div>
            </div>

            <div className="relative group px-1">
               <input 
                type="text" 
                placeholder="Search asset or owner..." 
                className="w-full bg-white border border-slate-100 px-7 py-5 rounded-3xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
               />
            </div>

            <div className="space-y-4">
              {zoneIndividualRecords.map((record) => (
                <div key={record.assessment_no} onClick={() => navigateToOwner(record.owner_name, [record])} className="bg-white p-7 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-lg active:scale-[0.98] cursor-pointer transition-all">
                  <div className="flex justify-between items-start mb-5">
                    <div className="min-w-0 pr-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Assessment ID: {record.assessment_no}</p>
                      <h4 className="font-black text-slate-900 text-base uppercase tracking-tight truncate leading-none">{record.owner_name}</h4>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shrink-0 ${record.pending <= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {record.pending <= 0 ? 'Settled' : 'Pending'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Demand</p><p className="text-sm font-black text-slate-900">{DataTransformer.formatCurrency(record.demand)}</p></div>
                    <div><p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Paid</p><p className="text-sm font-black text-emerald-600">{DataTransformer.formatCurrency(record.collected)}</p></div>
                    <div><p className="text-[8px] font-black text-rose-500 uppercase tracking-widest">Balance</p><p className="text-sm font-black text-rose-700">{DataTransformer.formatCurrency(record.pending)}</p></div>
                  </div>
                  <div className="mt-4 w-full bg-slate-50 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: `${Math.min((record.collected / (record.demand || 1)) * 100, 100)}%` }}></div>
                  </div>
                </div>
              ))}
              {zoneIndividualRecords.length === 0 && (
                <div className="text-center py-20 opacity-40">
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No matching assets found in this zone</p>
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTab === 'assessment_reg' || activeTab === 'demand_reg') && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-400">
             <div className="mb-4 px-1">
               <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                 {activeTab === 'assessment_reg' ? 'Master Registry' : 'Demand Register'}
               </h2>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                 {activeTab === 'assessment_reg' ? 'Property Database Archive' : 'Financial Recovery Status'}
               </p>
             </div>
             <div className="relative group">
               <input 
                type="text" 
                placeholder="Search owner or property ID..." 
                className="w-full bg-white border border-slate-100 px-7 py-5 rounded-3xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
               />
               <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
               </div>
             </div>
             
             <div className="space-y-3">
               {globalFilteredRecords.map(record => (
                 <div key={record.assessment_no} onClick={() => navigateToOwner(record.owner_name, [record])} className="p-6 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 active:scale-[0.98] cursor-pointer transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div className="min-w-0 pr-4">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          {record.zone_id === 'unassigned' ? 'External / Unlinked' : 'Verified Property'}
                        </p>
                        <h4 className="font-black text-slate-900 text-sm truncate uppercase tracking-tight leading-tight">{record.owner_name}</h4>
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter mt-1">ID: {record.assessment_no}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase shrink-0 tracking-widest ${record.pending <= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {record.pending <= 0 ? 'Settled' : 'Unpaid'}
                      </span>
                    </div>
                    {activeTab === 'assessment_reg' ? (
                       <div className="flex items-center space-x-2 pt-3 border-t border-slate-50">
                          <div className="w-5 h-5 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
                             Assigned Zone: {zones.find(z => z.id === record.zone_id)?.name || 'External'}
                          </span>
                       </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 border-t border-slate-50 pt-4 text-center">
                         <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase">Demand</p>
                            <p className="text-xs font-black text-slate-800">{DataTransformer.formatCurrency(record.demand)}</p>
                         </div>
                         <div>
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Paid</p>
                            <p className="text-xs font-black text-emerald-600">{DataTransformer.formatCurrency(record.collected)}</p>
                         </div>
                         <div>
                            <p className="text-[8px] font-black text-rose-500 uppercase">Balance</p>
                            <p className="text-xs font-black text-rose-600">{DataTransformer.formatCurrency(record.pending)}</p>
                         </div>
                      </div>
                    )}
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'ownerDetail' && selectedOwner && (
          <div className="animate-in zoom-in-95 duration-400 space-y-6 pb-20">
            <button onClick={() => setActiveTab('assessment_reg')} className="flex items-center space-x-2 text-indigo-600 font-black text-[11px] uppercase tracking-widest bg-white px-6 py-4 rounded-full shadow-sm border border-slate-100 active:scale-95 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Register</span>
            </button>

            <div className="bg-white rounded-[4rem] p-10 border border-slate-100 shadow-2xl shadow-slate-200/50">
              <div className="flex flex-col items-center text-center mb-10">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] flex items-center justify-center text-white text-4xl font-black mb-6 shadow-2xl shadow-indigo-100 uppercase ring-8 ring-indigo-50">
                  {selectedOwner.owner_name.charAt(0)}
                </div>
                <h2 className="text-3xl font-black text-slate-900 leading-tight mb-2 uppercase tracking-tight">{selectedOwner.owner_name}</h2>
                <div className="flex items-center space-x-2">
                   <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-full tracking-widest">
                     {selectedOwner.records.length} Linked Property{selectedOwner.records.length !== 1 ? 's' : ''}
                   </span>
                </div>
              </div>

              <div className="space-y-4 mb-10">
                 <div className="flex justify-between items-center p-6 bg-slate-50 rounded-[2.5rem] group hover:bg-slate-100 transition-colors">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate Demand</span>
                    <span className="text-xl font-black text-slate-900">{DataTransformer.formatCurrency(selectedOwner.totalDemand)}</span>
                 </div>
                 <div className="flex justify-between items-center p-6 bg-rose-50 rounded-[2.5rem] group hover:bg-rose-100 transition-colors">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Aggregate Balance</span>
                    <span className="text-xl font-black text-rose-700">{DataTransformer.formatCurrency(selectedOwner.totalPending)}</span>
                 </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1 border-l-4 border-indigo-600 pl-4">Asset Portfolio Audit</h4>
                {selectedOwner.records.map((rec) => (
                  <div key={rec.assessment_no} className="p-6 border border-slate-100 rounded-[3rem] bg-white shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-center mb-5">
                       <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Property ID</p>
                          <p className="text-base font-black text-indigo-600 tracking-tight">{rec.assessment_no}</p>
                       </div>
                       <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${rec.pending <= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{rec.pending <= 0 ? 'Clear' : 'Overdue'}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-3xl mb-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase">Assigned Zone</p>
                       <p className="text-xs font-black text-slate-900">{zones.find(z => z.id === rec.zone_id)?.name || 'External Registry'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                       <div className="bg-white border border-slate-100 p-4 rounded-3xl"><p className="text-[9px] font-black text-slate-400 uppercase">Assessment</p><p className="text-sm font-black text-slate-900">{DataTransformer.formatCurrency(rec.demand)}</p></div>
                       <div className="bg-white border border-slate-100 p-4 rounded-3xl"><p className="text-[9px] font-black text-rose-400 uppercase">Outstanding</p><p className="text-sm font-black text-rose-600">{DataTransformer.formatCurrency(rec.pending)}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'collections' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-400">
             <div className="mb-4 px-1">
               <h2 className="text-2xl font-black text-slate-900 tracking-tight">Financial Audit</h2>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Verification Ledger</p>
             </div>
             <div className="relative group">
                <input type="text" placeholder="Search collection history..." className="w-full bg-white border border-slate-100 px-7 py-5 rounded-3xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-500" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
             </div>
             <div className="space-y-3 pb-24">
               {collections.map(c => (
                 <div key={c.id} className="p-6 bg-white rounded-[2.5rem] border border-slate-100 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
                    <div className="min-w-0 pr-4">
                      <p className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{c.owner_name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ref: {c.assessment_no}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-emerald-600">{DataTransformer.formatCurrency(c.total_tax)}</p>
                      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{new Date(c.date_of_payment).toLocaleDateString()}</p>
                    </div>
                 </div>
               ))}
             </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-2xl border-t border-slate-100 px-6 py-5 z-40 flex justify-between items-center rounded-t-[3.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.06)]">
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
              className={`p-4 rounded-3xl transition-all duration-300 relative group ${
                (activeTab === tab.id || (tab.id === 'zones' && activeTab === 'records'))
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 -translate-y-2' 
                  : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={tab.id === 'zones' ? "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" : tab.icon} />
              </svg>
              {activeTab === tab.id && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full"></span>
              )}
            </button>
          ))}
      </nav>
    </div>
  );
};

export default Dashboard;
