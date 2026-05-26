import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
    respondentInvitationPickupSchema,
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
    const [pickup, setPickup] = React.useState<ReturnType<typeof respondentInvitationPickupSchema.parse> | null>(null);
    const [responseSession, setResponseSession] = React.useState<ReturnType<typeof respondentPickupCreateResponseSchema.parse> | null>(null);

    React.useEffect(() => {
        const runPickup = async () => {
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

                const pickupResponse = await fetch(`/api/respondent/invite/${encodeURIComponent(invitationKey)}/pickup`, {
                    method: 'POST',
                });
                const pickupBody = await pickupResponse.json();
                if (!pickupResponse.ok) {
                    throw new Error(pickupBody.error ?? 'Failed to create your quiz link.');
                }

                const parsedResponse = respondentPickupCreateResponseSchema.parse(pickupBody);
                setResponseSession(parsedResponse);
                saveStoredRespondentSession({
                    quiz_title: parsedResponse.quiz.title,
                    response_key: parsedResponse.response.response_key,
                });
            } catch (pickupError) {
                setError(pickupError instanceof Error ? pickupError.message : 'Unknown error.');
            } finally {
                setIsLoading(false);
            }
        };

        void runPickup();
    }, [invitationKey]);

    return (
        <div style={{ margin: '0 auto', maxWidth: 900, padding: '3rem 1.5rem' }}>
            <div style={cardStyle}>
                <div style={{ color: '#6b5734', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Mr. Kwiz Invitation Pickup
                </div>
                <h1 style={{ marginBottom: '0.5rem' }}>{pickup?.quiz.title ?? 'Preparing your quiz...'}</h1>
                <p style={{ color: '#5a4a2f', marginTop: 0 }}>
                    Your personal response link is generated before you start answering. Save it so you can return later.
                </p>

                {error ? (
                    <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', color: '#6f2412', padding: '0.9rem 1rem', whiteSpace: 'pre-wrap' }}>
                        {error}
                    </div>
                ) : null}

                {isLoading ? <div>Generating your response link...</div> : null}

                {!isLoading && responseSession ? (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ background: '#fffdf7', border: '1px solid #d9ccb0', borderRadius: 16, padding: '1rem' }}>
                            <div style={{ color: '#4d3b22', fontWeight: 700, marginBottom: '0.45rem' }}>Your response link</div>
                            <div style={{ color: '#342c20', wordBreak: 'break-all' }}>{responseSession.response.resume_url}</div>
                        </div>
                        <div style={{ color: '#5a4a2f', lineHeight: 1.6 }}>
                            Save this link now. The simplest options are to bookmark it, paste it into notes, or message it to yourself somewhere you trust.
                        </div>
                        <button
                            onClick={() => navigate(`/quiz/${encodeURIComponent(responseSession.response.response_key)}`)}
                            style={{
                                background: '#6a5032',
                                border: 'none',
                                borderRadius: 999,
                                color: '#f6f0df',
                                cursor: 'pointer',
                                justifySelf: 'start',
                                padding: '0.85rem 1.4rem',
                            }}
                            type="button"
                        >
                            Continue to Quiz
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default InvitationPickupPage;