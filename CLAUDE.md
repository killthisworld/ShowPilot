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

## Parallel chats

Jay runs several Claude chats on Show Pilot at once, each on its own task, and more than one may push to `main`. Assume someone else changed the code since you last looked.

1. **Start fresh.** Before editing, get the latest `main` from GitHub (`git fetch` + rebase or pull, or a fresh clone). Don't build on an old copy or on files from Jay's local folder without checking they match `main`.
2. **Stay in your lane.** Touch only the files your task needs. If you need a file another chat is likely working on (the same page or a shared component), say so to Jay before making big changes to it.
3. **Re-check right before pushing.** Once you have approval, `git fetch origin main` again. If `main` moved, rebase your commit onto it, read the incoming changes to any file you touched, and rebuild (`npx vite build`). If the build fails, or someone else changed the same lines, stop and tell Jay. Don't force-push and don't quietly drop anyone's work.
4. **Mention what moved.** If `main` changed under you, say so when you report the push, including whether your change had to be adapted to fit.
5. **Jay's local folder is not the source of truth.** It can be behind GitHub. After pushing from the cloud, remind Jay to `git pull` locally. Never overwrite a local file with an older or newer version of it without saying so.
6. **Big features can use a branch.** For large or risky work, offer a feature branch (`feature/<name>`) instead of pushing straight to `main`, and let Jay decide.
