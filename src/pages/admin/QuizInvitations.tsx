import React from 'react';
import { useParams } from 'react-router-dom';

import { AdminShell } from '../../components/admin-shell';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';
import {
    buildInvitationUrl,
    getQuizInvitationStatus,
    listQuizInvitationsResponseSchema,
    quizInvitationSchema,
    type QuizInvitation,
} from '../../lib/admin-invitations';
import { buildViewUrl } from '../../lib/view-keys';

type InvitationResponse = {
    error?: string;
    invitation?: QuizInvitation;
};

const panelStyle: React.CSSProperties = {
    background: 'rgba(255, 250, 240, 0.88)',
    border: '1px solid #c8bfa9',
    borderRadius: 18,
    padding: '1rem',
};

const normalizeMaxUsesInput = (value: string): number | null => {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('Max uses must be a positive whole number or left blank for unlimited.');
    }

    return parsed;
};

const formatError = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown error.';
};

const formatDate = (value: string): string => {
    return new Date(value).toLocaleString();
};

const statusLabelByState: Record<ReturnType<typeof getQuizInvitationStatus>, string> = {
    active: 'Active',
    deactivated: 'Deactivated',
    exhausted: 'Exhausted',
    expired: 'Expired',
};

const sharingModeLabels: Record<QuizInvitation['result_sharing_mode'], string> = {
    off: 'Off',
    opt_in: 'Opt in',
    opt_out: 'Opt out',
    mandatory: 'Mandatory',
};

const sharingModeDescriptions: Record<QuizInvitation['result_sharing_mode'], string> = {
    off: 'Never auto-create a shared result link.',
    opt_in: 'Leave sharing disabled unless explicitly enabled here.',
    opt_out: 'Create a shared result link when the quiz starts.',
    mandatory: 'Always create a shared result link and keep sharing enabled.',
};

const sharingModeOptions: QuizInvitation['result_sharing_mode'][] = ['off', 'opt_in', 'opt_out', 'mandatory'];

const requiresSharebackName = (mode: QuizInvitation['result_sharing_mode']) => mode !== 'off';

const statusStyle = (status: ReturnType<typeof getQuizInvitationStatus>): React.CSSProperties => {
    const palette = {
        active: { background: '#e5f4df', border: '#84ad6a', color: '#20481f' },
        deactivated: { background: '#f4e4dc', border: '#c48b70', color: '#6c2b17' },
        exhausted: { background: '#f6edd6', border: '#c7a75f', color: '#6a4a10' },
        expired: { background: '#ece9e2', border: '#aaa08c', color: '#554c3c' },
    }[status];

    return {
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        color: palette.color,
        display: 'inline-flex',
        fontSize: '0.8rem',
        fontWeight: 700,
        padding: '0.28rem 0.7rem',
    };
};

const QuizInvitationsPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const { error: quizError, isLoading: isLoadingQuiz, metadata } = useAdminQuizDefinition(adminKey);

    const [invitations, setInvitations] = React.useState<QuizInvitation[]>([]);
    const [draftMaxUses, setDraftMaxUses] = React.useState<Record<string, string>>({});
    const [draftSharingModes, setDraftSharingModes] = React.useState<Record<string, QuizInvitation['result_sharing_mode']>>({});
    const [draftSharebackNames, setDraftSharebackNames] = React.useState<Record<string, string>>({});
    const [message, setMessage] = React.useState<string | null>(null);
    const [pageError, setPageError] = React.useState<string | null>(null);
    const [isLoadingInvitations, setIsLoadingInvitations] = React.useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
    const [createLabel, setCreateLabel] = React.useState('');
    const [createMaxUses, setCreateMaxUses] = React.useState('');
    const [createSharingMode, setCreateSharingMode] = React.useState<QuizInvitation['result_sharing_mode']>('off');
    const [createSharebackName, setCreateSharebackName] = React.useState('');
    const [busyInvitationId, setBusyInvitationId] = React.useState<string | null>(null);
    const [isCreating, setIsCreating] = React.useState(false);

    const syncDrafts = React.useCallback((nextInvitations: QuizInvitation[]) => {
        setDraftMaxUses(
            Object.fromEntries(
                nextInvitations.map((invitation) => [
                    invitation.id,
                    invitation.max_uses === null ? '' : String(invitation.max_uses),
                ])
            )
        );
        setDraftSharingModes(
            Object.fromEntries(nextInvitations.map((invitation) => [invitation.id, invitation.result_sharing_mode]))
        );
        setDraftSharebackNames(
            Object.fromEntries(nextInvitations.map((invitation) => [invitation.id, invitation.shareback_name]))
        );
    }, []);

    const loadInvitations = React.useCallback(async () => {
        if (!adminKey) {
            setPageError('Missing admin key.');
            setIsLoadingInvitations(false);
            return;
        }

        setIsLoadingInvitations(true);
        setPageError(null);

        try {
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/invitations`);
            const body = (await response.json()) as { error?: string; invitations?: QuizInvitation[] };

            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to load invitations.');
            }

            const parsed = listQuizInvitationsResponseSchema.parse(body);
            setInvitations(parsed.invitations);
            syncDrafts(parsed.invitations);
        } catch (error) {
            setPageError(formatError(error));
        } finally {
            setIsLoadingInvitations(false);
        }
    }, [adminKey, syncDrafts]);

    React.useEffect(() => {
        void loadInvitations();
    }, [loadInvitations]);

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        setCreateLabel('');
        setCreateMaxUses('');
        setCreateSharingMode('off');
        setCreateSharebackName('');
    };

    const copyText = async (text: string) => {
        if (!navigator.clipboard?.writeText) {
            throw new Error('Clipboard API is not available in this browser context.');
        }

        await navigator.clipboard.writeText(text);
    };

    const handleCopyLink = async (invitation: QuizInvitation) => {
        setMessage(null);
        setPageError(null);

        if (!navigator.clipboard?.writeText) {
            setPageError('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            await copyText(buildInvitationUrl(invitation.invitation_key, window.location.origin));
            setMessage('Copied invitation link to clipboard.');
        } catch (error) {
            setPageError(formatError(error));
        }
    };

    const handleCreateInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setPageError(null);

        if (!adminKey) {
            setPageError('Missing admin key.');
            return;
        }

        try {
            if (requiresSharebackName(createSharingMode) && createSharebackName.trim().length === 0) {
                throw new Error('Share-back name is required when result sharing is enabled.');
            }

            setIsCreating(true);
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/invitations`, {
                body: JSON.stringify({
                    label: createLabel.trim(),
                    max_uses: normalizeMaxUsesInput(createMaxUses),
                    result_sharing_mode: createSharingMode,
                    shareback_name: createSharebackName.trim(),
                }),
                headers: {
                    'content-type': 'application/json',
                },
                method: 'POST',
            });
            const body = (await response.json()) as InvitationResponse;

            if (!response.ok || !body.invitation) {
                throw new Error(body.error ?? 'Failed to create invitation.');
            }

            const invitation = quizInvitationSchema.parse(body.invitation);
            const nextInvitations = [invitation, ...invitations];
            setInvitations(nextInvitations);
            syncDrafts(nextInvitations);
            closeCreateModal();
            setMessage('Created a new invitation link.');
        } catch (error) {
            setPageError(formatError(error));
        } finally {
            setIsCreating(false);
        }
    };

    const handleSaveMaxUses = async (invitationId: string) => {
        setMessage(null);
        setPageError(null);

        if (!adminKey) {
            setPageError('Missing admin key.');
            return;
        }

        try {
            const draftMode = draftSharingModes[invitationId] ?? 'off';
            const draftSharebackName = draftSharebackNames[invitationId] ?? '';
            if (requiresSharebackName(draftMode) && draftSharebackName.trim().length === 0) {
                throw new Error('Share-back name is required when result sharing is enabled.');
            }

            setBusyInvitationId(invitationId);
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/invitations/${encodeURIComponent(invitationId)}`, {
                body: JSON.stringify({
                    max_uses: normalizeMaxUsesInput(draftMaxUses[invitationId] ?? ''),
                    result_sharing_mode: draftMode,
                    shareback_name: draftSharebackName.trim(),
                }),
                headers: {
                    'content-type': 'application/json',
                },
                method: 'PATCH',
            });
            const body = (await response.json()) as InvitationResponse;

            if (!response.ok || !body.invitation) {
                throw new Error(body.error ?? 'Failed to update invitation.');
            }

            const invitation = quizInvitationSchema.parse(body.invitation);
            const nextInvitations = invitations.map((entry) => (entry.id === invitation.id ? invitation : entry));
            setInvitations(nextInvitations);
            syncDrafts(nextInvitations);
            setMessage('Updated max uses.');
        } catch (error) {
            setPageError(formatError(error));
        } finally {
            setBusyInvitationId(null);
        }
    };

    const handleDeactivate = async (invitationId: string) => {
        setMessage(null);
        setPageError(null);

        if (!adminKey) {
            setPageError('Missing admin key.');
            return;
        }

        try {
            setBusyInvitationId(invitationId);
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/invitations/${encodeURIComponent(invitationId)}/deactivate`, {
                method: 'POST',
            });
            const body = (await response.json()) as InvitationResponse;

            if (!response.ok || !body.invitation) {
                throw new Error(body.error ?? 'Failed to deactivate invitation.');
            }

            const invitation = quizInvitationSchema.parse(body.invitation);
            const nextInvitations = invitations.map((entry) => (entry.id === invitation.id ? invitation : entry));
            setInvitations(nextInvitations);
            syncDrafts(nextInvitations);
            setMessage('Invitation deactivated.');
        } catch (error) {
            setPageError(formatError(error));
        } finally {
            setBusyInvitationId(null);
        }
    };

    return (
        <AdminShell adminKey={adminKey} currentPage="invitations" metadata={metadata}>
            <header style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.35rem' }}>Quiz Invitations</h1>
                    <p style={{ margin: 0 }}>
                        Create and manage invitation links for this quiz.
                    </p>
                </div>
                <button
                    onClick={() => {
                        setMessage(null);
                        setPageError(null);
                        setIsCreateModalOpen(true);
                    }}
                    style={{
                        background: '#6a5032',
                        border: 'none',
                        borderRadius: 999,
                        color: '#f6f0df',
                        cursor: 'pointer',
                        padding: '0.8rem 1.25rem',
                    }}
                    type="button"
                >
                    Create New Link
                </button>
            </header>

            {quizError ? (
                <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', color: '#6f2412', marginBottom: '1rem', padding: '0.75rem 1rem', whiteSpace: 'pre-wrap' }}>
                    {quizError}
                </div>
            ) : null}

            {pageError ? (
                <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', color: '#6f2412', marginBottom: '1rem', padding: '0.75rem 1rem', whiteSpace: 'pre-wrap' }}>
                    {pageError}
                </div>
            ) : null}

            {message ? (
                <div style={{ background: '#edf7ed', border: '1px solid #5a8f5a', color: '#1f4f1f', marginBottom: '1rem', padding: '0.75rem 1rem' }}>
                    {message}
                </div>
            ) : null}

            {isCreateModalOpen ? (
                <div
                    style={{
                        alignItems: 'center',
                        background: 'rgba(28, 18, 8, 0.5)',
                        display: 'flex',
                        inset: 0,
                        justifyContent: 'center',
                        padding: '1.5rem',
                        position: 'fixed',
                        zIndex: 40,
                    }}
                >
                    <div style={{ ...panelStyle, boxShadow: '0 20px 60px rgba(28, 18, 8, 0.28)', maxWidth: 520, width: '100%' }}>
                        <div style={{ alignItems: 'flex-start', display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div>
                                <h2 style={{ margin: 0 }}>Create New Link</h2>
                                <p style={{ color: '#5d4b30', margin: '0.35rem 0 0' }}>Create an invitation link above the current list.</p>
                            </div>
                            <button
                                onClick={closeCreateModal}
                                style={{ background: 'transparent', border: '1px solid #b7ab91', borderRadius: 999, color: '#4a3922', cursor: 'pointer', padding: '0.55rem 0.9rem' }}
                                type="button"
                            >
                                Close
                            </button>
                        </div>

                        <form onSubmit={handleCreateInvitation}>
                            <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.9rem' }}>
                                <span style={{ color: '#4e3d24', fontWeight: 700 }}>Label</span>
                                <input
                                    onChange={(event) => setCreateLabel(event.target.value)}
                                    placeholder="Optional internal label"
                                    style={{ border: '1px solid #c8bfa9', borderRadius: 12, padding: '0.75rem 0.9rem' }}
                                    type="text"
                                    value={createLabel}
                                />
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '1rem' }}>
                                <span style={{ color: '#4e3d24', fontWeight: 700 }}>Max Uses</span>
                                <input
                                    inputMode="numeric"
                                    onChange={(event) => setCreateMaxUses(event.target.value)}
                                    placeholder="Leave blank for unlimited"
                                    style={{ border: '1px solid #c8bfa9', borderRadius: 12, padding: '0.75rem 0.9rem' }}
                                    type="text"
                                    value={createMaxUses}
                                />
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '1rem' }}>
                                <span style={{ color: '#4e3d24', fontWeight: 700 }}>Result Sharing</span>
                                <select
                                    onChange={(event) => setCreateSharingMode(event.target.value as QuizInvitation['result_sharing_mode'])}
                                    style={{ border: '1px solid #c8bfa9', borderRadius: 12, padding: '0.75rem 0.9rem' }}
                                    value={createSharingMode}
                                >
                                    {sharingModeOptions.map((mode) => (
                                        <option key={mode} value={mode}>
                                            {sharingModeLabels[mode]}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ color: '#6b5734', fontSize: '0.88rem' }}>{sharingModeDescriptions[createSharingMode]}</div>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '1rem' }}>
                                <span style={{ color: '#4e3d24', fontWeight: 700 }}>
                                    Share-Back Name {requiresSharebackName(createSharingMode) ? '(required)' : '(optional)'}
                                </span>
                                <input
                                    onChange={(event) => setCreateSharebackName(event.target.value)}
                                    placeholder="Example: Acme Team"
                                    style={{ border: '1px solid #c8bfa9', borderRadius: 12, padding: '0.75rem 0.9rem' }}
                                    type="text"
                                    value={createSharebackName}
                                />
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <button
                                    disabled={isCreating}
                                    style={{ background: '#30291f', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: 'pointer', padding: '0.75rem 1.25rem' }}
                                    type="submit"
                                >
                                    {isCreating ? 'Creating…' : 'Create Link'}
                                </button>
                                <button
                                    disabled={isCreating}
                                    onClick={closeCreateModal}
                                    style={{ background: '#e9dfc8', border: '1px solid #b7ab91', borderRadius: 999, color: '#4a3922', cursor: 'pointer', padding: '0.75rem 1.25rem' }}
                                    type="button"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            <section style={panelStyle}>
                <h2 style={{ marginTop: 0 }}>Existing Invitations</h2>
                {isLoadingQuiz || isLoadingInvitations ? <div>Loading invitations...</div> : null}
                {!isLoadingQuiz && !isLoadingInvitations && invitations.length === 0 ? (
                    <div style={{ color: '#6b5734' }}>No invitation links have been created yet.</div>
                ) : null}

                <div style={{ display: 'grid', gap: '1rem' }}>
                    {invitations.map((invitation) => {
                        const status = getQuizInvitationStatus(invitation);
                        const isBusy = busyInvitationId === invitation.id;

                        return (
                            <article key={invitation.id} style={{ background: '#fffaf0', border: '1px solid #d7ccb4', borderRadius: 16, display: 'grid', gap: '0.85rem', padding: '1rem' }}>
                                <div style={{ alignItems: 'flex-start', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                            {invitation.label.trim().length > 0 ? invitation.label : `Invitation ${invitation.id.slice(0, 8)}`}
                                        </div>
                                        <div style={{ color: '#6b5734', fontSize: '0.9rem' }}>Created {formatDate(invitation.created_at)}</div>
                                    </div>
                                    <span style={statusStyle(status)}>{statusLabelByState[status]}</span>
                                </div>

                                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Uses</div>
                                        <div style={{ fontWeight: 700 }}>{invitation.use_count}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Max Uses</div>
                                        <div style={{ fontWeight: 700 }}>{invitation.max_uses === null ? 'Unlimited' : invitation.max_uses}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Sharing Mode</div>
                                        <div style={{ fontWeight: 700 }}>{sharingModeLabels[invitation.result_sharing_mode]}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Share-Back Name</div>
                                        <div style={{ fontWeight: 700 }}>{invitation.shareback_name.trim() || '—'}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Invitation Path</div>
                                        <div style={{ fontSize: '0.86rem', wordBreak: 'break-all' }}>/invite/{invitation.invitation_key}</div>
                                    </div>
                                </div>

                                <div style={{ alignItems: 'end', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                                        <span style={{ color: '#4e3d24', fontSize: '0.9rem', fontWeight: 700 }}>Adjust Max Uses</span>
                                        <input
                                            disabled={isBusy}
                                            inputMode="numeric"
                                            onChange={(event) =>
                                                setDraftMaxUses((current) => ({
                                                    ...current,
                                                    [invitation.id]: event.target.value,
                                                }))
                                            }
                                            placeholder="Unlimited"
                                            style={{ border: '1px solid #c8bfa9', borderRadius: 12, padding: '0.75rem 0.9rem' }}
                                            type="text"
                                            value={draftMaxUses[invitation.id] ?? ''}
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                                        <span style={{ color: '#4e3d24', fontSize: '0.9rem', fontWeight: 700 }}>Result Sharing</span>
                                        <select
                                            disabled={isBusy}
                                            onChange={(event) =>
                                                setDraftSharingModes((current) => ({
                                                    ...current,
                                                    [invitation.id]: event.target.value as QuizInvitation['result_sharing_mode'],
                                                }))
                                            }
                                            style={{ border: '1px solid #c8bfa9', borderRadius: 12, padding: '0.75rem 0.9rem' }}
                                            value={draftSharingModes[invitation.id] ?? invitation.result_sharing_mode}
                                        >
                                            {sharingModeOptions.map((mode) => (
                                                <option key={mode} value={mode}>
                                                    {sharingModeLabels[mode]}
                                                </option>
                                            ))}
                                        </select>
                                        <div style={{ color: '#6b5734', fontSize: '0.82rem' }}>{sharingModeDescriptions[draftSharingModes[invitation.id] ?? invitation.result_sharing_mode]}</div>
                                    </label>
                                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                                        <span style={{ color: '#4e3d24', fontSize: '0.9rem', fontWeight: 700 }}>
                                            Share-Back Name {requiresSharebackName(draftSharingModes[invitation.id] ?? invitation.result_sharing_mode) ? '(required)' : '(optional)'}
                                        </span>
                                        <input
                                            disabled={isBusy}
                                            onChange={(event) =>
                                                setDraftSharebackNames((current) => ({
                                                    ...current,
                                                    [invitation.id]: event.target.value,
                                                }))
                                            }
                                            placeholder="Example: Acme Team"
                                            style={{ border: '1px solid #c8bfa9', borderRadius: 12, padding: '0.75rem 0.9rem' }}
                                            type="text"
                                            value={draftSharebackNames[invitation.id] ?? invitation.shareback_name}
                                        />
                                    </label>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                                    <button
                                        disabled={isBusy}
                                        onClick={() => {
                                            void handleSaveMaxUses(invitation.id);
                                        }}
                                        style={{ background: '#30291f', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: 'pointer', padding: '0.75rem 1.1rem' }}
                                        type="button"
                                    >
                                        {isBusy ? 'Saving…' : 'Save Invitation Settings'}
                                    </button>
                                    <button
                                        disabled={isBusy}
                                        onClick={() => {
                                            void handleCopyLink(invitation);
                                        }}
                                        style={{ background: '#6a5032', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: 'pointer', padding: '0.75rem 1.1rem' }}
                                        type="button"
                                    >
                                        Copy Invitation Link
                                    </button>
                                    <button
                                        disabled={isBusy || invitation.revoked_at !== null}
                                        onClick={() => {
                                            void handleDeactivate(invitation.id);
                                        }}
                                        style={{ background: invitation.revoked_at ? '#d9d0be' : '#efe2d2', border: '1px solid #c5a98d', borderRadius: 999, color: '#5d3b21', cursor: invitation.revoked_at ? 'default' : 'pointer', padding: '0.75rem 1.1rem' }}
                                        type="button"
                                    >
                                        {invitation.revoked_at ? 'Deactivated' : 'Deactivate'}
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Auto-created Result Links</div>
                                    {invitation.shared_view_keys.length === 0 ? (
                                        <div style={{ color: '#6b5734' }}>No shared result links have been created yet.</div>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '0.6rem' }}>
                                            {invitation.shared_view_keys.map((viewKey, index) => (
                                                <a
                                                    key={viewKey.id}
                                                    href={buildViewUrl(viewKey.view_key, window.location.origin)}
                                                    rel="noreferrer"
                                                    style={{
                                                        alignItems: 'center',
                                                        background: '#f4ead3',
                                                        border: '1px solid #d2c19f',
                                                        borderRadius: 12,
                                                        color: '#4b3217',
                                                        display: 'flex',
                                                        fontWeight: 700,
                                                        justifyContent: 'space-between',
                                                        padding: '0.7rem 0.9rem',
                                                        textDecoration: 'none',
                                                    }}
                                                    target="_blank"
                                                >
                                                    <span>Open shared result #{index + 1}</span>
                                                    <span style={{ color: '#6b5734', fontSize: '0.82rem', fontWeight: 500 }}>created {formatDate(viewKey.created_at)}</span>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>
        </AdminShell>
    );
};

export default QuizInvitationsPage;