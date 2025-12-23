
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { DataService } from '../services/api';
import { DataTransformer } from '../utils/transformers';
import { formatDateDMY } from '../utils/date';
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

type TabType = 'home' | 'zones' | 'records' | 'ownerDetail' | 'assessmentDetail' | 'collections';

/**
 * Visual status helper for zone performance
 */
const getZoneStatus = (pending: number, demand: number) => {
  if (demand === 0) return { 
    color: 'bg-slate-400', 
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M18 12H6" />, 
    label: 'Empty' 
  };
  const ratio = pending / demand;
  if (ratio <= 0) return { 
    color: 'bg-emerald-500', 
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />, 
    label: 'Settled' 
  };
  if (ratio > 0.5) return { 
    color: 'bg-rose-500', 
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />, 
    label: 'Critical' 
  };
  return { 
    color: 'bg-amber-500', 
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />, 
    label: 'Active' 
  };
};

const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  // Data State
  const [collections, setCollections] = useState<any[]>([]);
  const [zones, setZones] = useState<ZoneMetrics[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  
  // Specialized States
  const [zoneOwners, setZoneOwners] = useState<any[]>([]);
  const [ownerPortfolio, setOwnerPortfolio] = useState<any[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<OwnerSummary | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<{
    summary: any;
    propertyDetails: any;
    neighbouring: any;
    siteDetails: any;
    buildingDetails: any;
    floorDetails: any[];
    houseTax: any[];
    payments: any[];
    mutations: any[];
  } | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('home');
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
    } catch (err) { return null; }
  }, []);

  const syncData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [viewMetrics, collectionsRes, zoneSummaryRes] = await Promise.all([
        fetchMetrics(),
        supabase.from('collections').select('*').order('date_of_payment', { ascending: false }).limit(20),
        supabase.from('vw_cluster_overall_summary').select('*')
      ]);
      setMetrics(viewMetrics ?? { totalAssessments: 0, totalDemand: 0, netCollections: 0, pendingAmount: 0, efficiency: 0 });
      setCollections(collectionsRes.data || []);
      setZones((zoneSummaryRes.data || []).map(z => ({
        id: z.cluster_id,
        name: `Zone ${z.cluster_id}`,
        recordCount: z.no_of_assessments,
        demand: z.total_demand,
        collected: z.total_collected,
        pending: z.total_pending
      })));
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) { console.error('Sync error:', err); }
    finally { setIsSyncing(false); }
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
    try {
      const { data, error } = await supabase
        .from('vw_assessment_profile')
        .select('*')
        .eq('owner_name', owner.owner_name);

      if (error) throw error;

      setOwnerPortfolio(data || []);
      setSelectedOwner({
        owner_name: owner.owner_name,
        guardian_name: owner.guardian_name || '',
        totalDemand: owner.total_demand || 0,
        totalCollected: owner.total_collected || 0,
        totalPending: owner.total_pending || 0,
        records: []
      });
      setActiveTab('ownerDetail');
    } catch (err) {
      console.error('Owner fetch error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * STEP 1 — LOAD EVERYTHING (ONE FUNCTION)
   */
  const openAssessment = async (assessmentNo: string) => {
    setIsSyncing(true);
    try {
      const [
        profileRes,
        demandRes,
        paymentRes,
        mutationRes
      ] = await Promise.all([
        supabase.from('vw_assessment_profile').select('*').eq('assessment_no', assessmentNo).single(),
        supabase.from('demands').select('*').eq('assessment_no', assessmentNo).order('demand_year', { ascending: false }),
        supabase.from('collections').select('*').eq('assessment_no', assessmentNo).order('date_of_payment', { ascending: false }),
        supabase.from('mutations').select('*').eq('assessment_no', assessmentNo).order('date', { ascending: false })
      ]);

      if (profileRes.error) {
        console.error('Profile load error:', profileRes.error);
        return;
      }

      // BUILD A STRUCTURED OBJECT IN FRONTEND
      setSelectedAssessment({
        summary: profileRes.data,
        propertyDetails: {
          panchayat: profileRes.data.panchayat,
          village: profileRes.data.village,
          habitation: profileRes.data.habitation,
          survey_no: profileRes.data.survey_no,
          plot_no: profileRes.data.plot_no,
          door_no: profileRes.data.door_no,
          nature_of_property: profileRes.data.nature_of_property,
          nature_of_usage: profileRes.data.nature_of_usage,
          nature_of_ownership: profileRes.data.nature_of_ownership,
          mode_of_acquisition: profileRes.data.mode_of_acquisition
        },
        neighbouring: {
          east: profileRes.data.east,
          west: profileRes.data.west,
          north: profileRes.data.north,
          south: profileRes.data.south
        },
        siteDetails: {
          site_len: profileRes.data.site_len,
          site_breadth: profileRes.data.site_breadth,
          site_cap_val: profileRes.data.site_cap_val,
          site_rate: profileRes.data.site_rate
        },
        buildingDetails: {
          bldg_type: profileRes.data.bldg_type,
          bldg_cat: profileRes.data.bldg_cat,
          bldg_cap_val: profileRes.data.bldg_cap_val,
          bldg_rate: profileRes.data.bldg_rate
        },
        floorDetails: [
          {
            floor_desc: profileRes.data.floor_desc,
            floor_len: profileRes.data.floor_len,
            floor_breadth: profileRes.data.floor_breadth,
            total_floor_area: profileRes.data.total_floor_area,
            occ_desc: profileRes.data.occ_desc
          }
        ],
        houseTax: demandRes.data || [],
        payments: paymentRes.data || [],
        mutations: mutationRes.data || []
      });

      setActiveTab('assessmentDetail');
    } catch (err) {
      console.error('Critical Error loading assessment detail:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncData();
  }, [syncData]);

  const userInitials = (user.full_name || user.email || '?').charAt(0).toUpperCase();

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50 relative selection:bg-pink-100">
      {/* Header Section */}
      <div className="shrink-0 bg-white z-50 shadow-sm">
        <header className="px-6 pt-12 pb-4 border-b border-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 bg-[#9A287E] rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-pink-200/50 uppercase ring-4 ring-white">
                {userInitials}
              </div>
              <div className="min-w-0 text-left">
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
          <div className="px-5 py-4 space-y-4 bg-slate-50/50 border-b border-slate-100 animate-in slide-in-from-top-4 duration-300">
             <section className="grid grid-cols-2 gap-2">
              {[
                { label: 'ASSETS', value: metrics.totalAssessments, color: 'text-[#9A287E]', bg: 'bg-pink-50', onClick: () => setActiveTab('zones'), icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                { label: 'DEMAND', value: DataTransformer.formatCurrency(metrics.totalDemand), color: 'text-amber-600', bg: 'bg-amber-50', onClick: () => setActiveTab('zones'), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1' },
                { label: 'COLLECTED', value: DataTransformer.formatCurrency(metrics.netCollections), color: 'text-emerald-600', bg: 'bg-emerald-50', onClick: () => setActiveTab('collections'), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1' },
                { label: 'PENDING', value: DataTransformer.formatCurrency(metrics.pendingAmount), color: 'text-rose-600', bg: 'bg-rose-50', onClick: () => setActiveTab('zones'), icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' }
              ].map(card => (
                <button key={card.label} onClick={card.onClick} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center space-x-3 min-h-[72px] active:scale-95 transition-all">
                  <div className={`w-9 h-9 ${card.bg} rounded-lg flex items-center justify-center shrink-0`}>
                    <svg className={`w-4 h-4 ${card.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={card.icon} /></svg>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{card.label}</p>
                    <h3 className={`text-[11px] font-black tracking-tight ${card.color}`}>{card.value}</h3>
                  </div>
                </button>
              ))}
            </section>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-5 py-6 pb-32 no-scrollbar">
        
        {activeTab === 'home' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <section>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-left">Recent Transactions</h3>
                <div className="space-y-3">
                  {collections.slice(0, 5).map(c => (
                    <div key={c.id} className="p-4 bg-white rounded-xl border border-slate-100 flex items-center justify-between shadow-sm">
                       <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 font-black text-xs shrink-0">₹</div>
                          <div className="min-w-0 text-left">
                            <p className="text-xs font-bold text-slate-800 truncate uppercase">{c.owner_name || 'Property Owner'}</p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">REF: {c.assessment_no}</p>
                          </div>
                       </div>
                       <div className="text-right shrink-0">
                          <p className="text-xs font-black text-slate-900">{DataTransformer.formatCurrency(c.total_tax)}</p>
                          <p className="text-[8px] font-bold text-slate-300">{formatDateDMY(c.date_of_payment)}</p>
                       </div>
                    </div>
                  ))}
                </div>
             </section>
          </div>
        )}

        {activeTab === 'zones' && (
          <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="text-left mb-4"><h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Zone Directory</h2></div>
            {zones.map(z => {
              const status = getZoneStatus(z.pending, z.demand);
              return (
                <div key={z.id} onClick={() => loadZoneOwners(z.id)} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-[#9A287E] active:scale-[0.98] cursor-pointer transition-all">
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-14 h-14 bg-[#9A287E] rounded-xl flex items-center justify-center text-white shadow-lg relative">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      <div className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-lg ${status.color} border-2 border-white shadow-md flex items-center justify-center text-white`}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={status.icon.props.d} /></svg></div>
                    </div>
                    <div className="text-left flex-1">
                      <h4 className="font-black text-slate-900 text-base uppercase">{z.name}</h4>
                      <p className="text-[10px] text-[#9A287E] font-black uppercase tracking-widest">{z.recordCount} Asset Records</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-rose-50 p-3 rounded-xl border border-rose-100/30 text-left"><p className="text-[7px] font-black text-rose-500 uppercase tracking-widest">Pending</p><p className="text-sm font-black text-rose-700">{DataTransformer.formatCurrency(z.pending)}</p></div>
                    <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100/30 text-left"><p className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Collected</p><p className="text-sm font-black text-emerald-700">{DataTransformer.formatCurrency(z.collected)}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'records' && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <button onClick={() => setActiveTab('zones')} className="flex items-center space-x-2 text-[#9A287E] font-black text-[9px] uppercase tracking-widest bg-white px-4 py-2.5 rounded-lg border border-slate-100 active:scale-95 transition-all mb-4">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Directory</span>
            </button>
            <div className="space-y-3">
              {zoneOwners.map(o => (
                <div key={o.owner_name} onClick={() => openOwner(o)} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm cursor-pointer hover:border-[#9A287E] transition-all text-left">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-4">
                      <p className="font-black text-xs text-slate-900 uppercase truncate">{o.owner_name}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase mt-1">Portfolio: {o.no_of_properties} Assets</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${o.total_pending > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {o.total_pending > 0 ? 'Due' : 'Paid'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-50 text-center">
                    <div><p className="text-[7px] font-black text-slate-400 uppercase">Demand</p><p className="text-[9px] font-black">{DataTransformer.formatCurrency(o.total_demand)}</p></div>
                    <div><p className="text-[7px] font-black text-emerald-500 uppercase">Paid</p><p className="text-[9px] font-black text-emerald-600">{DataTransformer.formatCurrency(o.total_collected)}</p></div>
                    <div><p className="text-[7px] font-black text-rose-500 uppercase">Balance</p><p className="text-[9px] font-black text-rose-600">{DataTransformer.formatCurrency(o.total_pending)}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'ownerDetail' && selectedOwner && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <button onClick={() => setActiveTab('records')} className="flex items-center space-x-2 text-[#9A287E] font-black text-[9px] uppercase tracking-widest bg-white px-4 py-2.5 rounded-lg border border-slate-100 shadow-sm active:scale-95">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Owners</span>
            </button>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 text-left shadow-sm">
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-14 h-14 bg-[#9A287E] rounded-xl flex items-center justify-center text-white text-xl font-black uppercase shadow-lg shadow-pink-100">
                  {selectedOwner.owner_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight truncate leading-none mb-1">{selectedOwner.owner_name}</h2>
                  <p className="text-[9px] font-bold text-[#9A287E] uppercase tracking-widest truncate">Guardian: {selectedOwner.guardian_name || 'N/A'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                 <div className="bg-slate-50 p-2.5 rounded-xl"><p className="text-[7px] font-black text-slate-400 uppercase">Total Demand</p><p className="text-[10px] font-black">{DataTransformer.formatCurrency(selectedOwner.totalDemand)}</p></div>
                 <div className="bg-emerald-50 p-2.5 rounded-xl"><p className="text-[7px] font-black text-emerald-500 uppercase">Settled</p><p className="text-[10px] font-black text-emerald-600">{DataTransformer.formatCurrency(selectedOwner.totalCollected)}</p></div>
                 <div className="bg-rose-50 p-2.5 rounded-xl"><p className="text-[7px] font-black text-rose-500 uppercase">Due</p><p className="text-[10px] font-black text-rose-700">{DataTransformer.formatCurrency(selectedOwner.totalPending)}</p></div>
              </div>
            </div>

            <div className="space-y-4">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left px-1">Managed Portfolio</h3>
               {ownerPortfolio.map((p, idx) => (
                 <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm text-left">
                    <div className="flex justify-between items-start border-b border-slate-50 pb-3 mb-4">
                       <div className="min-w-0 pr-4">
                          <p className="text-[8px] font-black text-[#9A287E] uppercase tracking-widest">Assessment Ref</p>
                          <p className="text-xs font-black text-slate-900">{p.assessment_no}</p>
                       </div>
                       <button onClick={() => openAssessment(p.assessment_no)} className="bg-pink-50 text-[#9A287E] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">
                          View Full Ledger
                       </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                       <div><p className="text-[7px] font-black text-slate-400 uppercase">Current Demand</p><p className="text-[10px] font-bold">{DataTransformer.formatCurrency(p.total_demand)}</p></div>
                       <div className="col-span-2 text-right"><p className="text-[7px] font-black text-slate-400 uppercase">Location</p><p className="text-[10px] font-bold text-slate-800 truncate">{p.habitation || 'N/A'}, {p.village || 'N/A'}</p></div>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'assessmentDetail' && selectedAssessment && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pb-20">
             <button onClick={() => setActiveTab('ownerDetail')} className="flex items-center space-x-2 text-[#9A287E] font-black text-[9px] uppercase tracking-widest bg-white px-4 py-2.5 rounded-lg border border-slate-100 shadow-sm active:scale-95">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Portfolio</span>
            </button>

            {/* Assessment Profile Header */}
            <section className="bg-white rounded-2xl border border-slate-100 p-6 text-left shadow-sm">
               <div className="mb-6 pb-4 border-b border-slate-50 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Assessment Ledger</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reference: {selectedAssessment.summary.assessment_no}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black text-[#9A287E] uppercase">Door Number</p>
                    <p className="text-xs font-black">{selectedAssessment.propertyDetails.door_no || 'N/A'}</p>
                  </div>
               </div>
               
               {/* STEP 2 — RENDER SECTIONS ONLY IF DATA EXISTS */}
               {selectedAssessment.propertyDetails && (
                 <div className="space-y-6">
                    <div>
                      <h4 className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-3">Property Location Details</h4>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Panchayat</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.panchayat || '—'}</p></div>
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Village</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.village || '—'}</p></div>
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Habitation</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.habitation || '—'}</p></div>
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Survey / Plot</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.survey_no || '—'} / {selectedAssessment.propertyDetails.plot_no || '—'}</p></div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-3">Usage & Ownership</h4>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Nature of Property</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.nature_of_property || 'Residential'}</p></div>
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Usage Type</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.nature_of_usage || 'Owner-Occupied'}</p></div>
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Ownership Type</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.nature_of_ownership || 'Private'}</p></div>
                        <div><p className="text-[7px] font-black text-slate-400 uppercase">Acquisition Mode</p><p className="text-[10px] font-bold text-slate-800">{selectedAssessment.propertyDetails.mode_of_acquisition || 'Direct Purchase'}</p></div>
                      </div>
                    </div>
                 </div>
               )}
            </section>

            {/* STEP 3 — HOUSE TAX (FULL GOVT STYLE) */}
            {selectedAssessment.houseTax.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm text-left">
                <h4 className="text-[9px] font-black text-[#9A287E] uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center">
                  <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Yearly House Tax Ledger
                </h4>
                <div className="space-y-1.5">
                  {selectedAssessment.houseTax.map(row => (
                    <div key={row.demand_year} className="flex justify-between items-center py-2.5 px-3 bg-slate-50/50 rounded-xl border border-slate-100/50">
                       <div className="flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9A287E] mr-3"></span>
                          <div>
                            <p className="text-[10px] font-black text-slate-900 leading-none">{row.demand_year}</p>
                            <p className="text-[6px] font-black text-slate-400 uppercase tracking-tighter mt-1">Financial Cycle</p>
                          </div>
                       </div>
                       <p className="text-[11px] font-black text-slate-800">{DataTransformer.formatCurrency(row.total_demand)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Building & Site Details */}
            <div className="grid grid-cols-2 gap-4">
               {selectedAssessment.siteDetails && (
                 <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm text-left">
                    <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-4">Site Assets</h4>
                    <div className="space-y-3">
                       <div><p className="text-[7px] font-black text-slate-400 uppercase">Dimensions</p><p className="text-[9px] font-bold">{selectedAssessment.siteDetails.site_len} × {selectedAssessment.siteDetails.site_breadth} ft</p></div>
                       <div><p className="text-[7px] font-black text-slate-400 uppercase">Capital Val</p><p className="text-[9px] font-bold">{DataTransformer.formatCurrency(selectedAssessment.siteDetails.site_cap_val)}</p></div>
                    </div>
                 </section>
               )}
               {selectedAssessment.buildingDetails && (
                 <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm text-left">
                    <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-4">Building Unit</h4>
                    <div className="space-y-3">
                       <div><p className="text-[7px] font-black text-slate-400 uppercase">Type / Cat</p><p className="text-[9px] font-bold">{selectedAssessment.buildingDetails.bldg_type || 'Res'} / {selectedAssessment.buildingDetails.bldg_cat || 'A'}</p></div>
                       <div><p className="text-[7px] font-black text-slate-400 uppercase">Cap Value</p><p className="text-[9px] font-bold">{DataTransformer.formatCurrency(selectedAssessment.buildingDetails.bldg_cap_val)}</p></div>
                    </div>
                 </section>
               )}
            </div>

            {/* Floor Breakdown */}
            {selectedAssessment.floorDetails && selectedAssessment.floorDetails.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm text-left">
                 <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">Floor & Occupancy Breakdown</h4>
                 {selectedAssessment.floorDetails.map((f, i) => (
                   <div key={i} className="grid grid-cols-2 gap-4">
                      <div><p className="text-[7px] font-black text-slate-400 uppercase">Description</p><p className="text-[10px] font-medium text-slate-600">{f.floor_desc || 'Standard Unit'}</p></div>
                      <div><p className="text-[7px] font-black text-slate-400 uppercase">Net Floor Area</p><p className="text-[10px] font-bold">{f.total_floor_area || 0} sqft</p></div>
                      <div className="col-span-2"><p className="text-[7px] font-black text-slate-400 uppercase">Occupancy</p><p className="text-[10px] font-bold text-slate-800">{f.occ_desc || 'Direct Residential Use'}</p></div>
                   </div>
                 ))}
              </section>
            )}

            {/* Boundary Details */}
            {selectedAssessment.neighbouring && (
              <section className="bg-[#9A287E]/5 rounded-2xl border border-[#9A287E]/10 p-5 shadow-sm text-left">
                <h4 className="text-[8px] font-black text-[#9A287E] uppercase tracking-widest mb-4 border-b border-[#9A287E]/10 pb-2">Verified Boundaries</h4>
                <div className="grid grid-cols-2 gap-4">
                   <div><p className="text-[7px] font-black text-slate-400 uppercase">North Boundary</p><p className="text-[10px] font-bold text-slate-700 truncate">{selectedAssessment.neighbouring.north || '—'}</p></div>
                   <div><p className="text-[7px] font-black text-slate-400 uppercase">South Boundary</p><p className="text-[10px] font-bold text-slate-700 truncate">{selectedAssessment.neighbouring.south || '—'}</p></div>
                   <div><p className="text-[7px] font-black text-slate-400 uppercase">East Boundary</p><p className="text-[10px] font-bold text-slate-700 truncate">{selectedAssessment.neighbouring.east || '—'}</p></div>
                   <div><p className="text-[7px] font-black text-slate-400 uppercase">West Boundary</p><p className="text-[10px] font-bold text-slate-700 truncate">{selectedAssessment.neighbouring.west || '—'}</p></div>
                </div>
              </section>
            )}

            {/* Mutation History */}
            {selectedAssessment.mutations && selectedAssessment.mutations.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm text-left">
                <h4 className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">Property Mutation Timeline</h4>
                <div className="space-y-4">
                  {selectedAssessment.mutations.map((m, i) => (
                    <div key={i} className="relative pl-6 border-l-2 border-amber-100 py-1">
                       <div className="absolute left-[-9px] top-1 w-4 h-4 rounded-full bg-white border-4 border-amber-400"></div>
                       <p className="text-[10px] font-black text-slate-900">{formatDateDMY(m.date)}</p>
                       <p className="text-[9px] font-medium text-slate-600 mt-1">{m.description || 'Record of Title/Ownership Transfer'}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'collections' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="text-left mb-6">
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Audit Ledger</h2>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global Transaction Stream</p>
            </div>
            {collections.map(c => (
              <div key={c.id} className="p-4 bg-white rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                <div className="min-w-0 pr-4 text-left">
                  <p className="text-xs font-black text-slate-900 truncate uppercase">{c.owner_name || 'Property Owner'}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">REF: {c.assessment_no}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-emerald-600">{DataTransformer.formatCurrency(c.total_tax)}</p>
                  <p className="text-[8px] font-bold text-slate-300 uppercase">{formatDateDMY(c.date_of_payment)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-8 py-4 z-50 flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          {[
            { id: 'home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'zones', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
            { id: 'collections', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { if (['home', 'zones', 'collections'].includes(tab.id)) setActiveTab(tab.id as TabType); }}
              className={`p-3.5 rounded-xl transition-all relative ${
                (activeTab === tab.id || (tab.id === 'zones' && ['records', 'ownerDetail', 'assessmentDetail'].includes(activeTab)))
                  ? 'bg-[#9A287E] text-white shadow-lg shadow-pink-100' : 'text-slate-300 hover:text-[#9A287E]'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={tab.icon} /></svg>
            </button>
          ))}
      </nav>
    </div>
  );
};

export default Dashboard;
