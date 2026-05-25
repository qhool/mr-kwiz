import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { buildAdminEditUrl, generateCapabilityToken, sha256Hex } from '../src/lib/admin-token';
import { createDefaultQuizDefinition } from '../src/lib/quiz-definition';
import type { Database } from '../src/types/database.generated';

type CliOptions = {
    baseUrl: string;
    description: string;
    key?: string;
    title: string;
};

type LocalEnv = {
    APP_TOKEN_SECRET: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    SUPABASE_URL: string;
};

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: Partial<CliOptions> = {};

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        const next = args[index + 1];

        switch (arg) {
            case '--title':
                options.title = next;
                index += 1;
                break;
            case '--description':
                options.description = next;
                index += 1;
                break;
            case '--key':
                options.key = next;
                index += 1;
                break;
            case '--base-url':
                options.baseUrl = next;
                index += 1;
                break;
        }
    }

    if (!options.title) {
        throw new Error('Missing required --title argument.');
    }

    return {
        baseUrl: options.baseUrl ?? 'http://localhost:3000',
        description: options.description ?? '',
        key: options.key,
        title: options.title,
    };
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
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY,
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
    const options = parseArgs();
    const env = getRequiredEnv();
    const adminToken = options.key ?? generateCapabilityToken();
    const adminKeyDigest = await sha256Hex(adminToken);
    const definition = createDefaultQuizDefinition(options.title, options.description);

    const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
        },
    });

    const { data, error } = await supabase
        .from('quizzes')
        .insert({
            admin_key_digest: adminKeyDigest,
            current_definition: definition,
            current_definition_version: definition.definition_version,
            description: definition.description,
            title: definition.title,
        })
        .select('id, title, current_definition_version')
        .single();

    if (error) {
        throw error;
    }

    console.log(`Created quiz: ${data.id}`);
    console.log(`Current definition version: ${data.current_definition_version}`);
    console.log(`Admin URL: ${buildAdminEditUrl(adminToken, options.baseUrl)}`);
    console.log('Save this admin token now. It is not stored in plain text anywhere.');
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});