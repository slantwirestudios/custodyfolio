create function public.custody_folio_first_record_ease_report(
  p_from timestamptz,
  p_to timestamptz,
  p_excluded_user_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  responses bigint;
  positive bigint;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'Invalid reporting window';
  end if;
  if p_excluded_user_ids is null or cardinality(p_excluded_user_ids) > 100
     or array_position(p_excluded_user_ids, null) is not null then
    raise exception 'Invalid exclusion list';
  end if;
  select count(*), count(*) filter (where answer = 'yes')
    into responses, positive
    from public.custody_folio_customer_poll_answers
    where prompt_key = 'first_record_ease_v1'
      and created_at >= p_from and created_at < p_to
      and not (user_id = any(p_excluded_user_ids));
  return jsonb_build_object(
    'schema_version', 1,
    'prompt_key', 'first_record_ease_v1',
    'window', jsonb_build_object('from', p_from, 'to', p_to),
    'scope', 'all_non_excluded_respondents_by_response_time',
    'minimum_respondents_for_answers', 5,
    'responses', responses,
    'answers_suppressed', responses < 5,
    'yes', case when responses >= 5 then positive else null end,
    'no', case when responses >= 5 then responses - positive else null end,
    'easy_among_respondents_percent', case when responses >= 5 then round(100.0 * positive / responses, 2) else null end,
    'response_rate_percent', null,
    'contact_permission', 'not_collected_by_this_poll'
  );
end;
$$;
revoke all on function public.custody_folio_first_record_ease_report(timestamptz,timestamptz,uuid[]) from public, anon, authenticated;
grant execute on function public.custody_folio_first_record_ease_report(timestamptz,timestamptz,uuid[]) to service_role;
