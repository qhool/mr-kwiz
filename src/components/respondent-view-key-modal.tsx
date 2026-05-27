import React from 'react';

import { buildViewUrl, getViewKeyStatus, listResponseViewKeysResponseSchema, responseViewKeySchema, type ResponseViewKey } from '../lib/view-keys';

const panelStyle: React.CSSProperties = {
    background: '#fffaf1',
    border: '1px solid #c8bfa9',
    borderRadius: 20,
    boxShadow: '0 24px 80px rgba(35, 26, 14, 0.24)',
    maxHeight: '88vh',
    overflow: 'hidden',
    width: 'min(980px, calc(100vw - 2rem))',
};

const fieldStyle: React.CSSProperties = {
    border: '1px solid #c8bfa9',
    borderRadius: 12,
    padding: '0.75rem 0.85rem',
    width: '100%',
};

type ViewKeyEditorItem = {
    created_at: string;
    error: string | null;
    expires_at: string | null;
    is_dirty: boolean;
    is_new: boolean;
    is_saving: boolean;
    label: string;
    last_viewed_at: string | null;
    local_id: string;
    notes: string;
    revoked_at: string | null;
    updated_at: string;
    view_key: string;
};

type PersistedViewKeyResponse = {
    view_key?: string;
    view_key_record?: ResponseViewKey;
    error?: string;
};

type RespondentViewKeyModalProps = {
    isOpen: boolean;
    onClose: () => void;
    responseKey: string;
};

