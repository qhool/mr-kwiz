import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/database.generated';

import type { AppEnv } from './env';

export type AppSupabaseClient = SupabaseClient<Database>;

export const createServerSupabaseClient = (env: AppEnv): AppSupabaseClient => {
    return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
        },
    });
};