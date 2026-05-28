import React from 'react';
import { useNavigate } from 'react-router-dom';

import type { StoredAdminSession, StoredRespondentSession } from '../lib/respondent-quiz';

type SessionNavigationProps = {
    adminSessions: StoredAdminSession[];
    currentAdminToken?: string;
    currentResponseKey?: string;
    onSelectAdminToken?: (adminToken: string) => void;
    onSelectResponseKey?: (responseKey: string) => void;
    respondentSessions: StoredRespondentSession[];
};

const modalOverlayStyle: React.CSSProperties = {
    alignItems: 'center',
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    justifyContent: 'center',
    left: 0,
    position: 'fixed',
    right: 0,
    top: 0,
    zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
    background: '#f8f7f3',
    borderRadius: 20,
    boxShadow: '0 18px 45px rgba(45, 35, 20, 0.15)',
    maxHeight: '80vh',
    maxWidth: 500,
    overflow: 'auto',
    padding: '2rem',
};

const sectionStyle: React.CSSProperties = {
    marginBottom: '1.5rem',
};

const sectionTitleStyle: React.CSSProperties = {
    color: '#241d14',
    fontSize: '1.05rem',
    fontWeight: 700,
    marginBottom: '0.75rem',
    marginTop: 0,
};

const listItemStyle: React.CSSProperties = {
    background: '#fcfbf8',
    border: '1px solid #c7bea9',
    borderRadius: 12,
    cursor: 'pointer',
    display: 'block',
    marginBottom: '0.6rem',
    padding: '0.75rem 1rem',
    textAlign: 'left',
    width: '100%',
};

const listItemHoverStyle: React.CSSProperties = {
    ...listItemStyle,
    background: '#f1ede4',
};

const labelStyle: React.CSSProperties = {
    color: '#241d14',
    display: 'block',
    fontSize: '1rem',
    fontWeight: 500,
    marginBottom: '0.2rem',
};

const metaStyle: React.CSSProperties = {
    color: '#6b5734',
    fontSize: '0.82rem',
    marginTop: '0.25rem',
};

export const SessionNavigationModal: React.FC<SessionNavigationProps & { onClose: () => void }> = ({
    adminSessions,
    currentAdminToken,
    currentResponseKey,
    onClose,
    onSelectAdminToken,
    onSelectResponseKey,
    respondentSessions,
}) => {
    const navigate = useNavigate();
    const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);

    const handleSelectAdmin = (adminToken: string) => {
        if (onSelectAdminToken) {
            onSelectAdminToken(adminToken);
        } else {
            navigate(`/admin/${encodeURIComponent(adminToken)}/edit`);
        }
        onClose();
    };

    const handleSelectResponse = (responseKey: string) => {
        if (onSelectResponseKey) {
            onSelectResponseKey(responseKey);
        } else {
            navigate(`/quiz/${encodeURIComponent(responseKey)}`);
        }
        onClose();
    };

    const hasAdminSessions = adminSessions.length > 0;
    const hasRespondentSessions = respondentSessions.length > 0;

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ color: '#241d14', marginTop: 0 }}>Your Sessions</h2>

                {hasAdminSessions && (
                    <div style={sectionStyle}>
                        <h3 style={sectionTitleStyle}>My Quizzes</h3>
                        <div>
                            {adminSessions.map((session) => {
                                const isCurrent = currentAdminToken === session.admin_token;
                                return (
                                    <button
                                        key={session.admin_token}
                                        disabled={isCurrent}
                                        onMouseEnter={() => !isCurrent && setHoveredItem(`admin-${session.admin_token}`)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        onClick={() => !isCurrent && handleSelectAdmin(session.admin_token)}
                                        style={{
                                            ...listItemStyle,
                                            ...(isCurrent && {
                                                background: '#e7dfcf',
                                                border: '2px solid #8b6940',
                                                cursor: 'default',
                                            }),
                                            ...(hoveredItem === `admin-${session.admin_token}` && !isCurrent && listItemHoverStyle),
                                        }}
                                        type="button"
                                    >
                                        <span style={labelStyle}>{session.quiz_title}</span>
                                        {isCurrent && (
                                            <span style={{ ...metaStyle, fontWeight: 600 }}>Currently editing</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {hasRespondentSessions && (
                    <div style={sectionStyle}>
                        <h3 style={sectionTitleStyle}>My Responses</h3>
                        <div>
                            {respondentSessions.map((session) => {
                                const isCurrent = currentResponseKey === session.response_key;
                                const isCompleted = session.submitted_at !== null;
                                const refDate = isCompleted ? new Date(session.submitted_at) : new Date(session.last_interacted_at);
                                const isToday = refDate.toDateString() === new Date().toDateString();
                                const timeLabel = isToday
                                    ? refDate.toLocaleTimeString('en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                      })
                                    : refDate.toLocaleDateString();
                                const statusText = isCompleted ? `Completed - ${timeLabel}` : `In progress - ${timeLabel}`;

                                return (
                                    <button
                                        key={session.response_key}
                                        disabled={isCurrent}
                                        onMouseEnter={() => !isCurrent && setHoveredItem(`response-${session.response_key}`)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        onClick={() => !isCurrent && handleSelectResponse(session.response_key)}
                                        style={{
                                            ...listItemStyle,
                                            ...(isCurrent && {
                                                background: '#e7dfcf',
                                                border: '2px solid #8b6940',
                                                cursor: 'default',
                                            }),
                                            ...(hoveredItem === `response-${session.response_key}` && !isCurrent && listItemHoverStyle),
                                        }}
                                        type="button"
                                    >
                                        <span style={labelStyle}>{session.quiz_title}</span>
                                        <span style={metaStyle}>{statusText}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!hasAdminSessions && !hasRespondentSessions && (
                    <div
                        style={{
                            background: '#f1ede4',
                            border: '1px dashed #9f9378',
                            borderRadius: 12,
                            color: '#3d3120',
                            padding: '1rem 1.1rem',
                        }}
                    >
                        No saved sessions yet. Start by creating a quiz or answering an invitation.
                    </div>
                )}

                <button
                    onClick={onClose}
                    style={{
                        background: '#e7dfcf',
                        border: '1px solid #b8ae98',
                        borderRadius: 999,
                        color: '#241d14',
                        cursor: 'pointer',
                        fontWeight: 500,
                        marginTop: '1.5rem',
                        padding: '0.65rem 1.2rem',
                        width: '100%',
                    }}
                    type="button"
                >
                    Close
                </button>
            </div>
        </div>
    );
};
