import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';

import {
    markRespondentIntroSkipped,
    respondentInvitationPickupSchema,
    respondentPickupCreateRequestSchema,
    respondentPickupCreateResponseSchema,
    saveStoredRespondentSession,
} from '../../lib/respondent-quiz';

const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 250, 240, 0.92)',
    border: '1px solid #c8bfa9',
    borderRadius: 20,
    boxShadow: '0 18px 45px rgba(70, 54, 28, 0.08)',
    padding: '1.5rem',
};

const startButtonStyle: React.CSSProperties = {
    background: '#245a78',
    border: 'none',
    borderRadius: 999,
    color: '#f6f0df',
    cursor: 'pointer',
    padding: '1rem 2rem',
};

const InvitationPickupPage: React.FC = () => {
    const navigate = useNavigate();
    const { invitationKey } = useParams<{ invitationKey: string }>();
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isStarting, setIsStarting] = React.useState(false);
    const [copyMessage, setCopyMessage] = React.useState<string | null>(null);
    const [pickup, setPickup] = React.useState<ReturnType<typeof respondentInvitationPickupSchema.parse> | null>(null);
    const [shareResultsWithInviter, setShareResultsWithInviter] = React.useState(false);

    React.useEffect(() => {
        const loadInvitation = async () => {
            if (!invitationKey) {
                setError('Missing invitation key.');
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                const invitationResponse = await fetch(`/api/respondent/invite/${encodeURIComponent(invitationKey)}`);
                const invitationBody = await invitationResponse.json();
                if (!invitationResponse.ok) {
                    throw new Error(invitationBody.error ?? 'Failed to load invitation.');
                }

                setPickup(respondentInvitationPickupSchema.parse(invitationBody));
            } catch (pickupError) {
                setError(pickupError instanceof Error ? pickupError.message : 'Unknown error.');
            } finally {
                setIsLoading(false);
            }
        };

        void loadInvitation();
    }, [invitationKey]);

    React.useEffect(() => {
        if (!pickup) {
            return;
        }

        setShareResultsWithInviter(pickup.invitation.result_sharing_mode === 'opt_out');
    }, [pickup]);

    const sharingMode = pickup?.invitation.result_sharing_mode ?? 'off';
    const sharebackName = pickup?.invitation.shareback_name.trim() || 'quiz owner';
    const invitationUrl = invitationKey ? `${window.location.origin}/invite/${invitationKey}` : '';

    const handleCopyQuizLink = async () => {
        if (!invitationUrl) {
            setCopyMessage('Quiz link is not available yet.');
            return;
        }

        if (!navigator.clipboard?.writeText) {
            setCopyMessage('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            await navigator.clipboard.writeText(invitationUrl);
            setCopyMessage('Copied quiz link to clipboard.');
        } catch (copyError) {
            setCopyMessage(copyError instanceof Error ? copyError.message : 'Failed to copy quiz link.');
        }
    };

    const handleStartQuiz = async () => {
        if (!invitationKey || !pickup) {
            setError('Missing invitation context.');
            return;
        }

        setError(null);
        setIsStarting(true);

        try {
            const payload = respondentPickupCreateRequestSchema.parse({
                share_results_with_inviter:
                    sharingMode === 'opt_in' || sharingMode === 'opt_out'
                        ? shareResultsWithInviter
                        : undefined,
            });
            const pickupResponse = await fetch(`/api/respondent/invite/${encodeURIComponent(invitationKey)}/pickup`, {
                body: JSON.stringify(payload),
                headers: {
                    'content-type': 'application/json',
                },
                method: 'POST',
            });
            const pickupBody = await pickupResponse.json();
            if (!pickupResponse.ok) {
                throw new Error(pickupBody.error ?? 'Failed to start quiz.');
            }

            const parsedResponse = respondentPickupCreateResponseSchema.parse(pickupBody);
            saveStoredRespondentSession({
                quiz_title: parsedResponse.quiz.title,
                response_key: parsedResponse.response.response_key,
            });
            markRespondentIntroSkipped(parsedResponse.response.response_key);
            navigate(`/quiz/${encodeURIComponent(parsedResponse.response.response_key)}`);
        } catch (startError) {
            setError(startError instanceof Error ? startError.message : 'Failed to start quiz.');
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div style={{ margin: '0 auto', maxWidth: 980, padding: '2.5rem 1.5rem 3rem' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(231, 223, 207, 0.95), rgba(248, 247, 243, 0.95))', border: '1px solid #c8bfa9', borderRadius: 24, boxShadow: '0 18px 45px rgba(70, 54, 28, 0.08)', padding: '2rem' }}>
                <div style={{ color: '#6b5734', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Mr. Kwiz Quiz Invitation</div>
                <h1 style={{ color: '#241d14', fontSize: '2.6rem', lineHeight: 1.08, margin: '0.4rem 0 0.35rem' }}>{pickup?.quiz.title ?? 'Preparing your quiz...'}</h1>
                <p style={{ color: '#4d3d28', fontSize: '1.08rem', lineHeight: 1.7, margin: 0, maxWidth: 760 }}>{pickup?.quiz.description || 'Start when you are ready.'}</p>

                {pickup?.quiz.intro_markdown?.trim().length ? (
                    <div style={{ color: '#342c20', lineHeight: 1.7, marginTop: '1rem', maxWidth: 820 }}>
                        <ReactMarkdown>{pickup.quiz.intro_markdown}</ReactMarkdown>
                    </div>
                ) : null}

                {error ? <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', color: '#6f2412', marginTop: '1rem', padding: '0.9rem 1rem', whiteSpace: 'pre-wrap' }}>{error}</div> : null}
                {copyMessage ? <div style={{ background: '#edf7ed', border: '1px solid #5a8f5a', color: '#1f4f1f', marginTop: '1rem', padding: '0.9rem 1rem' }}>{copyMessage}</div> : null}
                {isLoading ? <div style={{ marginTop: '1rem', color: '#5a4a2f' }}>Loading invitation...</div> : null}
            </div>

            {!isLoading && pickup ? (
                <div style={{ display: 'grid', gap: '1rem', marginTop: '1.25rem' }}>
                    <div style={{ ...cardStyle, display: 'grid', gap: '1rem' }}>
                        <button
                            disabled={isStarting}
                            onClick={() => {
                                void handleStartQuiz();
                            }}
                            style={{
                                ...startButtonStyle,
                                alignSelf: 'center',
                                boxShadow: '0 10px 26px rgba(36, 90, 120, 0.28)',
                                fontSize: '1.2rem',
                                fontWeight: 800,
                                justifySelf: 'center',
                                minWidth: 260,
                            }}
                            type="button"
                        >
                            {isStarting ? 'Starting…' : 'Start Quiz'}
                        </button>

                        {sharingMode !== 'off' ? (
                            <div style={{ color: '#5a4a2f', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                {sharingMode === 'mandatory' ? (
                                    <span>Your results will be shared with {sharebackName}.</span>
                                ) : (
                                    <label style={{ alignItems: 'start', cursor: 'pointer', display: 'flex', gap: '0.55rem' }}>
                                        <input
                                            checked={shareResultsWithInviter}
                                            onChange={(event) => setShareResultsWithInviter(event.target.checked)}
                                            style={{ marginTop: '0.2rem' }}
                                            type="checkbox"
                                        />
                                        <span>{sharingMode === 'opt_out' ? `Share my results with ${sharebackName} (enabled by default for this invitation)` : `Share my results with ${sharebackName}`}</span>
                                    </label>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {!isLoading && pickup ? (
                <div style={{ marginTop: '1.35rem' }}>
                    <div style={{ color: '#6b5734', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.55rem', textTransform: 'uppercase' }}>Use this link to resume on another device</div>
                    <div style={{ alignItems: 'center', display: 'flex', gap: '0.6rem' }}>
                        <input
                            readOnly
                            value={invitationUrl}
                            style={{ background: '#fcfbf8', border: '1px solid #c8bfa9', borderRadius: 12, color: '#241d14', flex: 1, minWidth: 0, padding: '0.75rem 0.9rem' }}
                        />
                        <button
                            onClick={() => {
                                void handleCopyQuizLink();
                            }}
                            style={{ background: 'transparent', border: '1px solid #245a78', borderRadius: 999, color: '#245a78', cursor: 'pointer', fontWeight: 700, padding: '0.65rem 1rem', whiteSpace: 'nowrap' }}
                            type="button"
                        >
                            Copy
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default InvitationPickupPage;