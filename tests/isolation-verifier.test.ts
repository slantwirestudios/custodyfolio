import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/verify-two-user-isolation.mjs", "utf8")
  .replace(/^import .*;\n/gm, "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runVerifier(cleanupFails = false) {
  const users: string[] = [];
  const deleted: string[] = [];
  const datasets = new Map<string, { dataset: any; updatedAt: string }>();
  const output: string[] = [];
  let evidence = "";
  const client = {
    auth: { admin: {
      createUser: async () => { const id = `user-${users.length}`; users.push(id); return { data: { user: { id } } }; },
      generateLink: async () => ({ data: { properties: { email_otp: "123456" } } }),
      deleteUser: async (id: string) => { deleted.push(id); return { error: cleanupFails ? new Error("cleanup") : null }; },
    } },
    from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }),
    storage: { from: () => ({
      upload: async (_: string, data: Buffer) => { evidence = data.toString(); return {}; },
      remove: async () => ({}),
    }) },
  };
  let login = 0;
  const mockFetch = async (url: string, init: any = {}) => {
    const path = new URL(url).pathname;
    const user = init.headers?.Cookie?.split("=")[1];
    const body = init.body ? JSON.parse(init.body) : {};
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (path === "/api/records/auth/email-code/verify") {
      expect(body).toMatchObject({ code: "123456", legalAccepted: true, workspace: "records" });
      const id = users[login++];
      return new Response(JSON.stringify({ session: { userId: id } }), { headers: { "set-cookie": `__Host-l2f-records-access=${id}; Secure` } });
    }
    if (path === "/api/records/auth/csrf") return json({ token: "csrf" });
    if (path === "/api/records/dataset") {
      if (init.method === "PUT") {
        expect(init.headers["x-l2f-csrf"]).toBe("csrf");
        expect(body.expectedUpdatedAt).toBe(datasets.get(user)?.updatedAt ?? null);
        datasets.set(user, { dataset: body.dataset, updatedAt: randomUUID() });
        return json({});
      }
      return json(datasets.get(user) ?? { dataset: null, updatedAt: null });
    }
    if (path.startsWith("/api/records/evidence/")) {
      expect(init.headers["x-l2f-csrf"]).toBe("csrf");
      if (body.evidence.userId !== user) return json({}, 403);
      return path.endsWith("download") ? new Response(evidence) : json({});
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  const fakeProcess = { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test", RECORDS_APP_BASE_URL: "https://example.test", RECORDS_EVIDENCE_BUCKET: "test" }, exitCode: 0 };
  await new AsyncFunction("createHash", "randomUUID", "createClient", "fetch", "process", "console", source)(
    createHash, randomUUID, () => client, mockFetch, fakeProcess,
    { log: (s: string) => output.push(s), error: (s: string) => output.push(s) },
  );
  return { output, deleted, users, exitCode: fakeProcess.exitCode };
}

describe("production isolation verifier", () => {
  it("uses email codes, checks isolation, handles dataset versions, and removes synthetic users", async () => {
    const result = await runVerifier();
    expect(result.exitCode).toBe(0);
    expect(result.deleted).toEqual(result.users);
    expect(result.output.join("\n")).toContain("TWO_USER_ISOLATION_TESTED_AT=");
  });
  it("does not issue fresh evidence when cleanup fails", async () => {
    const result = await runVerifier(true);
    expect(result.exitCode).toBe(1);
    expect(result.deleted).toEqual(result.users);
    expect(result.output.join("\n")).not.toContain("TWO_USER_ISOLATION_TESTED_AT=");
  });
});
