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
    const [message, setMessage] = React.useState<string | null>(null);
    const [pageError, setPageError] = React.useState<string | null>(null);
    const [isLoadingInvitations, setIsLoadingInvitations] = React.useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
    const [createLabel, setCreateLabel] = React.useState('');
    const [createMaxUses, setCreateMaxUses] = React.useState('');
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
    };

    const handleCopyLink = async (invitation: QuizInvitation) => {
        setMessage(null);
        setPageError(null);

        if (!navigator.clipboard?.writeText) {
            setPageError('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            await navigator.clipboard.writeText(buildInvitationUrl(invitation.invitation_key, window.location.origin));
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
            setIsCreating(true);
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/invitations`, {
                body: JSON.stringify({
                    label: createLabel.trim(),
                    max_uses: normalizeMaxUsesInput(createMaxUses),
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
            setBusyInvitationId(invitationId);
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/invitations/${encodeURIComponent(invitationId)}`, {
                body: JSON.stringify({
                    max_uses: normalizeMaxUsesInput(draftMaxUses[invitationId] ?? ''),
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
                            <article key={invitation.id} style={{ background: '#fffaf0', border: '1px solid #d7ccb4', borderRadius: 16, display: 'grid', gap: '1rem', padding: '1rem' }}>
                                <div style={{ alignItems: 'flex-start', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                            {invitation.label.trim().length > 0 ? invitation.label : `Invitation ${invitation.id.slice(0, 8)}`}
                                        </div>
                                        <div style={{ color: '#6b5734', fontSize: '0.9rem' }}>Created {formatDate(invitation.created_at)}</div>
                                    </div>
                                    <span style={statusStyle(status)}>{statusLabelByState[status]}</span>
                                </div>

                                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Uses</div>
                                        <div style={{ fontWeight: 700 }}>{invitation.use_count}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Max Uses</div>
                                        <div style={{ fontWeight: 700 }}>{invitation.max_uses === null ? 'Unlimited' : invitation.max_uses}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#6b5734', fontSize: '0.8rem', textTransform: 'uppercase' }}>Link Target</div>
                                        <div style={{ fontSize: '0.92rem', wordBreak: 'break-all' }}>/invite/{invitation.invitation_key}</div>
                                    </div>
                                </div>

                                <div style={{ alignItems: 'end', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'minmax(180px, 240px) auto auto' }}>
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
                                    <button
                                        disabled={isBusy}
                                        onClick={() => {
                                            void handleSaveMaxUses(invitation.id);
                                        }}
                                        style={{ background: '#30291f', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: 'pointer', padding: '0.75rem 1.1rem' }}
                                        type="button"
                                    >
                                        {isBusy ? 'Saving…' : 'Save Max Uses'}
                                    </button>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        <button
                                            disabled={isBusy}
                                            onClick={() => {
                                                void handleCopyLink(invitation);
                                            }}
                                            style={{ background: '#6a5032', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: 'pointer', padding: '0.75rem 1.1rem' }}
                                            type="button"
                                        >
                                            Copy Link
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