import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyRecordsDatasetForUser } from "@/lib/records/seed";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { buildReportPreview } from "@/lib/records/reports";
import { generatePrintableReportPdf, printableReportPacket } from "@/lib/records/reportPdf";

const userId = "fictional-first-record-parent";
const caseId = defaultCaseIdForUser(userId);
const range = { from: "2026-09-07", to: "2026-09-07" };
const body = "FICTIONAL EXAMPLE. Pickup was scheduled for 6:00 p.m. Parent B arrived at 6:00 p.m., on time. The blue backpack was handed over.";

async function artifact(name: string, bytes: Uint8Array) {
  const directory = process.env.RECORDS_PDF_ARTIFACT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), bytes);
}

describe("first record export from a fresh account dataset", () => {
  it("starts without fabricated custody or financial records", () => {
    const dataset = createEmptyRecordsDatasetForUser(userId, "fictional@example.test");
    const preview = buildReportPreview(dataset, userId, caseId, range, "full_profile");
    expect(dataset.dateNotes).toHaveLength(0);
    expect(dataset.exchangeLogs).toHaveLength(0);
    expect(dataset.childSupportOrders).toHaveLength(0);
    expect(preview.tables.every((table) => table.rows.length === 0)).toBe(true);
  });

  it.each([
    ["first-record-fictional.pdf", body],
    ["long-record-fictional.pdf", body + " " + Array(160).fill("Fictional continuation: the scheduled handoff happened as planned and belongings were checked.").join(" ") + " END OF FICTIONAL LONG NOTE."],
  ])("exports %s without seeded examples or unrelated account data", async (filename, noteBody) => {
    const dataset = createEmptyRecordsDatasetForUser(userId, "fictional@example.test");
    const timestamp = "2026-09-07T18:00:00Z";
    dataset.dateNotes.push({
      id: "first-note", caseId, userId, noteDate: range.from, category: "exchange",
      title: "Fictional on-time pickup", body: noteBody, tags: ["fictional example"], includeInReports: true,
      createdAt: timestamp, updatedAt: timestamp,
    });
    dataset.dateNotes.push({ ...dataset.dateNotes[0], id: "unrelated-note", userId: "another-account", title: "DO NOT EXPORT OTHER ACCOUNT", body: "UNRELATED PRIVATE TEXT" });
    const preview = buildReportPreview(dataset, userId, caseId, range, "full_profile");
    const packet = printableReportPacket(preview, range);
    expect(JSON.stringify(packet)).toContain(noteBody);
    expect(JSON.stringify(packet)).not.toContain("Recorded issue");
    expect(JSON.stringify(packet)).not.toContain("UNRELATED PRIVATE TEXT");
    expect(JSON.stringify(packet)).not.toContain("fictional@example.test");
    expect(preview.metrics.find((metric) => metric.label === "Date Notes")?.value).toBe(1);
    const generated = generatePrintableReportPdf(packet);
    const bytes = new Uint8Array(await generated.blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(generated.pageCount).toBeGreaterThan(0);
    await artifact(filename, bytes);
  });
});
