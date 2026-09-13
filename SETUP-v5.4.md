# The List v5.4 — secure level submission patch

This patch moves the 1,000-download check from the browser into a Supabase Edge Function.
The function fetches GDBrowser itself, verifies the download count, and inserts the level with the server-side Supabase service role.

## 1. Run the SQL migration

Run the complete `schema-v5.sql` in the Supabase SQL Editor.

The v5.4 section at the bottom removes direct public INSERT access to `levels`.

## 2. Create the Edge Function

In Supabase Dashboard:

**Edge Functions → Create a new function**

Name it exactly:

`submit-level`

Replace the generated code with:

`supabase/functions/submit-level/index.ts`

Then deploy it.

Supabase's dashboard supports creating and deploying Edge Functions directly. The deployed function URL will follow the normal `/functions/v1/submit-level` pattern.

## 3. Update the website files

Upload the v5.4 website files to GitHub, including the new `supabase/functions/submit-level/index.ts` file for your function source/reference.

## 4. Test

Try submitting:

- a level below 1,000 downloads → rejected
- a level at/above 1,000 downloads → accepted
- an already-added level → rejected as a duplicate

The browser no longer sends the download count, so users cannot simply change `downloads` to 1000 in the client request.
