export type Quiz = {
    id: string;
    title: string;
    description: string;
    questions: Question[];
};

export type Question = {
    id: string;
    text: string;
    options: Option[];
};

export type Option = {
    id: string;
    text: string;
    value: number;
};

export type QuizResponse = {
    quizId: string;
    answers: Answer[];
};

export type Answer = {
    questionId: string;
    selectedOptionId: string;
};