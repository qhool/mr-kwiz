-- Add result_sharing_mode enum to quiz_invitations
create type public.result_sharing_mode as enum ('off', 'opt_in', 'opt_out', 'mandatory');

-- Add result_sharing_mode column to quiz_invitations
alter table public.quiz_invitations
add column result_sharing_mode public.result_sharing_mode not null default 'off';

-- Add nullable invitation_id to quiz_response_view_keys
alter table public.quiz_response_view_keys
add column invitation_id uuid references public.quiz_invitations(id);

-- Add index for invitation_id lookups in quiz_response_view_keys
create index quiz_response_view_keys_invitation_id_idx
	on public.quiz_response_view_keys (invitation_id);

-- Remove invitation_id from quiz_responses (drop foreign key, any dependent indexes, then column)
alter table public.quiz_responses
drop constraint if exists quiz_responses_invitation_id_fkey;

drop index if exists public.quiz_responses_invitation_id_idx;

alter table public.quiz_responses
drop column if exists invitation_id;
