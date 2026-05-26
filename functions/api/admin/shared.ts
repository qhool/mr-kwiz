import { sha256Hex } from '../../../src/lib/admin-token';

import { getAppEnv, type AppEnv } from '../../utils/env';
import { createServerSupabaseClient } from '../../utils/supabase';

export const json = (body: unknown, init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json; charset=utf-8');

    return new Response(JSON.stringify(body), {
        ...init,
        headers,
    });
};

export const getQuizByAdminKey = async (env: Partial<AppEnv>, adminKey: string) => {
    const appEnv = getAppEnv(env);
    const supabase = createServerSupabaseClient(appEnv);
    const adminKeyDigest = await sha256Hex(adminKey);

    const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('admin_key_digest', adminKeyDigest)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return {
        quiz: data,
        supabase,
    };
};