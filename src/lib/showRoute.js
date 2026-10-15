// Where tapping a show opens, for audio / lighting accounts (job 72,
// option A): on a phone, its web, for your own shows too (the web's SHOW
// tab is the editor). On desktop your own show still opens the editor,
// since the desktop web has no SHOW tab yet. Shows without a share token
// (shouldn't happen; the column has a default) fall back to the editor.
export function techShowPath(show, { desktop = false } = {}) {
  if (show.is_owned === false) return `/gig/web?token=${show.share_token}`;
  if (!desktop && show.share_token) return `/gig/web?token=${show.share_token}`;
  return `/show/${show.id}`;
}

// Phone-sized screen right now (same breakpoint as useIsDesktop).
export const isDesktopNow = () => typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches;
