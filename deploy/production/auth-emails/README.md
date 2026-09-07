# Production email-code templates

Project: `cieuilbpnwuvnrxrlczj` (losttofound-records-production).

The application uses `signInWithOtp` followed by `verifyOtp` with a six-digit email code. Both **Confirm sign up** and **Magic link or OTP** must include `{{ .Token }}`. A newly created identity can use the confirmation template; subsequent requests can use the magic-link template even before a full records session exists.

Set both subjects to **Your Custody Folio sign-in code**. Use `confirmation.html` for Confirm sign up and `magic-link.html` for Magic link or OTP in the hosted Supabase dashboard. These files are configuration evidence; copying them into the application image does not update Supabase.

September 7 previous subjects: Confirm sign up = **Confirm your My Custody Case account**; Magic link or OTP = **Your sign-in link**. Previous bodies are preserved in the dated `*-before-20260907.html` files. They contain template placeholders, not usable authentication tokens.

Do not change invitation, recovery, email-change, expiry, rate-limit, or verification settings as part of this correction. Do not replace the code placeholder with a real code in source control.

Verification requires an actual delivered message and successful code entry for a controlled test identity. Dashboard persistence alone is insufficient. The open-source auth configuration has a default ten-minute template cache; hosted timing may differ. Preserve that uncertainty rather than claiming immediate delivery correctness.

Sources: https://supabase.com/docs/guides/auth/auth-email-templates and https://github.com/supabase/auth/blob/master/internal/conf/configuration.go .
