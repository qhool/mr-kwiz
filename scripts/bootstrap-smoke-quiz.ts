import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { generateCapabilityToken, sha256Hex } from '../src/lib/admin-token';
import { quizDefinitionSchema } from '../src/lib/quiz-definition';
import { testDefinition } from '../src/lib/__tests__/fixtures';
import type { Database } from '../src/types/database.generated';

type LocalEnv = {
    APP_TOKEN_SECRET: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    SUPABASE_URL: string;
};

const readLocalEnvFile = (): Partial<LocalEnv> => {
    const devVarsPath = path.resolve(process.cwd(), '.dev.vars');

    if (!existsSync(devVarsPath)) {
        return {};
    }

    const contents = readFileSync(devVarsPath, 'utf8');
    const entries = contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

    return Object.fromEntries(
        entries.map((line) => {
            const separatorIndex = line.indexOf('=');
            const key = line.slice(0, separatorIndex);
            const value = line.slice(separatorIndex + 1);
            return [key, value];
        })
    ) as Partial<LocalEnv>;
};

const getRequiredEnv = (): LocalEnv => {
    const fileEnv = readLocalEnvFile();
    const mergedEnv: Partial<LocalEnv> = {
        APP_TOKEN_SECRET: process.env.APP_TOKEN_SECRET ?? fileEnv.APP_TOKEN_SECRET,
        SUPABASE_SERVICE_ROLE_KEY:
            process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL: process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL,
    };

    const missing = Object.entries(mergedEnv)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new Error(`Missing required env values: ${missing.join(', ')}`);
    }

    return mergedEnv as LocalEnv;
};

const main = async () => {
    const env = getRequiredEnv();
    const runTag = process.env.SMOKE_RUN_TAG?.trim() || `smoke:${Date.now()}`;
    const adminKey = process.env.SMOKE_ADMIN_KEY?.trim() || generateCapabilityToken();
    const adminKeyDigest = await sha256Hex(adminKey);

    const definition = quizDefinitionSchema.parse({
        ...testDefinition,
        definition_version: 1,
        description: `${testDefinition.description} ${runTag}`.trim(),
        title: `Local Smoke Quiz ${runTag}`,
    });

    const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
        },
    });

    const insertedQuiz = await supabase
        .from('quizzes')
        .insert({
            admin_key_digest: adminKeyDigest,
            current_definition: definition,
            current_definition_version: definition.definition_version,
            description: definition.description,
            title: definition.title,
        })
        .select('id')
        .single();

    if (insertedQuiz.error) {
        throw insertedQuiz.error;
    }

    const insertedSnapshot = await supabase
        .from('quiz_definition_snapshots')
        .insert({
            definition: definition,
            definition_version: definition.definition_version,
            quiz_id: insertedQuiz.data.id,
        })
        .select('id')
        .single();

    if (insertedSnapshot.error) {
        throw insertedSnapshot.error;
    }

    process.stdout.write(
        JSON.stringify({
            adminKey,
            quizId: insertedQuiz.data.id,
            runTag,
            snapshotId: insertedSnapshot.data.id,
            supabaseUrl: env.SUPABASE_URL,
            supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        })
    );
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
