import { NextRequest, NextResponse } from "next/server";
import { attachRefreshedRecordsSession, getRecordsAuthContext, isSupabaseRecordsMode } from "@/lib/records/authServer";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const promptKey = "first_record_ease_v1";
const table = "custody_folio_customer_poll_answers";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(request: NextRequest, write: boolean) {
  if (!isSupabaseRecordsMode() || process.env.CUSTOMER_FEEDBACK_INVITE_ENABLED !== "true") {
    return json({ error: "Product feedback is unavailable." }, 501);
  }
  if (write && !verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const limit = checkRateLimit(request, {
    id: write ? "records-poll-write" : "records-poll-read",
    limit: write ? 10 : 60,
    windowMs: 60 * 60 * 1000,
  });
  if (limit.limited) return rateLimitExceededResponse(limit);
  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  if (write) {
    const body = await request.json().catch(() => null);
    if (body?.choice !== "yes" && body?.choice !== "no") {
      return json({ error: "Choose Yes or No." }, 400);
    }
    // A retry or double click must not create another vote or replace the first.
    const saved = await context.supabase.from(table).upsert({
      user_id: context.userId,
      prompt_key: promptKey,
      answer: body.choice,
    }, { onConflict: "user_id,prompt_key", ignoreDuplicates: true });
    if (saved.error) return json({ error: "Your answer wasn’t saved. Please try again." }, 503);
  }
  const result = await context.supabase.from(table).select("answer")
    .eq("user_id", context.userId).eq("prompt_key", promptKey).maybeSingle();
  if (result.error || (write && !result.data)) {
    return json({ error: "Unable to confirm your answer. Please try again." }, 503);
  }
  return attachRefreshedRecordsSession(request, json({
    eligible: !result.data,
    choice: result.data?.answer ?? null,
    ...(write ? { ok: true } : {}),
  }), context);
}

export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
