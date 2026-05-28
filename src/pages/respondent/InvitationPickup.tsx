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

const InvitationPickupPage: React.FC = () => {
    const navigate = useNavigate();
    const { invitationKey } = useParams<{ invitationKey: string }>();
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isStarting, setIsStarting] = React.useState(false);
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

                const parsedPickup = respondentInvitationPickupSchema.parse(invitationBody);
                setPickup(parsedPickup);
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

        if (pickup.invitation.result_sharing_mode === 'opt_out') {
            setShareResultsWithInviter(true);
            return;
        }

        setShareResultsWithInviter(false);
    }, [pickup]);

    const sharingMode = pickup?.invitation.result_sharing_mode ?? 'off';
    const sharebackName = pickup?.invitation.shareback_name.trim() || 'quiz owner';

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
        <div style={{ margin: '0 auto', maxWidth: 900, padding: '3rem 1.5rem' }}>
            <div style={cardStyle}>
                <div style={{ color: '#6b5734', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Mr. Kwiz Quiz Invitation
                </div>
                <h1 style={{ marginBottom: '0.5rem' }}>{pickup?.quiz.title ?? 'Preparing your quiz...'}</h1>
                <p style={{ color: '#5a4a2f', marginTop: 0 }}>
                    {pickup?.quiz.description || 'Start when you are ready.'}
                </p>

                {error ? (
                    <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', color: '#6f2412', padding: '0.9rem 1rem', whiteSpace: 'pre-wrap' }}>
                        {error}
                    </div>
                ) : null}

                {isLoading ? <div>Loading invitation...</div> : null}

                {!isLoading && pickup ? (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ background: '#fffdf7', border: '1px solid #d9ccb0', borderRadius: 16, padding: '1rem' }}>
                            <div style={{ color: '#4d3b22', fontWeight: 700, marginBottom: '0.45rem' }}>Quiz Link</div>
                            <div style={{ color: '#342c20', wordBreak: 'break-all' }}>
                                {window.location.origin}/invite/{pickup.invitation.invitation_key}
                            </div>
                        </div>

                        {pickup.quiz.intro_markdown?.trim().length ? (
                            <div style={{ background: '#fffdf7', border: '1px solid #d9ccb0', borderRadius: 16, color: '#342c20', lineHeight: 1.6, padding: '1rem' }}>
                                <ReactMarkdown>{pickup.quiz.intro_markdown}</ReactMarkdown>
                            </div>
                        ) : null}

                        {sharingMode !== 'off' ? (
                            <div style={{ background: '#fff8ea', border: '1px solid #d9c08d', borderRadius: 16, display: 'grid', gap: '0.65rem', padding: '1rem' }}>
                                <div style={{ color: '#4d3b22', fontWeight: 700 }}>Result Sharing</div>
                                {sharingMode === 'mandatory' ? (
                                    <div style={{ color: '#5a4a2f' }}>
                                        Your results will be shared with {sharebackName}.
                                    </div>
                                ) : (
                                    <label style={{ alignItems: 'start', color: '#5a4a2f', cursor: 'pointer', display: 'flex', gap: '0.6rem' }}>
                                        <input
                                            checked={shareResultsWithInviter}
                                            onChange={(event) => setShareResultsWithInviter(event.target.checked)}
                                            style={{ marginTop: '0.2rem' }}
                                            type="checkbox"
                                        />
                                        <span>
                                            {sharingMode === 'opt_out'
                                                ? `Share my results with ${sharebackName} (enabled by default for this invitation)`
                                                : `Share my results with ${sharebackName}`}
                                        </span>
                                    </label>
                                )}
                            </div>
                        ) : null}

                        <div style={{ color: '#5a4a2f', lineHeight: 1.6 }}>
                            When you click Start Quiz, your personal response session is created and you will go directly to the first question.
                        </div>
                        <button
                            disabled={isStarting}
                            onClick={() => {
                                void handleStartQuiz();
                            }}
                            style={{
                                background: '#6a5032',
                                border: 'none',
                                borderRadius: 999,
                                color: '#f6f0df',
                                cursor: isStarting ? 'default' : 'pointer',
                                justifySelf: 'start',
                                padding: '0.85rem 1.4rem',
                            }}
                            type="button"
                        >
                            {isStarting ? 'Starting…' : 'Start Quiz'}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default InvitationPickupPage;