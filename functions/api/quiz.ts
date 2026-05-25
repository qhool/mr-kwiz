import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';

type AppEnv = {
    APP_TOKEN_SECRET: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    SUPABASE_URL: string;
};

type AppContext = {
    env: AppEnv;
    request: Request;
};

type QuizRow = Database['public']['Tables']['quizzes']['Row'];
type QuizInsert = Database['public']['Tables']['quizzes']['Insert'];
type QuizUpdate = Database['public']['Tables']['quizzes']['Update'];

const json = (body: unknown, init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json; charset=utf-8');

    return new Response(JSON.stringify(body), {
        ...init,
        headers,
    });
};

const createSupabaseClient = (env: AppEnv) =>
    createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
        },
    });

const readJson = async <T>(request: Request): Promise<T> => {
    return (await request.json()) as T;
};

const hasRequiredEnv = (env: Partial<AppEnv>) => {
    return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.APP_TOKEN_SECRET);
};

export const onRequest = async ({ env, request }: AppContext): Promise<Response> => {
    if (!hasRequiredEnv(env)) {
        return json(
            {
                error: 'Missing required server configuration.',
                required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_TOKEN_SECRET'],
            },
            { status: 500 }
        );
    }

    const supabase = createSupabaseClient(env);

    switch (request.method) {
        case 'GET':
            return await getQuizzes(supabase);
        case 'POST':
            return await createQuiz(supabase, request);
        case 'PUT':
            return await updateQuiz(supabase, request);
        case 'DELETE':
            return await deleteQuiz(supabase, request);
        default:
            return json({ message: 'Method Not Allowed' }, { status: 405 });
    }
};

const getQuizzes = async (supabase: ReturnType<typeof createSupabaseClient>) => {
    const { data, error } = await supabase.from('quizzes').select('*');
    if (error) {
        return json({ error: error.message }, { status: 500 });
    }
    return json(data satisfies QuizRow[] | null, { status: 200 });
};

const createQuiz = async (supabase: ReturnType<typeof createSupabaseClient>, request: Request) => {
    const quiz = await readJson<QuizInsert>(request);
    const { data, error } = await supabase.from('quizzes').insert(quiz).select();
    if (error) {
        return json({ error: error.message }, { status: 500 });
    }
    return json(data, { status: 201 });
};

const updateQuiz = async (supabase: ReturnType<typeof createSupabaseClient>, request: Request) => {
    const quiz = await readJson<QuizUpdate & Pick<QuizRow, 'id'>>(request);
    const { id, ...changes } = quiz;
    const { data, error } = await supabase.from('quizzes').update(changes).eq('id', id).select();
    if (error) {
        return json({ error: error.message }, { status: 500 });
    }
    return json(data, { status: 200 });
};

const deleteQuiz = async (supabase: ReturnType<typeof createSupabaseClient>, request: Request) => {
    const { id } = await readJson<{ id: string }>(request);
    const { data, error } = await supabase.from('quizzes').delete().eq('id', id).select();
    if (error) {
        return json({ error: error.message }, { status: 500 });
    }
    return json(data, { status: 204 });
};