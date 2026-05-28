import React from 'react';

import type { StoredAdminSession, StoredRespondentSession } from '../lib/respondent-quiz';
import { listStoredAdminSessions } from '../lib/respondent-quiz';
import { SessionNavigationModal } from './session-navigation';

type RespondentShellProps = {
    children: React.ReactNode;
    currentResponseKey: string;
    onSelectSession: (responseKey: string) => void;
    quizTitle: string;
    sessions: StoredRespondentSession[];
};

export const RespondentShell: React.FC<RespondentShellProps> = ({
    children,
    currentResponseKey,
    onSelectSession,
    quizTitle,
    sessions,
}) => {
    const [isNavigationOpen, setIsNavigationOpen] = React.useState(false);
    const [adminSessions, setAdminSessions] = React.useState<StoredAdminSession[]>([]);

    React.useEffect(() => {
        setAdminSessions(listStoredAdminSessions());
    }, []);

    return (
        <div style={{ minHeight: '100vh', padding: '2rem 1.5rem' }}>
            <div style={{ margin: '0 auto 1.5rem', maxWidth: 980 }}>
                <header
                    style={{
                        alignItems: 'center',
                        background: '#f8f7f3',
                        border: '1px solid #b8ae98',
                        borderRadius: 20,
                        boxShadow: '0 18px 45px rgba(45, 35, 20, 0.08)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                    }}
                >
                    <div>
                        <button
                            onClick={() => setIsNavigationOpen(true)}
                            style={{
                                background: 'transparent',
                                border: '1px solid #b8ae98',
                                borderRadius: 999,
                                color: '#7a6548',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                marginBottom: '0.5rem',
                                padding: '0.4rem 0.8rem',
                            }}
                            type="button"
                        >
                            ≡ Your Sessions
                        </button>
                        <div style={{ color: '#4a3b26', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            Mr. Kwiz
                        </div>
                        <h1 style={{ color: '#241d14', fontSize: '1.6rem', margin: '0.25rem 0 0' }}>{quizTitle}</h1>
                    </div>
                </header>
            </div>
            {children}

            {isNavigationOpen && (
                <SessionNavigationModal
                    adminSessions={adminSessions}
                    currentResponseKey={currentResponseKey}
                    onClose={() => setIsNavigationOpen(false)}
                    onSelectResponseKey={onSelectSession}
                    respondentSessions={sessions}
                />
            )}
        </div>
    );
};