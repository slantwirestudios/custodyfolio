import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
const { getRecordsAuthContext, from, upsert, maybeSingle } = vi.hoisted(() => ({
  getRecordsAuthContext: vi.fn(), from: vi.fn(), upsert: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (_: unknown, response: Response) => response,
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
}));
import { GET, POST } from "@/app/api/records/customer-poll/route";
function request(choice: unknown, csrf = true) {
  const token = "poll-csrf-token";
  return new NextRequest("https://custodyfolio.com/api/records/customer-poll", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(csrf ? {
      Origin: "https://custodyfolio.com", Cookie: `${recordsCsrfCookieName}=${token}`, "X-L2F-CSRF": token,
    } : {}) },
    body: JSON.stringify({ choice, user_id: "spoofed" }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CUSTOMER_FEEDBACK_INVITE_ENABLED", "true");
  resetRateLimitStore();
  const query = { select: () => query, eq: vi.fn(() => query), maybeSingle, upsert };
  from.mockReturnValue(query);
  getRecordsAuthContext.mockResolvedValue({ userId: "actual-user", supabase: { from } });
  upsert.mockResolvedValue({ error: null });
  maybeSingle.mockResolvedValue({ data: { answer: "yes" }, error: null });
});
describe("one-click customer poll", () => {
  it.each(["yes", "no"])("saves %s against the authenticated account with duplicate protection", async choice => {
    maybeSingle.mockResolvedValue({ data: { answer: choice }, error: null });
    const response = await POST(request(choice));
    expect(response?.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ user_id: "actual-user", prompt_key: "first_record_ease_v1", answer: choice }, { onConflict: "user_id,prompt_key", ignoreDuplicates: true });
    expect(from).toHaveBeenCalledWith("custody_folio_customer_poll_answers");
  });
  it("rejects contact consent and arbitrary free text", async () => {
    expect((await POST(request("opted_in")))?.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("requires CSRF protection", async () => {
    expect((await POST(request("yes", false)))?.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("does not report success when saving fails", async () => {
    upsert.mockResolvedValue({ error: { message: "unavailable" } });
    expect((await POST(request("no")))?.status).toBe(503);
  });
  it("hides the poll after a saved answer", async () => {
    const response = await GET(new NextRequest("https://custodyfolio.com/api/records/customer-poll"));
    expect(await response?.json()).toEqual({ eligible: false, choice: "yes" });
  });
  it("returns the original answer on a retried conflicting vote", async () => {
    const response = await POST(request("no"));
    expect((await response?.json()).choice).toBe("yes");
  });
  it("requires authentication", async () => {
    getRecordsAuthContext.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    expect((await POST(request("yes")))?.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });
});
