// Share a link: the phone's share sheet where there is one (Messages,
// Instagram, WhatsApp...), otherwise copy it to the clipboard.
// Resolves to "shared", "copied", "cancelled" (the person closed the share
// sheet) or "failed".
export async function shareLink({ url, title, text }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ url, title, text });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
      // Some browsers refuse the share sheet (e.g. not from a tap); fall back to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
