create table public.quiz_mcp_tokens (
	id uuid primary key default gen_random_uuid(),
	quiz_id uuid not null references public.quizzes(id),
	token_digest text not null unique,
	label text not null default '',
	notes text not null default '',
	callback_url text,
	callback_origin text,
	expires_at timestamptz,
	last_used_at timestamptz,
	revoked_at timestamptz,
	deleted_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint quiz_mcp_tokens_token_digest_hex_length check (char_length(token_digest) = 64)
);

create index quiz_mcp_tokens_quiz_id_idx
	on public.quiz_mcp_tokens (quiz_id);

create index quiz_mcp_tokens_usable_idx
	on public.quiz_mcp_tokens (token_digest, revoked_at, deleted_at, expires_at);

create trigger quiz_mcp_tokens_set_updated_at
before update on public.quiz_mcp_tokens
for each row
execute function public.set_updated_at();
