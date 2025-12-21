
import { supabase } from './supabase';

export const DataService = {
  /**
   * CORE FETCHING
   */
  async fetchAll(table: string, columns: string = '*'): Promise<any[]> {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (error || !data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < pageSize) break;
      page++;
    }
    return allData;
  },

  /**
   * ZONES (Database table remains 'clusters')
   */
  async getZones() {
    return supabase.from('clusters').select('*').order('name', { ascending: true });
  },

  /**
   * OWNERS
   */
  async getOwners() {
    return this.fetchAll('owners');
  },

  /**
   * ASSESSMENT REGISTRY
   */
  async updateAssessment(assessmentNo: string, updates: any) {
    return supabase.from('assessments').update(updates).eq('assessment_no', assessmentNo);
  },

  /**
   * COLLECTIONS / PAYMENTS
   */
  async addCollection(collection: any) {
    return supabase.from('collections').insert([collection]);
  },

  async deleteCollection(id: string) {
    return supabase.from('collections').delete().eq('id', id);
  },

  /**
   * DEMANDS / BILLING
   */
  async updateDemand(assessmentNo: string, updates: any) {
    return supabase.from('demands').update(updates).eq('assessment_no', assessmentNo);
  }
};
