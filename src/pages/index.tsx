import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
    return (
        <div style={{ margin: '0 auto', maxWidth: 960, padding: '4rem 1.5rem' }}>
            <h1>Welcome to MrKwiz!</h1>
            <p>Your anonymous quiz app for measuring relationship/play-style traits.</p>
            <p>
                Use <code>npm run create:admin-quiz -- --title "My Quiz"</code> to provision a new admin quiz
                and receive a builder URL.
            </p>
            <p>
                The admin editor route shape is <code>/admin/:adminKey/edit</code>.
            </p>
            <p>
                For now, you can also open the editor shell directly at{' '}
                <Link to="/admin/demo/edit">/admin/demo/edit</Link>.
            </p>
        </div>
    );
};

export default Home;