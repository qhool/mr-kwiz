import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse as parseToml } from 'smol-toml';
import { createClient } from '@supabase/supabase-js';

import { buildAdminEditUrl, generateCapabilityToken, sha256Hex } from '../src/lib/admin-token';
import { createDefaultQuizDefinition } from '../src/lib/quiz-definition';
import type { Database } from '../src/types/database.generated';

type CliOptions = {
    baseUrl: string;
    description: string;
    env: string | null;
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
    const options: Partial<CliOptions> = { env: null };

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
            case '--env':
                options.env = next;
                index += 1;
                break;
        }
    }

    if (!options.title) {
        throw new Error('Missing required --title argument.');
    }

    return {
        baseUrl: options.baseUrl ?? '',
        description: options.description ?? '',
        env: options.env ?? null,
        key: options.key,
        title: options.title,
    };
};

type EnvConfig = Record<string, Record<string, string>>;

const PLACEHOLDER_ENV_PATTERNS = [/^your-/i, /placeholder/i, /^changeme$/i, /^replace-me$/i];

const isPlaceholderValue = (value: string | undefined): boolean => {
    if (!value) {
        return false;
    }

    return PLACEHOLDER_ENV_PATTERNS.some((pattern) => pattern.test(value));
};

const assertConfiguredEnv = (env: LocalEnv, source: string): void => {
    const placeholderKeys = (Object.entries(env) as Array<[keyof LocalEnv, string]>)
        .filter(([, value]) => isPlaceholderValue(value))
        .map(([key]) => key);

    if (placeholderKeys.length > 0) {
        throw new Error(
            `${source} contains placeholder values for: ${placeholderKeys.join(', ')}. Replace them with real values before running create-admin-quiz.`
        );
    }
};

const readScriptEnvConfig = (envName: string): Partial<LocalEnv> & { BASE_URL?: string } => {
    const configPath = path.resolve(process.cwd(), '.script-envs.toml');

    if (!existsSync(configPath)) {
        throw new Error(
            `--env requires a .script-envs.toml config file (not found at ${configPath}).\n` +
            `Copy .script-envs.toml.example to get started.`
        );
    }

    const config = parseToml(readFileSync(configPath, 'utf8')) as EnvConfig;

    if (!config[envName]) {
        const available = Object.keys(config).join(', ');
        throw new Error(
            `Unknown environment "${envName}". Available: ${available || '(none defined)'}`
        );
    }

    return config[envName] as Partial<LocalEnv> & { BASE_URL?: string };
};

const readDevVarsFile = (): Partial<LocalEnv> => {
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

const getRequiredEnv = (envName: string | null): { env: LocalEnv; baseUrl: string } => {
    const configValues = envName ? readScriptEnvConfig(envName) : readDevVarsFile();

    const mergedEnv: Partial<LocalEnv> = {
        APP_TOKEN_SECRET: process.env.APP_TOKEN_SECRET ?? configValues.APP_TOKEN_SECRET,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? configValues.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL: process.env.SUPABASE_URL ?? configValues.SUPABASE_URL,
    };

    const missing = Object.entries(mergedEnv)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new Error(`Missing required env values: ${missing.join(', ')}`);
    }

    const baseUrl = (configValues as { BASE_URL?: string }).BASE_URL ?? 'http://localhost:3000';

    return { env: mergedEnv as LocalEnv, baseUrl };
};

const main = async () => {
    const options = parseArgs();
    const { env, baseUrl: configBaseUrl } = getRequiredEnv(options.env);
    const baseUrl = options.baseUrl || configBaseUrl;
    const adminToken = options.key ?? generateCapabilityToken();
    const adminKeyDigest = await sha256Hex(adminToken);
    const definition = createDefaultQuizDefinition(options.title, options.description);

    assertConfiguredEnv(env, options.env ? `.script-envs.toml [${options.env}]` : '.dev.vars');

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
    console.log(`Admin URL: ${buildAdminEditUrl(adminToken, baseUrl)}`);
    console.log('Save this admin token now. It is not stored in plain text anywhere.');
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});