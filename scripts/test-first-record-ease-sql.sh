#!/usr/bin/env bash
set -Eeuo pipefail
root=$(mktemp -d /private/tmp/custodyfolio-poll-test.XXXXXX)
cleanup() {
  pg_ctl -D "$root/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$root"
}
trap cleanup EXIT
mkdir "$root/socket"
initdb -D "$root/db" --auth-local=trust --auth-host=reject --encoding=UTF8 --no-locale >/dev/null
pg_ctl -D "$root/db" -o "-F -h '' -k $root/socket" -w start >/dev/null
sql() { psql -X -v ON_ERROR_STOP=1 -h "$root/socket" -d postgres "$@"; }
sql >/dev/null <<'SQL'
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
SQL
sql -f supabase/migrations/20260907004023_add_customer_feedback_poll.sql >/dev/null
sql -f supabase/migrations/20260907171522_add_first_record_ease_report.sql >/dev/null
sql >/dev/null <<'SQL'
insert into auth.users select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,7) n;
insert into public.custody_folio_customer_poll_answers
select id, 'first_record_ease_v1', case when right(id::text,1) = '5' then 'no' else 'yes' end,
case when right(id::text,1) = '7' then '2026-10-01'::timestamptz else '2026-09-01'::timestamptz end
from auth.users;
set role service_role;
do $$
declare r jsonb;
begin
 r := public.custody_folio_first_record_ease_report('2026-09-01','2026-10-01',array['00000000-0000-4000-8000-000000000006']::uuid[]);
 assert (r->>'responses')::int = 5, 'Exclusion and half-open window';
 assert (r->>'yes')::int = 4 and (r->>'no')::int = 1, 'Answer totals';
 assert (r->>'easy_among_respondents_percent')::numeric = 80, 'Percentage';
 r := public.custody_folio_first_record_ease_report('2026-09-01','2026-10-01',array['00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000005']::uuid[]);
 assert (r->>'responses')::int = 4 and (r->>'answers_suppressed')::boolean, 'Small-group suppression';
 assert r->>'yes' is null and r->>'no' is null and r->>'easy_among_respondents_percent' is null, 'No small-group answers';
 r := public.custody_folio_first_record_ease_report('2026-11-01','2026-12-01');
 assert (r->>'responses')::int = 0 and r->>'easy_among_respondents_percent' is null, 'No answers is unknown ease';
end $$;
SQL
for role in anon authenticated; do
  if sql -c "set role $role; select public.custody_folio_first_record_ease_report('2026-09-01','2026-10-01');" >/dev/null 2>&1; then
    echo "$role unexpectedly read poll aggregates" >&2; exit 1
  fi
done
for args in "'2026-09-01','2026-09-01'" "'2026-10-01','2026-09-01'" "'2026-09-01','2026-10-01',array[null]::uuid[]"; do
  if sql -c "select public.custody_folio_first_record_ease_report($args);" >/dev/null 2>&1; then
    echo "Invalid report inputs accepted" >&2; exit 1
  fi
done
echo 'Poll SQL tests passed: permissions, exclusions, dates, arithmetic, suppression, and invalid inputs.'
