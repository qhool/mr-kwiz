// This file defines TypeScript types used in the frontend application, ensuring type safety for the data structures being used.

export interface Quiz {
    id: string;
    title: string;
    description: string;
    questions: Question[];
}

export interface Question {
    id: string;
    text: string;
    options: Option[];
}

export interface Option {
    id: string;
    text: string;
    isCorrect: boolean;
}

export interface UserResponse {
    quizId: string;
    questionId: string;
    selectedOptionId: string;
}

export interface QuizResult {
    quizId: string;
    userId: string;
    score: number;
    responses: UserResponse[];
}