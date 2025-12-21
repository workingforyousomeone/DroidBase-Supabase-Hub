
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
  /**
   * High-fidelity name validation.
   * Filters out common database placeholders and ID-like strings.
   */
  isValidName(name: any): boolean {
    if (name === null || name === undefined) return false;
    const n = String(name).trim();
    if (n.length <= 1) return false;
    
    const lower = n.toLowerCase();
    const noise = [
      'unnamed', 'unknown', 'null', 'n/a', 'undefined', '0', '-', '.', 
      'none', 'false', 'nan', 'owner', 'null value', 'tbd', 'missing', 'payer'
    ];
    
    // Exclude if it's just a number or looks like a placeholder ID
    if (!isNaN(Number(n)) && n.length > 0 && n.length < 10) return false;
    if (n.includes('[ID:')) return false;
    
    return !noise.includes(lower);
  },

  /**
   * Normalize IDs for strict cross-table matching.
   */
  normalizeId(id: any): string | null {
    if (id === null || id === undefined) return null;
    return String(id).trim().toUpperCase().replace(/\s+/g, '');
  },

  /**
   * Extract ID with support for multiple naming schemes.
   */
  resolveId(obj: any): string | null {
    if (!obj) return null;
    // Priority order for ID resolution
    const val = obj.assessment_no || obj.assessment_id || obj.property_id || obj.id;
    return this.normalizeId(val);
  },

  /**
   * Scans an object for any property that might contain a valid name.
   */
  resolveName(obj: any): string | null {
    if (!obj) return null;
    
    // 1. Direct matches for known schema patterns
    const directCandidates = [
      obj.owner_name, obj.name, obj.owner, obj.full_name, 
      obj.firstname, obj.lastname, obj.prop_owner, obj.citizen_name,
      obj.taxpayer_name, obj.payer_name, obj.user_name, obj.display_name
    ];

    for (const val of directCandidates) {
      if (this.isValidName(val)) return String(val).trim();
    }

    // 2. Deep Key Scan
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

  /**
   * Master Data Processing Logic:
   * Uses a Two-Pass approach to ensure actual names are linked from the best possible source.
   */
  processMasterData(
    assessments: RawAssessment[],
    demands: RawDemand[],
    collections: RawCollection[],
    zones: any[],
    owners: RawOwner[] = []
  ) {
    const registryMap = new Map<string, AssessmentRecord>();
    const masterNameMap = new Map<string, string>();

    /**
     * PASS 1: GLOBAL NAME DISCOVERY
     * Aggressively build a name map from all available tables.
     */
    
    // Source: Master Owners Table (High Priority)
    owners.forEach(o => {
      const id = this.resolveId(o);
      const name = this.resolveName(o);
      if (id && name) masterNameMap.set(id, name);
    });

    // Source: Assessment Registry (High Priority)
    assessments.forEach(a => {
      const id = this.resolveId(a);
      const name = this.resolveName(a);
      if (id && name && (!masterNameMap.has(id) || masterNameMap.get(id)!.length < name.length)) {
        masterNameMap.set(id, name);
      }
    });

    // Source: Demands & Collections (Fallback names)
    [...demands, ...collections].forEach(record => {
      const id = this.resolveId(record);
      const name = this.resolveName(record);
      if (id && name && !masterNameMap.has(id)) {
        masterNameMap.set(id, name);
      }
    });

    /**
     * PASS 2: RECORD CONSTRUCTION & ENRICHMENT
     */

    // Step 1: Base Registry from Assessments Table
    assessments.forEach(a => {
      const id = this.resolveId(a);
      if (!id) return;
      
      const finalName = masterNameMap.get(id) || `Owner [ID:${id}]`;

      registryMap.set(id, {
        assessment_no: id,
        owner_name: finalName,
        zone_id: a.cluster_id ? String(a.cluster_id).trim() : 'unassigned',
        demand: 0,
        collected: 0,
        pending: 0
      });
    });

    // Step 2: Merge Demand (Billing) Data
    demands.forEach(d => {
      const id = this.resolveId(d);
      if (!id) return;

      let record = registryMap.get(id);
      
      // Handle Orphans (in demands but not assessments table)
      if (!record) {
        record = {
          assessment_no: id,
          owner_name: masterNameMap.get(id) || this.resolveName(d) || `External [ID:${id}]`,
          zone_id: 'unassigned',
          demand: 0,
          collected: 0,
          pending: 0
        };
        registryMap.set(id, record);
      }

      record.demand += Math.max(0, Number(d.total_demand) || 0);
    });

    // Step 3: Merge Collection (Payment) Data
    collections.forEach(c => {
      const id = this.resolveId(c);
      if (!id) return;

      let record = registryMap.get(id);

      if (!record) {
        record = {
          assessment_no: id,
          owner_name: masterNameMap.get(id) || this.resolveName(c) || `Payer [ID:${id}]`,
          zone_id: 'unassigned',
          demand: 0,
          collected: 0,
          pending: 0
        };
        registryMap.set(id, record);
      }

      record.collected += Math.max(0, Number(c.total_tax) || 0);
    });

    // Step 4: Final Calculations & Sorting
    const enriched: AssessmentRecord[] = Array.from(registryMap.values())
      .map(r => ({
        ...r,
        pending: r.demand - r.collected
      }))
      .sort((a, b) => a.owner_name.localeCompare(b.owner_name));

    // Step 5: Zone Metrics Aggregation
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

    // Step 6: Global Analytics
    const totalDemand = enriched.reduce((s, r) => s + r.demand, 0);
    const totalCollected = enriched.reduce((s, r) => s + r.collected, 0);
    
    const liveMetrics: LiveMetrics = {
      totalAssessments: enriched.length,
      totalDemand,
      netCollections: totalCollected,
      pendingAmount: totalDemand - totalCollected,
      efficiency: totalDemand > 0 ? (totalCollected / totalDemand) * 100 : 0
    };

    return { enriched, zoneMetrics, liveMetrics, nameMap: masterNameMap };
  },

  formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val).replace('INR', '₹');
  }
};
