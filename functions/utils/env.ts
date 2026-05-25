export type AppEnv = {
    APP_TOKEN_SECRET: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    SUPABASE_URL: string;
};

const requiredEnvKeys: Array<keyof AppEnv> = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_TOKEN_SECRET'];

export const getAppEnv = (env: Partial<AppEnv>): AppEnv => {
    const missingKeys = requiredEnvKeys.filter((key) => !env[key]);

    if (missingKeys.length > 0) {
        throw new Error(`Missing required server configuration: ${missingKeys.join(', ')}`);
    }

    return env as AppEnv;
};