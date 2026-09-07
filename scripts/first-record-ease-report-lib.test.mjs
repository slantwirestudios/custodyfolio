import test from "node:test";
import assert from "node:assert/strict";
import { validateFirstRecordEaseReport } from "./first-record-ease-report-lib.mjs";
const report = {
  schema_version: 1, prompt_key: "first_record_ease_v1",
  window: { from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" },
  scope: "all_non_excluded_respondents_by_response_time",
  minimum_respondents_for_answers: 5,
  responses: 5, answers_suppressed: false, yes: 4, no: 1,
  easy_among_respondents_percent: 80, response_rate_percent: null,
  contact_permission: "not_collected_by_this_poll",
};
test("validates answer arithmetic and preserves the respondent-only scope", () => {
  assert.deepEqual(validateFirstRecordEaseReport(report), report);
  for (const patch of [{ yes: 3 }, { easy_among_respondents_percent: 100 }, { response_rate_percent: 80 }, { user_id: "private" }, { contact_permission: "yes" }]) {
    assert.throws(() => validateFirstRecordEaseReport({ ...report, ...patch }));
  }
});
test("requires suppression below five and null rather than zero satisfaction", () => {
  for (const responses of [0, 1, 4]) {
    const small = { ...report, responses, answers_suppressed: true, yes: null, no: null, easy_among_respondents_percent: null };
    assert.deepEqual(validateFirstRecordEaseReport(small), small);
    assert.throws(() => validateFirstRecordEaseReport({ ...small, yes: 0 }));
    assert.throws(() => validateFirstRecordEaseReport({ ...small, answers_suppressed: false }));
  }
});
