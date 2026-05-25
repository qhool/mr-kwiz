declare module 'zod' {
    interface GlobalMeta {
        docs?: {
            notes?: string[];
            crossFieldRules?: string[];
        };
    }
}

export {};