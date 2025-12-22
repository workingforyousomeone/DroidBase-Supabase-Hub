
import { 
  RawAssessment, 
  RawDemand, 
  RawCollection, 
  RawOwner,
  AssessmentRecord, 
  ZoneMetrics, 
  LiveMetrics 
} from '../types';

export const DataTransformer = {
  isValidName(name: any): boolean {
    if (name === null || name === undefined) return false;
    const n = String(name).trim();
    if (n.length <= 1) return false;
    
    const lower = n.toLowerCase();
    const noise = [
      'unnamed', 'unknown', 'null', 'n/a', 'undefined', '0', '-', '.', 
      'none', 'false', 'nan', 'owner', 'null value', 'tbd', 'missing', 'payer'
    ];
    
    if (!isNaN(Number(n)) && n.length > 0 && n.length < 10) return false;
    if (n.includes('[ID:')) return false;
    
    return !noise.includes(lower);
  },

  normalizeId(id: any): string | null {
    if (id === null || id === undefined) return null;
    return String(id).trim().toUpperCase().replace(/\s+/g, '');
  },

  resolveId(obj: any): string | null {
    if (!obj) return null;
    const val = obj.assessment_no || obj.assessment_id || obj.property_id || obj.id;
    return this.normalizeId(val);
  },

  resolveName(obj: any): string | null {
    if (!obj) return null;
    const directCandidates = [
      obj.owner_name, obj.name, obj.owner, obj.full_name, 
      obj.firstname, obj.lastname, obj.prop_owner, obj.citizen_name,
      obj.taxpayer_name, obj.payer_name, obj.user_name, obj.display_name
    ];

    for (const val of directCandidates) {
      if (this.isValidName(val)) return String(val).trim();
    }

    const keys = Object.keys(obj);
    const nameKeywords = ['name', 'owner', 'citizen', 'taxpayer', 'payer', 'full', 'prop_ow'];
    
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (nameKeywords.some(kw => lowerKey.includes(kw))) {
        const val = obj[key];
        if (this.isValidName(val)) return String(val).trim();
      }
    }

    return null;
  },

  resolveGuardianName(obj: any): string | null {
    if (!obj) return null;
    const candidates = [
      obj.guardian_name, obj.father_name, obj.husband_name, 
      obj.guardian, obj.father, obj.husband,
      obj.so, obj.wo, obj['s/o'], obj['w/o'],
      obj.care_of, obj.co
    ];

    for (const val of candidates) {
      if (this.isValidName(val)) return String(val).trim();
    }

    const keys = Object.keys(obj);
    const kw = ['father', 'husband', 'guardian', 'care_of', 's/o', 'w/o'];
    for (const key of keys) {
      const lk = key.toLowerCase();
      if (kw.some(k => lk.includes(k))) {
        const val = obj[key];
        if (this.isValidName(val)) return String(val).trim();
      }
    }
    return null;
  },

  categorizeDetails(raw: any) {
    const categories: Record<string, Record<string, any>> = {
      'Owner Details': {},
      'Building Details': {},
      'Floor Details': {},
      'Mutation Details': {},
      'Neighbouring Properties': {},
      'Life Cycle Details': {},
      'Other Info': {}
    };

    const mapping: Record<string, string> = {
      'mobile': 'Owner Details', 'phone': 'Owner Details', 'email': 'Owner Details', 'address': 'Owner Details', 'gender': 'Owner Details', 
      'father': 'Owner Details', 'husband': 'Owner Details', 'guardian': 'Owner Details', 's/o': 'Owner Details', 'w/o': 'Owner Details', 'care_of': 'Owner Details',
      'usage': 'Building Details', 'construction': 'Building Details', 'age': 'Building Details', 'area': 'Building Details', 'plot': 'Building Details', 'category': 'Building Details', 'build_up': 'Building Details',
      'floor': 'Floor Details', 'basement': 'Floor Details', 'terrace': 'Floor Details', 'levels': 'Floor Details',
      'mutation': 'Mutation Details', 'transfer': 'Mutation Details', 'registry': 'Mutation Details', 'seller': 'Mutation Details',
      'north': 'Neighbouring Properties', 'south': 'Neighbouring Properties', 'east': 'Neighbouring Properties', 'west': 'Neighbouring Properties', 'boundary': 'Neighbouring Properties',
      'created': 'Life Cycle Details', 'approved': 'Life Cycle Details', 'updated': 'Life Cycle Details', 'active': 'Life Cycle Details', 'status': 'Life Cycle Details'
    };

    const coreKeys = ['assessment_no', 'owner_name', 'cluster_id', 'id', 'created_at', 'updated_at'];

    Object.entries(raw).forEach(([key, val]) => {
      if (coreKeys.includes(key.toLowerCase()) || val === null || val === '') return;
      const lowerKey = key.toLowerCase();
      let assigned = false;
      for (const [kw, cat] of Object.entries(mapping)) {
        if (lowerKey.includes(kw)) {
          const displayKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          categories[cat][displayKey] = val;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        const displayKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        categories['Other Info'][displayKey] = val;
      }
    });

    return Object.fromEntries(Object.entries(categories).filter(([_, v]) => Object.keys(v).length > 0));
  },

  processMasterDataForUser(
    assessments: RawAssessment[],
    demands: RawDemand[],
    collections: RawCollection[],
    zones: any[],
    owners: RawOwner[] = []
  ) {
    // This is used for regular users where assessments/demands might be filtered by RLS
    return this.processMasterData(assessments, demands, collections, zones, owners);
  },

  processMasterData(
    assessments: RawAssessment[],
    demands: RawDemand[],
    collections: RawCollection[],
    zones: any[],
    owners: RawOwner[] = []
  ) {
    const registryMap = new Map<string, AssessmentRecord>();
    const masterNameMap = new Map<string, string>();
    const masterGuardianMap = new Map<string, string>();

    owners.forEach(o => {
      const id = this.resolveId(o);
      const name = this.resolveName(o);
      const guardian = this.resolveGuardianName(o);
      if (id && name) masterNameMap.set(id, name);
      if (id && guardian) masterGuardianMap.set(id, guardian);
    });

    assessments.forEach(a => {
      const id = this.resolveId(a);
      const name = this.resolveName(a);
      const guardian = this.resolveGuardianName(a);
      if (id && name && (!masterNameMap.has(id) || masterNameMap.get(id)!.length < name.length)) {
        masterNameMap.set(id, name);
      }
      if (id && guardian && !masterGuardianMap.has(id)) {
        masterGuardianMap.set(id, guardian);
      }
    });

    assessments.forEach(a => {
      const id = this.resolveId(a);
      if (!id) return;
      const finalName = masterNameMap.get(id) || `Owner [ID:${id}]`;
      const finalGuardian = masterGuardianMap.get(id) || '';
      const structuredDetails = this.categorizeDetails(a);
      registryMap.set(id, {
        assessment_no: id,
        owner_name: finalName,
        guardian_name: finalGuardian,
        zone_id: a.cluster_id ? String(a.cluster_id).trim() : 'unassigned',
        demand: 0,
        collected: 0,
        pending: 0,
        details: structuredDetails
      });
    });

    demands.forEach(d => {
      const id = this.resolveId(d);
      if (!id) return;
      let record = registryMap.get(id);
      if (!record) {
        record = {
          assessment_no: id,
          owner_name: masterNameMap.get(id) || this.resolveName(d) || `External [ID:${id}]`,
          guardian_name: masterGuardianMap.get(id) || this.resolveGuardianName(d) || '',
          zone_id: 'unassigned',
          demand: 0,
          collected: 0,
          pending: 0
        };
        registryMap.set(id, record);
      }
      record.demand += Math.max(0, Number(d.total_demand) || 0);
    });

    collections.forEach(c => {
      const id = this.resolveId(c);
      if (!id) return;
      let record = registryMap.get(id);
      if (!record) {
        record = {
          assessment_no: id,
          owner_name: masterNameMap.get(id) || this.resolveName(c) || `Payer [ID:${id}]`,
          guardian_name: masterGuardianMap.get(id) || this.resolveGuardianName(c) || '',
          zone_id: 'unassigned',
          demand: 0,
          collected: 0,
          pending: 0
        };
        registryMap.set(id, record);
      }
      record.collected += Math.max(0, Number(c.total_tax) || 0);
    });

    const enriched: AssessmentRecord[] = Array.from(registryMap.values())
      .map(r => ({
        ...r,
        pending: r.demand - r.collected
      }))
      .sort((a, b) => a.owner_name.localeCompare(b.owner_name));

    const baseZones = Array.isArray(zones) ? [...zones] : [];
    const activeZoneIds = new Set(enriched.map(r => r.zone_id));
    if (activeZoneIds.has('unassigned') && !baseZones.some(cl => String(cl.id) === 'unassigned')) {
      baseZones.push({ id: 'unassigned', name: 'External / Unlinked' });
    }

    const zoneMetrics: ZoneMetrics[] = baseZones.map(z => {
      const zId = String(z.id).trim();
      const records = enriched.filter(r => r.zone_id === zId);
      const demand = records.reduce((s, r) => s + r.demand, 0);
      const collected = records.reduce((s, r) => s + r.collected, 0);
      return {
        id: zId,
        name: z.name || 'Zone',
        recordCount: records.length,
        demand,
        collected,
        pending: demand - collected
      };
    });

    const totalDemand = enriched.reduce((s, r) => s + r.demand, 0);
    const totalCollected = enriched.reduce((s, r) => s + r.collected, 0);
    const liveMetrics: LiveMetrics = {
      totalAssessments: enriched.length,
      totalDemand,
      netCollections: totalCollected,
      pendingAmount: totalDemand - totalCollected,
      efficiency: totalDemand > 0 ? (totalCollected / totalDemand) * 100 : 0
    };

    return { enriched, zoneMetrics, liveMetrics, nameMap: masterNameMap, guardianMap: masterGuardianMap };
  },

  formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val).replace('INR', '₹');
  }
};