const makeDraftItem = (): ViewKeyEditorItem => ({
    created_at: '',
    error: null,
    expires_at: null,
    is_dirty: false,
    is_new: true,
    is_saving: false,
    label: '',
    last_viewed_at: null,
    local_id: `draft-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
    notes: '',
    revoked_at: null,
    updated_at: '',
    view_key: '',
});

const fromViewKeyRecord = (record: ResponseViewKey): ViewKeyEditorItem => ({
    created_at: record.created_at,
    error: null,
    expires_at: record.expires_at,
    is_dirty: false,
    is_new: false,
    is_saving: false,
    label: record.label,
    last_viewed_at: record.last_viewed_at,
    local_id: record.id,
    notes: record.notes,
    revoked_at: record.revoked_at,
    updated_at: record.updated_at,
    view_key: record.view_key,
});

const toDateTimeLocalValue = (value: string | null): string => {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const fromDateTimeLocalValue = (value: string): string | null => {
    if (!value.trim()) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const formatDate = (value: string | null): string => {
    if (!value) {
        return 'Not set';
    }

    return new Date(value).toLocaleString();
};

const formatStatus = (item: ViewKeyEditorItem): string => {
    const status = getViewKeyStatus({ expires_at: item.expires_at, revoked_at: item.revoked_at });
    if (item.is_new) {
        return 'Draft';
    }

    if (status === 'active') {
        return 'Active';
    }

    if (status === 'revoked') {
        return 'Revoked';
    }

    return 'Expired';
};

const statusStyle = (item: ViewKeyEditorItem): React.CSSProperties => {
    const status = item.is_new ? 'draft' : getViewKeyStatus({ expires_at: item.expires_at, revoked_at: item.revoked_at });
    const palette = {
        active: { background: '#e5f4df', border: '#84ad6a', color: '#20481f' },
        draft: { background: '#eef2fb', border: '#8ba0d8', color: '#1e3165' },
        expired: { background: '#ece9e2', border: '#aaa08c', color: '#554c3c' },
        revoked: { background: '#f4e4dc', border: '#c48b70', color: '#6c2b17' },
    }[status as 'active' | 'draft' | 'expired' | 'revoked'];

    return {
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        color: palette.color,
        display: 'inline-flex',
        fontSize: '0.78rem',
        fontWeight: 700,
        padding: '0.25rem 0.65rem',
    };
};

export const RespondentViewKeyModal: React.FC<RespondentViewKeyModalProps> = ({ isOpen, onClose, responseKey }) => {
    const [items, setItems] = React.useState<ViewKeyEditorItem[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [copyMessage, setCopyMessage] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const itemsRef = React.useRef<ViewKeyEditorItem[]>([]);

    React.useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    const syncItems = React.useCallback((updater: (current: ViewKeyEditorItem[]) => ViewKeyEditorItem[]) => {
        setItems((current) => {
            const next = updater(current);
            itemsRef.current = next;
            return next;
        });
    }, []);

    const loadViewKeys = React.useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setCopyMessage(null);

        try {
            const response = await fetch(`/api/respondent/response/${encodeURIComponent(responseKey)}/view-keys`);
            const body = (await response.json()) as { error?: string; view_keys?: ResponseViewKey[] };

            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to load share links.');
            }

            const parsed = listResponseViewKeysResponseSchema.parse(body);
            const nextItems = parsed.view_keys.map(fromViewKeyRecord);
            setItems(nextItems.length > 0 ? nextItems : [makeDraftItem()]);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load share links.');
            setItems([makeDraftItem()]);
        } finally {
            setIsLoading(false);
        }
    }, [responseKey]);

    React.useEffect(() => {
        if (!isOpen) {
            return;
        }

        void loadViewKeys();
    }, [isOpen, loadViewKeys]);

    const updateItem = React.useCallback((localId: string, updater: (item: ViewKeyEditorItem) => ViewKeyEditorItem) => {
        syncItems((current) => current.map((item) => (item.local_id === localId ? updater(item) : item)));
    }, [syncItems]);

    const persistItem = React.useCallback(async (localId: string) => {
        const item = itemsRef.current.find((entry) => entry.local_id === localId);
        if (!item) {
            return null;
        }

        if (!item.is_dirty && !item.is_new) {
            return item;
        }

        updateItem(localId, (current) => ({ ...current, error: null, is_saving: true }));

        try {
            const payload = {
                expires_at: item.expires_at,
                label: item.label,
                notes: item.notes,
            };

            if (item.is_new || !item.view_key) {
                const response = await fetch(`/api/respondent/response/${encodeURIComponent(responseKey)}/view-keys`, {
                    body: JSON.stringify(payload),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                });
                const body = (await response.json()) as PersistedViewKeyResponse;

                if (!response.ok || !body.view_key_record) {
                    throw new Error(body.error ?? 'Failed to create share link.');
                }

                const record = responseViewKeySchema.parse(body.view_key_record);
                const nextItem = fromViewKeyRecord(record);
                updateItem(localId, () => nextItem);
                return nextItem;
            }

            const response = await fetch(`/api/respondent/response/${encodeURIComponent(responseKey)}/view-keys/${encodeURIComponent(item.view_key)}`, {
                body: JSON.stringify(payload),
                headers: { 'content-type': 'application/json' },
                method: 'PATCH',
            });
            const body = (await response.json()) as PersistedViewKeyResponse;

            if (!response.ok || !body.view_key_record) {
                throw new Error(body.error ?? 'Failed to update share link.');
            }

            const record = responseViewKeySchema.parse(body.view_key_record);
            const nextItem = fromViewKeyRecord(record);
            updateItem(localId, () => nextItem);
            return nextItem;
        } catch (persistError) {
            const message = persistError instanceof Error ? persistError.message : 'Failed to save share link.';
            updateItem(localId, (current) => ({ ...current, error: message, is_saving: false }));
            throw persistError;
        }
    }, [responseKey, updateItem]);

    const handleFieldChange = (localId: string, field: 'label' | 'notes' | 'expires_at', value: string) => {
        updateItem(localId, (current) => ({
            ...current,
            [field]: field === 'expires_at' ? fromDateTimeLocalValue(value) : value,
            is_dirty: true,
            is_new: current.is_new,
        }));
    };

    const handleFieldBlur = (localId: string) => {
        void persistItem(localId);
    };

    const handleCopyLink = async (localId: string) => {
        setCopyMessage(null);
        setError(null);

        try {
            const item = await persistItem(localId);
            if (!item) {
                return;
            }

            if (!item.view_key) {
                throw new Error('Share link has not been created yet.');
            }

            if (!navigator.clipboard?.writeText) {
                setCopyMessage('Clipboard API is not available in this browser context.');
                return;
            }

            await navigator.clipboard.writeText(buildViewUrl(item.view_key, window.location.origin));
            setCopyMessage('Link copied to clipboard.');
        } catch (copyError) {
            setError(copyError instanceof Error ? copyError.message : 'Failed to copy share link.');
        }
    };

    const handleAddLink = () => {
        syncItems((current) => [makeDraftItem(), ...current]);
    };

    const handleDeactivate = async (localId: string) => {
        const item = itemsRef.current.find((entry) => entry.local_id === localId);
        if (!item || item.is_new || !item.view_key) {
            return;
        }

        updateItem(localId, (current) => ({ ...current, error: null, is_saving: true }));

        try {
            const response = await fetch(`/api/respondent/response/${encodeURIComponent(responseKey)}/view-keys/${encodeURIComponent(item.view_key)}/deactivate`, {
                method: 'POST',
            });
            const body = (await response.json()) as PersistedViewKeyResponse;

            if (!response.ok || !body.view_key_record) {
                throw new Error(body.error ?? 'Failed to revoke share link.');
            }

            const record = responseViewKeySchema.parse(body.view_key_record);
            const nextItem = fromViewKeyRecord(record);
            updateItem(localId, () => nextItem);
            setCopyMessage('Share link revoked.');
        } catch (revokeError) {
            const message = revokeError instanceof Error ? revokeError.message : 'Failed to revoke share link.';
            updateItem(localId, (current) => ({ ...current, error: message, is_saving: false }));
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            aria-modal="true"
            onClick={onClose}
            role="dialog"
            style={{
                alignItems: 'center',
                background: 'rgba(28, 18, 8, 0.58)',
                display: 'flex',
                inset: 0,
                justifyContent: 'center',
                padding: '1rem',
                position: 'fixed',
                zIndex: 60,
            }}
        >
            <div onClick={(event) => event.stopPropagation()} style={panelStyle}>
                <div style={{ alignItems: 'flex-start', display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '1.25rem 1.25rem 1rem' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Share Results</h2>
                        <p style={{ color: '#5d4b30', margin: '0.35rem 0 0' }}>
                            Manage saved links, configure their labels, notes, and expiry, then copy the link when ready.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: '1px solid #b7ab91', borderRadius: 999, color: '#4a3922', cursor: 'pointer', padding: '0.55rem 0.9rem' }}
                        type="button"
                    >
                        Close
                    </button>
                </div>

                <div style={{ borderTop: '1px solid #d9ceb8', maxHeight: 'calc(88vh - 88px)', overflowY: 'auto', padding: '1rem 1.25rem 1.25rem' }}>
                    {error ? (
                        <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', borderRadius: 16, color: '#6f2412', marginBottom: '0.9rem', padding: '0.85rem 1rem', whiteSpace: 'pre-wrap' }}>
                            {error}
                        </div>
                    ) : null}

                    {copyMessage ? (
                        <div style={{ background: '#edf7ed', border: '1px solid #5a8f5a', borderRadius: 16, color: '#1f4f1f', marginBottom: '0.9rem', padding: '0.85rem 1rem' }}>
                            {copyMessage}
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ color: '#5d4b30' }}>{isLoading ? 'Loading saved links...' : 'Edit a link, blur a field to save, or copy a link to save and copy it at once.'}</div>
                        <button
                            onClick={handleAddLink}
                            style={{ background: '#e9dfc8', border: '1px solid #b7ab91', borderRadius: 999, color: '#4a3922', cursor: 'pointer', padding: '0.7rem 1rem' }}
                            type="button"
                        >
                            Add Another Link
                        </button>
                    </div>

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {items.map((item) => {
                            const status = formatStatus(item);
                            const canCopy = !item.is_new && item.view_key.length > 0 && getViewKeyStatus({ expires_at: item.expires_at, revoked_at: item.revoked_at }) === 'active';

                            return (
                                <article key={item.local_id} style={{ background: '#fffdf8', border: '1px solid #d7ccb4', borderRadius: 18, display: 'grid', gap: '0.9rem', padding: '1rem' }}>
                                    <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                                                {item.label.trim().length > 0 ? item.label : item.is_new ? 'New share link draft' : `Share link ${item.view_key.slice(0, 8)}`}
                                            </div>
                                            <div style={{ color: '#6b5734', fontSize: '0.88rem' }}>
                                                {item.is_new ? 'Not saved yet' : `Created ${formatDate(item.created_at)}`}
                                            </div>
                                        </div>
                                        <span style={statusStyle(item)}>{status}</span>
                                    </div>

                                    {item.error ? (
                                        <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', borderRadius: 14, color: '#6f2412', padding: '0.75rem 0.9rem' }}>
                                            {item.error}
                                        </div>
                                    ) : null}

                                    <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                                        <label style={{ display: 'grid', gap: '0.3rem' }}>
                                            <span style={{ color: '#4e3d24', fontSize: '0.88rem', fontWeight: 700 }}>Label</span>
                                            <input
                                                onBlur={() => {
                                                    void handleFieldBlur(item.local_id);
                                                }}
                                                onChange={(event) => handleFieldChange(item.local_id, 'label', event.target.value)}
                                                placeholder="Optional label"
                                                style={fieldStyle}
                                                type="text"
                                                value={item.label}
                                            />
                                        </label>

                                        <label style={{ display: 'grid', gap: '0.3rem' }}>
                                            <span style={{ color: '#4e3d24', fontSize: '0.88rem', fontWeight: 700 }}>Expiry</span>
                                            <input
                                                onBlur={() => {
                                                    void handleFieldBlur(item.local_id);
                                                }}
                                                onChange={(event) => handleFieldChange(item.local_id, 'expires_at', event.target.value)}
                                                style={fieldStyle}
                                                type="datetime-local"
                                                value={toDateTimeLocalValue(item.expires_at)}
                                            />
                                        </label>
                                    </div>

                                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                                        <span style={{ color: '#4e3d24', fontSize: '0.88rem', fontWeight: 700 }}>Notes</span>
                                        <textarea
                                            onBlur={() => {
                                                void handleFieldBlur(item.local_id);
                                            }}
                                            onChange={(event) => handleFieldChange(item.local_id, 'notes', event.target.value)}
                                            placeholder="Optional notes"
                                            style={{ ...fieldStyle, minHeight: 92, resize: 'vertical' }}
                                            value={item.notes}
                                        />
                                    </label>

                                    <div style={{ display: 'grid', gap: '0.4rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                                        <div>
                                            <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>View URL</div>
                                            <div style={{ fontSize: '0.92rem', overflowWrap: 'anywhere' }}>
                                                {item.view_key ? buildViewUrl(item.view_key, window.location.origin) : 'Will be created on first save or copy'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Last viewed</div>
                                            <div style={{ fontSize: '0.92rem' }}>{formatDate(item.last_viewed_at)}</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        <button
                                            disabled={item.is_saving}
                                            onClick={() => {
                                                void handleCopyLink(item.local_id);
                                            }}
                                            style={{ background: '#6a5032', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: item.is_saving ? 'not-allowed' : 'pointer', opacity: item.is_saving ? 0.75 : 1, padding: '0.75rem 1.1rem' }}
                                            type="button"
                                        >
                                            {item.is_saving ? 'Saving…' : canCopy ? 'Copy Link' : 'Save & Copy Link'}
                                        </button>

                                        <button
                                            disabled={item.is_saving || item.is_new || getViewKeyStatus({ expires_at: item.expires_at, revoked_at: item.revoked_at }) === 'revoked'}
                                            onClick={() => {
                                                void handleDeactivate(item.local_id);
                                            }}
                                            style={{ background: '#e9dfc8', border: '1px solid #b7ab91', borderRadius: 999, color: '#4a3922', cursor: item.is_saving ? 'not-allowed' : 'pointer', opacity: item.is_saving ? 0.75 : 1, padding: '0.75rem 1.1rem' }}
                                            type="button"
                                        >
                                            {getViewKeyStatus({ expires_at: item.expires_at, revoked_at: item.revoked_at }) === 'revoked' ? 'Revoked' : 'Revoke Link'}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
