
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
}

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export interface DashboardStat {
  label: string;
  value: string | number;
  trend: 'up' | 'down' | 'neutral';
  color: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'info' | 'alert' | 'success';
}

export interface Register {
  id: string | number;
  name: string;
  details: string;
  created_at: string;
  status?: string;
}

export interface ClusterStatus {
  id: string;
  name: string;
  region: string;
  status: 'Running' | 'Scaling' | 'Idle';
  nodes: number;
  cpuUsage: number;
  ramUsage: number;
}
