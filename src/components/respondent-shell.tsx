import React from 'react';

import type { StoredRespondentSession } from '../lib/respondent-quiz';

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
    return (
        <div style={{ minHeight: '100vh', padding: '2rem 1.5rem' }}>
            <div style={{ margin: '0 auto 1.5rem', maxWidth: 980 }}>
                <header
                    style={{
                        alignItems: 'center',
                        background: 'rgba(255, 250, 240, 0.92)',
                        border: '1px solid #c8bfa9',
                        borderRadius: 20,
                        boxShadow: '0 18px 45px rgba(70, 54, 28, 0.08)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                    }}
                >
                    <div>
                        <div style={{ color: '#6b5734', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            Mr. Kwiz
                        </div>
                        <h1 style={{ fontSize: '1.6rem', margin: '0.25rem 0 0' }}>{quizTitle}</h1>
                    </div>
                    <label style={{ color: '#4d3b22', display: 'grid', gap: '0.35rem', minWidth: 240 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            Switch Saved Quiz
                        </span>
                        <select
                            onChange={(event) => onSelectSession(event.target.value)}
                            style={{
                                border: '1px solid #c8bfa9',
                                borderRadius: 12,
                                color: '#342c20',
                                padding: '0.7rem 0.9rem',
                            }}
                            value={currentResponseKey}
                        >
                            {sessions.map((session) => (
                                <option key={session.response_key} value={session.response_key}>
                                    {session.quiz_title}
                                </option>
                            ))}
                        </select>
                    </label>
                </header>
            </div>
            {children}
        </div>
    );
};