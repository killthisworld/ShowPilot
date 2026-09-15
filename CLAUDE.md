# Show Pilot — working rules

## Push / deploy requires explicit approval

Never ship Show Pilot code without Jay's go-ahead. "Shipping" means any of:

- `git push` (to any branch on any remote)
- a Vercel deploy (`vercel`, `vercel --prod`, or triggering one via push)
- `supabase db push`, applying a migration to the hosted project, or deploying an edge function
- anything else that changes what's live for real users

### The flow

1. Do the work. Stage and commit locally if that's appropriate — committing is fine, pushing is not.
2. Call the **PushNotification** tool with a one-line summary of what's ready. Lead with the substance, not "task done." Examples:
   - `Show Pilot: fixed shared-event-not-saving-to-linked-tab. 2 files changed, ready to push?`
   - `Show Pilot: order-number intake form built + migration written. Push + migrate?`
3. **Stop and wait.** Do not push. Say in the chat exactly what will be pushed (files changed, commit message, and whether a Vercel deploy or Supabase migration rides along).
4. Push only on an explicit yes — "push it", "ship it", "go ahead". Silence, a thumbs-up on something else, or "looks good" on a diff is not approval to push.
5. If there's no answer, leave the commits local and end the turn saying the work is committed and waiting.

### Notes

- Read-only work (answering questions, reviewing files, explaining code) needs no notification. Don't ping the phone for it.
- One notification per batch of work, not per file.
- If a push is rejected or needs a rebase, report it — don't force-push.
