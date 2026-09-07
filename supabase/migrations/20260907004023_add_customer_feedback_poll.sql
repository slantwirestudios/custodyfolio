-- Poll answers are product feedback, never permission to contact a customer.
create table public.custody_folio_customer_poll_answers (
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null check (prompt_key = 'first_record_ease_v1'),
  answer text not null check (answer in ('yes', 'no')),
  created_at timestamptz not null default now(),
  primary key (user_id, prompt_key)
);
alter table public.custody_folio_customer_poll_answers enable row level security;
alter table public.custody_folio_customer_poll_answers force row level security;
revoke all on public.custody_folio_customer_poll_answers from public, anon, authenticated;
grant select, insert, delete on public.custody_folio_customer_poll_answers to service_role;
comment on table public.custody_folio_customer_poll_answers is
  'First-record ease poll; one answer per account. Not contact consent. Deleted with account.';
