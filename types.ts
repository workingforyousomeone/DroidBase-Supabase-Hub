
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
}

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export interface AssessmentRecord {
  assessment_no: string;
  owner_name: string;
  guardian_name?: string;
  zone_id: string;
  demand: number;
  collected: number;
  pending: number;
  details?: Record<string, any>;
}

export interface ZoneMetrics {
  id: string;
  name: string;
  recordCount: number;
  demand: number;
  collected: number;
  pending: number;
}

export interface OwnerSummary {
  owner_name: string;
  guardian_name?: string;
  totalDemand: number;
  totalCollected: number;
  totalPending: number;
  records: AssessmentRecord[];
}

export interface LiveMetrics {
  totalAssessments: number;
  totalDemand: number;
  netCollections: number;
  pendingAmount: number;
  efficiency: number;
}

export interface RawCollection {
  id: string;
  assessment_no: string;
  owner_name?: string;
  total_tax: number;
  date_of_payment: string;
  [key: string]: any;
}

export interface RawDemand {
  assessment_no: string;
  owner_name?: string;
  total_demand: number;
  [key: string]: any;
}

export interface RawAssessment {
  assessment_no: string;
  owner_name?: string;
  cluster_id: string;
  [key: string]: any;
}

export interface RawOwner {
  id: string | number;
  assessment_no?: string;
  name?: string;
  guardian_name?: string;
  father_name?: string;
  husband_name?: string;
  [key: string]: any;
}
