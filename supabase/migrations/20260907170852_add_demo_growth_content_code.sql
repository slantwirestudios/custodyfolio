-- Classify demo visits and signup selections using the existing event taxonomy.
-- Preserve every existing content code; no new visitor fields or permissions.
alter table public.custody_folio_growth_events
  drop constraint custody_folio_growth_events_content_code_check,
  add constraint custody_folio_growth_events_content_code_check check (
    content_code is null or content_code in (
      'homepage',
      'header_desktop',
      'header_mobile',
      'hero',
      'quick_add_record',
      'quick_review_timeline',
      'quick_prepare_or_share',
      'pricing',
      'factual_checklist',
      'in_product_feedback',
      'subscription',
      'product_demo'
    )
  );
