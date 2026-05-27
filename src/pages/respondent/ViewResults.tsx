import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QuizResultsScreen } from '../../components/quiz-preview';
import { quizDefinitionSchema } from '../../lib/quiz-definition';
import { computeRespondentScores, respondentSessionSchema, type RespondentSession } from '../../lib/respondent-quiz';

export default function ViewResultsPage() {
    const { viewKey } = useParams<{ viewKey: string }>();
    const [session, setSession] = useState<RespondentSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchResults = async () => {
            if (!viewKey) {
                setError('No view key provided');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/view/${viewKey}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        setError('This shared link is not found or has expired.');
                    } else if (response.status === 410) {
                        setError('This shared link has been revoked.');
                    } else {
                        setError('Failed to load results.');
                    }
                    return;
                }

                const data = await response.json();
                const parsedSession = respondentSessionSchema.parse(data);
                setSession(parsedSession);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, [viewKey]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-gray-600">Loading results...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to load results</h2>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-gray-600">No data available</p>
            </div>
        );
    }

    const definition = quizDefinitionSchema.parse(session.snapshot.definition);
    const scoreSummary = computeRespondentScores(definition, session.answers);

    return (
        <div className="bg-white">
            {/* Banner indicating this is a shared read-only snapshot */}
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 text-center">
                <p className="text-sm text-blue-800">
                    📖 This is a shared read-only snapshot of quiz results
                </p>
            </div>

            {/* Results displayed in read-only mode */}
            <div style={{ margin: '0 auto', maxWidth: 980, padding: '2rem' }}>
                <QuizResultsScreen
                    completionMarkdown={definition.display_config.completion_markdown}
                    eyebrow="Shared Results"
                    scaleMax={definition.display_config.result_scale_max ?? 1}
                    scaleMin={definition.display_config.result_scale_min ?? -1}
                    scores={scoreSummary.scores}
                    selectedArchetype={scoreSummary.selectedArchetype}
                    subtitle="These results were shared with you"
                    title={definition.title}
                    traits={definition.traits}
                    traitStats={scoreSummary.traitStats}
                    traitPolarity={definition.display_config.trait_polarity}
                />
            </div>
        </div>
    );
}
