import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RECORDS_APP_BASE_URL",
  "RECORDS_EVIDENCE_BUCKET",
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const appBaseUrl = (process.env.RECORDS_APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const trustedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || appBaseUrl).origin;
const trustedJsonHeaders = {
  "Content-Type": "application/json",
  Origin: trustedOrigin,
  "Sec-Fetch-Site": "same-origin",
};
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const runId = randomUUID();
const emailDomain = process.env.RECORDS_ISOLATION_EMAIL_DOMAIN || "example.test";
if (!emailDomain.endsWith(".test") && !emailDomain.endsWith(".invalid")) {
  throw new Error("Isolation checks require a reserved .test or .invalid email domain.");
}
const userAEmail = `l2f-isolation-a-${runId}@${emailDomain}`;
const userBEmail = `l2f-isolation-b-${runId}@${emailDomain}`;
const caseKey = `isolation-${runId}`;
const caseId = `case-${runId}`;
const evidenceId = `evidence-${runId}`;
const evidenceContent = `Custody Folio synthetic isolation evidence ${runId}\n`;
const storageBucket = process.env.RECORDS_EVIDENCE_BUCKET;

let userAId = "";
let userBId = "";
let storagePath = "";
let userACookies = "";
let userBCookies = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieHeader(response) {
  const headers = response.headers;
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")?.split(/,(?=[^;,]+=)/g) || [];

  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function createTestUser(email) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      purpose: "custody-folio-two-user-isolation-test",
      run_id: runId,
    },
  });

  if (error || !data.user?.id) {
    throw new Error(`Unable to create synthetic isolation user: ${error?.message || "missing user id"}`);
  }

  return data.user.id;
}

const csrfByCookies = new Map();

async function login(email) {
  const generated = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  const code = generated.data?.properties?.email_otp;
  assert(!generated.error && /^\d{6}$/.test(code || ""), "Unable to generate synthetic email code.");
  const response = await fetch(`${appBaseUrl}/api/records/auth/email-code/verify`, {
    method: "POST",
    headers: trustedJsonHeaders,
    body: JSON.stringify({ email, code, adultConfirmed: true, legalAccepted: true, workspace: "records" }),
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok && body.session?.userId, `Email-code login failed with ${response.status}.`);
  const cookies = cookieHeader(response);
  assert(cookies.includes("l2f-records-access"), "Email-code login did not set an access cookie.");
  const csrfResponse = await fetch(`${appBaseUrl}/api/records/auth/csrf`, { headers: { Cookie: cookies } });
  const csrfBody = await csrfResponse.json();
  assert(csrfResponse.ok && csrfBody.token, "Unable to obtain synthetic session CSRF token.");
  csrfByCookies.set(cookies, csrfBody.token);
  return { cookies, userId: body.session.userId };
}

function syntheticDataset(ownerUserId, evidenceItems = []) {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: `profile-${ownerUserId}`,
        userId: ownerUserId,
        email: "synthetic-isolation@example.invalid",
        displayName: "Synthetic Isolation User",
        timezone: "UTC",
        createdAt: now,
        updatedAt: now,
      },
    ],
    matters: [
      {
        id: caseId,
        userId: ownerUserId,
        caseName: "Synthetic isolation case",
        childDisplayLabels: [],
        userRoleLabel: "Parent A",
        otherParentLabel: "Parent B",
        timezone: "UTC",
        createdAt: now,
        updatedAt: now,
      },
    ],
    exchangeRules: [],
    scheduleExceptions: [],
    custodyDayAssignments: [],
    exchangeLogs: [],
    dateNotes: [],
    evidenceItems,
    childSupportOrders: [],
    childSupportPayments: [],
    expenseItems: [],
    timelineDesignations: [],
    auditLogs: [],
  };
}

async function saveDataset(cookies, ownerUserId, evidenceItems = []) {
  const currentResponse = await fetch(`${appBaseUrl}/api/records/dataset?caseId=${encodeURIComponent(caseKey)}`, {
    headers: { Cookie: cookies, "x-custody-folio-account": ownerUserId },
  });
  assert(currentResponse.ok, `Unable to read dataset version: ${currentResponse.status}.`);
  const current = await currentResponse.json();
  const response = await fetch(`${appBaseUrl}/api/records/dataset?caseId=${encodeURIComponent(caseKey)}`, {
    method: "PUT",
    headers: {
      ...trustedJsonHeaders,
      Cookie: cookies,
      "x-l2f-csrf": csrfByCookies.get(cookies),
      "x-custody-folio-account": ownerUserId,
    },
    body: JSON.stringify({ dataset: syntheticDataset(ownerUserId, evidenceItems), expectedUpdatedAt: current.updatedAt }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Dataset save failed with ${response.status}: ${body.error || "unknown error"}`);
  }
}

async function loadDataset(cookies, ownerUserId) {
  const response = await fetch(`${appBaseUrl}/api/records/dataset?caseId=${encodeURIComponent(caseKey)}`, {
    headers: {
      Cookie: cookies,
      "x-l2f-csrf": csrfByCookies.get(cookies),
      "x-custody-folio-account": ownerUserId,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Dataset load failed with ${response.status}: ${body.error || "unknown error"}`);
  }

  return body.dataset || null;
}

function safePathSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 160);
}

