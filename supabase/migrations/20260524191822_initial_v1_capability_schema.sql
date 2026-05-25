create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

create table public.quizzes (
	id uuid primary key default gen_random_uuid(),
	admin_key_digest text not null unique,
	title text not null,
	description text not null default '',
	current_definition jsonb not null,
	current_definition_version integer not null default 1,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	deleted_at timestamptz,
	constraint quizzes_admin_key_digest_hex_length check (char_length(admin_key_digest) = 64),
	constraint quizzes_definition_version_positive check (current_definition_version > 0)
);

create table public.quiz_definition_snapshots (
	id uuid primary key default gen_random_uuid(),
	quiz_id uuid not null references public.quizzes(id),
	definition_version integer not null,
	definition jsonb not null,
	created_at timestamptz not null default now(),
	constraint quiz_definition_snapshots_quiz_version_unique unique (quiz_id, definition_version),
	constraint quiz_definition_snapshots_definition_version_positive check (definition_version > 0)
);

create table public.quiz_invitations (
	id uuid primary key default gen_random_uuid(),
	quiz_id uuid not null references public.quizzes(id),
	invitation_key text not null unique,
	label text not null default '',
	description text not null default '',
	max_uses integer,
	use_count integer not null default 0,
	expires_at timestamptz,
	revoked_at timestamptz,
	deleted_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint quiz_invitations_max_uses_positive check (max_uses is null or max_uses > 0),
	constraint quiz_invitations_use_count_non_negative check (use_count >= 0)
);

create table public.quiz_responses (
	id uuid primary key default gen_random_uuid(),
	response_key_digest text not null unique,
	quiz_id uuid not null references public.quizzes(id),
	snapshot_id uuid not null references public.quiz_definition_snapshots(id),
	invitation_id uuid references public.quiz_invitations(id),
	respondent_label text not null default '',
	state text not null default 'started',
	current_question_id text,
	started_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	submitted_at timestamptz,
	revoked_at timestamptz,
	deleted_at timestamptz,
	constraint quiz_responses_response_key_digest_hex_length check (char_length(response_key_digest) = 64),
	constraint quiz_responses_state_valid check (state in ('started', 'submitted', 'abandoned', 'revoked'))
);

create table public.quiz_response_answers (
	id uuid primary key default gen_random_uuid(),
	response_id uuid not null references public.quiz_responses(id),
	question_id text not null,
	answer_id text,
	answer_value jsonb,
	answered_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	revision integer not null default 1,
	deleted_at timestamptz,
	constraint quiz_response_answers_response_question_unique unique (response_id, question_id),
	constraint quiz_response_answers_revision_positive check (revision > 0)
);

create table public.quiz_response_view_keys (
	id uuid primary key default gen_random_uuid(),
	response_id uuid not null references public.quiz_responses(id),
	view_key text not null unique,
	label text not null default '',
	notes text not null default '',
	expires_at timestamptz,
	last_viewed_at timestamptz,
	revoked_at timestamptz,
	deleted_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index quiz_definition_snapshots_quiz_id_idx
	on public.quiz_definition_snapshots (quiz_id);

create index quiz_invitations_quiz_id_idx
	on public.quiz_invitations (quiz_id);

create index quiz_invitations_usable_idx
	on public.quiz_invitations (quiz_id, revoked_at, deleted_at, expires_at);

create index quiz_responses_quiz_id_idx
	on public.quiz_responses (quiz_id);

create index quiz_responses_snapshot_id_idx
	on public.quiz_responses (snapshot_id);

create index quiz_responses_invitation_id_idx
	on public.quiz_responses (invitation_id);

create index quiz_response_answers_response_id_idx
	on public.quiz_response_answers (response_id);

create index quiz_response_view_keys_response_id_idx
	on public.quiz_response_view_keys (response_id);

create trigger quizzes_set_updated_at
before update on public.quizzes
for each row
execute function public.set_updated_at();

create trigger quiz_invitations_set_updated_at
before update on public.quiz_invitations
for each row
execute function public.set_updated_at();

create trigger quiz_responses_set_updated_at
before update on public.quiz_responses
for each row
execute function public.set_updated_at();

create trigger quiz_response_answers_set_updated_at
before update on public.quiz_response_answers
for each row
execute function public.set_updated_at();

create trigger quiz_response_view_keys_set_updated_at
before update on public.quiz_response_view_keys
for each row
execute function public.set_updated_at();
