import { describe, expect, it } from "vitest";
import { buildCalendarEvents, isLateExchangeTimelineEvent, isMissedExchangeTimelineEvent, isNoFaceTimeTimelineEvent, isPostCallFaceTimeNotice } from "@/lib/records/calculations";
import { createRecordsSeed, demoCaseId, demoUserId } from "@/lib/records/seed";
import type { CalendarEvent, NoteCategory } from "@/lib/records/types";

function note(body: string, tags: string[] = []): CalendarEvent {
  return { id: "fictional-note", caseId: demoCaseId, date: "2026-05-07", type: "custody_note", title: "Fictional example", body, tags };
}

describe("issue classifications use explicit recorded information", () => {
  it.each(["There was no missed exchange today.", "We discussed what to do if there is a refused exchange.", "Parent B did not bring the backpack, but pickup happened on time."])("does not turn prose into a missed exchange: %s", (body) => {
    expect(isMissedExchangeTimelineEvent(note(body))).toBe(false);
  });
  it.each(["FaceTime worked; there was no service problem.", "We discussed what to do if there is no FaceTime next week.", "FaceTime took place. We were not able to discuss homework."])("does not turn prose into a failed call: %s", (body) => {
    expect(isNoFaceTimeTimelineEvent(note(body))).toBe(false);
  });
  it("does not infer notice chronology from a mention of an earlier call", () => {
    expect(isPostCallFaceTimeNotice(note("We discussed this after a call last week.", ["no_facetime"]))).toBe(false);
  });
  it("keeps structured on-time exchange status despite unrelated late/refused wording", () => {
    const dataset = createRecordsSeed();
    const log = dataset.exchangeLogs[0];
    log.status = "completed_on_time";
    log.actualExchangeAt = log.orderedExchangeAt;
    log.notes = "No missed or refused exchange. We discussed a late exchange from last month.";
    log.tags = ["late exchange", "missed exchange"];
    const event = buildCalendarEvents(dataset, demoUserId, demoCaseId, { from: log.orderedExchangeAt.slice(0, 10), to: log.orderedExchangeAt.slice(0, 10) }).find((item) => item.id === `log-${log.id}`)!;
    expect(isLateExchangeTimelineEvent(event)).toBe(false);
    expect(isMissedExchangeTimelineEvent(event)).toBe(false);
  });
});

describe("explicit classifications remain available", () => {
  it.each(["missed exchange", "refused_exchange", "Refused-Exchange"])("accepts an explicit exchange tag: %s", (tag) => {
    expect(isMissedExchangeTimelineEvent(note("Fictional record", [tag]))).toBe(true);
  });
  it.each(["no facetime", "no_face_time", "No-FT"])("accepts an explicit contact tag: %s", (tag) => {
    expect(isNoFaceTimeTimelineEvent(note("Fictional record", [tag]))).toBe(true);
  });
  it("requires both failed contact and explicit chronology tags", () => {
    expect(isPostCallFaceTimeNotice(note("", ["no_facetime", "post_call_notice"]))).toBe(true);
    expect(isPostCallFaceTimeNotice(note("", ["post_call_notice"]))).toBe(false);
    expect(isNoFaceTimeTimelineEvent(note("", ["not_no_facetime"]))).toBe(false);
  });
  it.each(["missed", "refused", "completed_late", "completed_on_time"] as const)("uses recorded exchange status: %s", (status) => {
    const dataset = createRecordsSeed();
    const log = dataset.exchangeLogs[0];
    log.status = status;
    log.actualExchangeAt = log.orderedExchangeAt;
    log.notes = "";
    log.tags = [];
    const day = log.orderedExchangeAt.slice(0, 10);
    const event = buildCalendarEvents(dataset, demoUserId, demoCaseId, { from: day, to: day }).find((item) => item.id === `log-${log.id}`)!;
    expect(isMissedExchangeTimelineEvent(event)).toBe(status === "missed" || status === "refused");
    expect(isLateExchangeTimelineEvent(event)).toBe(status === "completed_late");
  });
  it("retains lateness derived from entered ordered and actual timestamps", () => {
    const dataset = createRecordsSeed();
    const log = dataset.exchangeLogs[0];
    log.status = "other";
    log.actualExchangeAt = new Date(Date.parse(log.orderedExchangeAt) + 15 * 60_000).toISOString();
    log.notes = "";
    log.tags = [];
    const day = log.orderedExchangeAt.slice(0, 10);
    const event = buildCalendarEvents(dataset, demoUserId, demoCaseId, { from: day, to: day }).find((item) => item.id === `log-${log.id}`)!;
    expect(isLateExchangeTimelineEvent(event)).toBe(true);
  });
});


describe("note topics are not adverse outcomes", () => {
  it.each(["exchange", "safety", "child_support", "schedule_change", "court"] as NoteCategory[])(
    "keeps an ordinary %s note neutral", (category) => {
      const dataset = createRecordsSeed();
      const entry = dataset.dateNotes[0];
      entry.category = category;
      entry.title = "Fictional routine update";
      entry.body = "Everything went as planned.";
      entry.tags = [];
      const event = buildCalendarEvents(dataset, demoUserId, demoCaseId, { from: entry.noteDate, to: entry.noteDate }).find((item) => item.relatedIds?.includes(entry.id))!;
      expect(event.severity).toBe("neutral");
    }
  );
  it("retains explicit issue tags", () => {
    const dataset = createRecordsSeed();
    const entry = dataset.dateNotes[0];
    entry.category = "other";
    entry.tags = ["Late Exchange"];
    const range = { from: entry.noteDate, to: entry.noteDate };
    const event = buildCalendarEvents(dataset, demoUserId, demoCaseId, range).find((item) => item.relatedIds?.includes(entry.id))!;
    expect(event.severity).toBe("attention");
  });
});
