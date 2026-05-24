import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Quiz, QuizResponse } from '../types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
    const { httpMethod, body } = event;

    switch (httpMethod) {
        case 'GET':
            return await getQuizzes();
        case 'POST':
            return await createQuiz(body);
        case 'PUT':
            return await updateQuiz(body);
        case 'DELETE':
            return await deleteQuiz(body);
        default:
            return {
                statusCode: 405,
                body: JSON.stringify({ message: 'Method Not Allowed' }),
            };
    }
};

const getQuizzes = async () => {
    const { data, error } = await supabase.from<Quiz>('quizzes').select('*');
    if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    return {
        statusCode: 200,
        body: JSON.stringify(data),
    };
};

const createQuiz = async (body: string) => {
    const quiz: Quiz = JSON.parse(body);
    const { data, error } = await supabase.from<Quiz>('quizzes').insert([quiz]);
    if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    return {
        statusCode: 201,
        body: JSON.stringify(data),
    };
};

const updateQuiz = async (body: string) => {
    const quiz: Quiz = JSON.parse(body);
    const { data, error } = await supabase.from<Quiz>('quizzes').update(quiz).eq('id', quiz.id);
    if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    return {
        statusCode: 200,
        body: JSON.stringify(data),
    };
};

const deleteQuiz = async (body: string) => {
    const { id } = JSON.parse(body);
    const { data, error } = await supabase.from<Quiz>('quizzes').delete().eq('id', id);
    if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    return {
        statusCode: 204,
        body: JSON.stringify(data),
    };
};