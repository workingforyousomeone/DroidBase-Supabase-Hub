
import { createClient } from '@supabase/supabase-js';

// Project ID from user: tsmjhesyfiqrpltfupbd
const SUPABASE_URL = 'https://tsmjhesyfiqrpltfupbd.supabase.co';

/**
 * Valid API key provided for development.
 */
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzbWpoZXN5ZmlxcnBsdGZ1cGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NzkxODQsImV4cCI6MjA4MTU1NTE4NH0.D7qFaddqLayv7DkOIyOAIvk9Wq-EhX9h85stU1m5zCc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