async function createSyntheticEvidenceObject() {
  storagePath = [
    safePathSegment(userAId),
    safePathSegment(caseId),
    safePathSegment(evidenceId),
    `${safePathSegment(evidenceId)}.txt`,
  ].join("/");

  const { error } = await supabase.storage.from(storageBucket).upload(
    storagePath,
    Buffer.from(evidenceContent, "utf8"),
    {
      contentType: "text/plain",
      upsert: false,
    }
  );

  if (error) throw new Error(`Synthetic evidence object upload failed: ${error.message}`);
}

function evidenceMetadata(ownerUserId) {
  const now = new Date().toISOString();
  const size = Buffer.byteLength(evidenceContent);
  return {
    id: evidenceId,
    caseId,
    userId: ownerUserId,
    originalFileName: "synthetic-isolation-evidence.txt",
    storedFileName: `${evidenceId}.txt`,
    fileType: "text/plain",
    fileSize: size,
    storageBucket,
    storagePath,
    storageUploadedAt: now,
    storageSha256: createHash("sha256").update(evidenceContent).digest("hex"),
    uploadedAt: now,
    tags: [],
    includeInReports: false,
    malwareScanStatus: "clean",
    createdAt: now,
    updatedAt: now,
  };
}

async function evidenceDownload(cookies, metadata) {
  return fetch(`${appBaseUrl}/api/records/evidence/download`, {
    method: "POST",
    headers: {
      ...trustedJsonHeaders,
      Cookie: cookies,
      "x-l2f-csrf": csrfByCookies.get(cookies),
    },
    body: JSON.stringify({ evidence: metadata }),
  });
}

async function evidenceDelete(cookies, metadata) {
  return fetch(`${appBaseUrl}/api/records/evidence/delete`, {
    method: "POST",
    headers: {
      ...trustedJsonHeaders,
      Cookie: cookies,
      "x-l2f-csrf": csrfByCookies.get(cookies),
    },
    body: JSON.stringify({ evidence: metadata }),
  });
}

async function cleanup() {
  const errors = [];
  async function remove(label, operation) {
    try {
      const result = await operation();
      if (result.error) throw result.error;
    } catch {
      errors.push(label);
    }
  }
  if (storagePath) {
    await remove("synthetic evidence", () => supabase.storage.from(storageBucket).remove([storagePath]));
  }
  for (const userId of [userAId, userBId].filter(Boolean)) {
    for (const table of ["records_case_snapshots", "custody_folio_billing_accounts", "records_profiles"]) {
      await remove(table, () => supabase.from(table).delete().eq("user_id", userId));
    }
    await remove("synthetic auth user", () => supabase.auth.admin.deleteUser(userId));
  }
  assert(errors.length === 0, `Synthetic cleanup failed: ${errors.join(", ")}. Run ID: ${runId}`);
}

try {
  userAId = await createTestUser(userAEmail);
  userBId = await createTestUser(userBEmail);
  const userALogin = await login(userAEmail);
  const userBLogin = await login(userBEmail);
  userACookies = userALogin.cookies;
  userBCookies = userBLogin.cookies;
  userAId = userAId || userALogin.userId;
  userBId = userBId || userBLogin.userId;

  await saveDataset(userACookies, userAId);
  const userADataset = await loadDataset(userACookies, userAId);
  const userBDataset = await loadDataset(userBCookies, userBId);

  assert(userADataset?.users?.[0]?.userId === userAId, "User A could not read their own dataset.");
  assert(userBDataset === null, "User B unexpectedly loaded User A's dataset.");

  await createSyntheticEvidenceObject();
  const uploadedEvidence = evidenceMetadata(userAId);
  const userAEvidence = {
    ...evidenceMetadata(userAId),
    ...uploadedEvidence,
    id: evidenceId,
    caseId,
    userId: userAId,
    malwareScanStatus: "clean",
  };
  await saveDataset(userACookies, userAId, [userAEvidence]);
  const copiedEvidence = userAEvidence;

  const userBDownload = await evidenceDownload(userBCookies, copiedEvidence);
  assert(
    [403, 404].includes(userBDownload.status),
    `User B evidence download should be denied, got ${userBDownload.status}.`
  );

  const userBDelete = await evidenceDelete(userBCookies, copiedEvidence);
  assert(
    [403, 404].includes(userBDelete.status),
    `User B evidence delete should be denied, got ${userBDelete.status}.`
  );

  const userADownload = await evidenceDownload(userACookies, userAEvidence);
  assert(userADownload.ok, `User A evidence download failed with ${userADownload.status}.`);
  const downloaded = await userADownload.text();
  assert(downloaded === evidenceContent, "User A downloaded evidence content did not match.");

  const userADelete = await evidenceDelete(userACookies, userAEvidence);
  assert(userADelete.ok, `User A evidence delete failed with ${userADelete.status}.`);
  await saveDataset(userACookies, userAId);
  storagePath = "";

} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
if (!process.exitCode) {
  console.log("Two-user isolation verification passed; synthetic data cleaned up.");
  console.log(`TWO_USER_ISOLATION_TESTED_AT=${new Date().toISOString().slice(0, 10)}`);
}
