import React from 'react';

export type AdminEditMode = 'opencode' | 'paste-back';

const isAdminEditMode = (value: string | null): value is AdminEditMode => {
    return value === 'opencode' || value === 'paste-back';
};

const storageKey = (adminKey?: string): string => `mrkwiz:admin-edit-mode:${adminKey ?? 'unknown'}`;

const readStoredEditMode = (adminKey?: string): AdminEditMode => {
    if (typeof window === 'undefined') return 'opencode';
    const stored = window.localStorage.getItem(storageKey(adminKey));
    return isAdminEditMode(stored) ? stored : 'opencode';
};

export const useAdminEditMode = (adminKey?: string) => {
    const [editMode, setEditModeState] = React.useState<AdminEditMode>(() => readStoredEditMode(adminKey));

    React.useEffect(() => {
        setEditModeState(readStoredEditMode(adminKey));
    }, [adminKey]);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleStorage = (event: StorageEvent) => {
            if (event.key === storageKey(adminKey)) {
                setEditModeState(isAdminEditMode(event.newValue) ? event.newValue : 'opencode');
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [adminKey]);

    const setEditMode = React.useCallback(
        (nextMode: AdminEditMode) => {
            setEditModeState(nextMode);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(storageKey(adminKey), nextMode);
            }
        },
        [adminKey]
    );

    return { editMode, setEditMode };
};
