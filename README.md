# MrKwiz

MrKwiz is a small anonymous quiz application designed to measure relationship and play-style traits. This project utilizes Vite for the frontend build tool, React for the user interface, and TypeScript for type safety. The backend is powered by Cloudflare Pages Functions, which handle API requests, and Supabase is used for data storage.

## Project Structure

```
MrKwiz
├── functions
│   ├── api
│   │   └── quiz.ts
│   └── types.ts
├── src
│   ├── components
│   │   └── index.ts
│   ├── lib
│   │   └── supabase.ts
│   ├── pages
│   │   └── index.tsx
│   ├── types
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── supabase
│   └── migrations
│       └── README.md
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── wrangler.toml
├── README.md
└── PROJECT_PLAN.md
```

## Features

- **Anonymous Quizzes**: Users can take quizzes without needing to create an account.
- **Trait Measurement**: The quizzes are designed to measure various relationship and play-style traits.
- **Responsive Design**: The application is built to be responsive and user-friendly across devices.
- **Real-time Data**: Leveraging Supabase for real-time data storage and retrieval.

## Setup Instructions

1. **Clone the Repository**: 
   ```bash
   git clone <repository-url>
   cd MrKwiz
   ```

2. **Install Dependencies**: 
   ```bash
   npm install
   ```

3. **Start the local Supabase stack**:
   ```bash
   npm run supabase:start
   ```

   This uses the committed Supabase CLI config in `supabase/config.toml` and brings up:
   - Project URL: `http://127.0.0.1:54321`
   - REST API: `http://127.0.0.1:54321/rest/v1`
   - Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
   - Studio: `http://127.0.0.1:54323`

4. **Create local Cloudflare function vars**:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Fill in:
   - `SUPABASE_URL` with the local project URL, usually `http://127.0.0.1:54321`
   - `SUPABASE_SERVICE_ROLE_KEY` with the local secret key shown by `npm run supabase:status`
   - `APP_TOKEN_SECRET` with a local-only secret for HMAC/token work

5. **Inspect or stop the local stack when needed**:
   ```bash
   npm run supabase:status
   npm run supabase:stop
   ```

6. **Apply local database changes**:
   ```bash
   npm run supabase:db:push
   npm run supabase:db:reset
   npm run supabase:migration:new -- create_initial_schema
   npm run supabase:types
   ```

6.1 **Run tests with automatic local DB backup/restore**:
   ```bash
   npm run test:db:safe
   ```

   This script:
   - uses the Supabase local Postgres container binaries for dump/restore (not your system `pg_dump`),
   - creates a backup of your current local Supabase DB,
   - runs `supabase db reset` for a clean test state,
   - runs tests,
   - restores your original local DB snapshot after tests (even on failure).

   Keep the backup dump after restore if needed:
   ```bash
   npm run test:db:safe:keep-backup
   ```

7. **Run the Development Server**: 
   ```bash
   npm run dev
   ```

8. **Deploy to Cloudflare**: 
   Follow the instructions in `wrangler.toml` to deploy your functions to Cloudflare.

## Local Supabase

The project now uses the local `supabase` CLI from `devDependencies`, so you do not need a global install. A Docker-compatible container runtime is required for `npm run supabase:start`.

Committed local Supabase files:

- `supabase/config.toml`: local stack configuration
- `supabase/seed.sql`: optional seed file loaded by `supabase db reset`
- `supabase/migrations/`: SQL migrations only

## Usage

- Navigate to the homepage to start taking quizzes.
- Admins can manage quizzes through the API endpoints defined in `functions/api/quiz.ts`.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.