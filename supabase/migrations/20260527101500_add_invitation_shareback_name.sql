alter table public.quiz_invitations
add column shareback_name text not null default '';

update public.quiz_invitations
set shareback_name = coalesce(nullif(btrim(label), ''), 'quiz owner')
where result_sharing_mode <> 'off'
  and btrim(shareback_name) = '';

alter table public.quiz_invitations
add constraint quiz_invitations_shareback_name_required
check (
  result_sharing_mode = 'off'
  or char_length(btrim(shareback_name)) > 0
);
