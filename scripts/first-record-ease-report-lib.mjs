import { z } from "zod";

const count = z.number().int().nonnegative();
const schema = z.object({
  schema_version: z.literal(1),
  prompt_key: z.literal("first_record_ease_v1"),
  window: z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  }).strict(),
  scope: z.literal("all_non_excluded_respondents_by_response_time"),
  minimum_respondents_for_answers: z.literal(5),
  responses: count,
  answers_suppressed: z.boolean(),
  yes: count.nullable(),
  no: count.nullable(),
  easy_among_respondents_percent: z.number().min(0).max(100).nullable(),
  response_rate_percent: z.null(),
  contact_permission: z.literal("not_collected_by_this_poll"),
}).strict().superRefine((report, context) => {
  const invalid = (message) => context.addIssue({ code: "custom", message });
  if (Date.parse(report.window.from) >= Date.parse(report.window.to)) invalid("Invalid window");
  if (report.answers_suppressed !== (report.responses < 5)) invalid("Incorrect suppression");
  if (report.answers_suppressed) {
    if (report.yes !== null || report.no !== null || report.easy_among_respondents_percent !== null) invalid("Small groups must hide answers");
  } else {
    if (report.yes === null || report.no === null || report.yes + report.no !== report.responses) invalid("Answer counts must match responses");
    if (report.easy_among_respondents_percent === null || Math.abs(report.easy_among_respondents_percent - 100 * report.yes / report.responses) > 0.0051) invalid("Percentage must match answers");
  }
});

export function validateFirstRecordEaseReport(value) {
  return schema.parse(value);
}
