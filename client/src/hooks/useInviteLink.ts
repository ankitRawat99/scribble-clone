import { toast } from "../components/ui/Toast";

/**
 * useInviteLink — Invite URL utilities for the room sharing system.
 *
 * ROUTING ARCHITECTURE:
 * The invite URL is purely a frontend concern — no backend changes needed.
 * Route: /room/:roomId
 * When a user opens the URL:
 *   1. React Router extracts roomId from URL params
 *   2. App.tsx reads it and pre-fills the room code input
 *   3. User only needs to enter their name + click Join
 *
 * The URL is the room code — simple, human-shareable, no tokens needed.
 */

export function generateInviteUrl(roomId: string): string {
  return `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
}

/**
 * Copies the room invite URL to clipboard and shows a toast notification.
 * Falls back to the older execCommand API if Clipboard API is unavailable.
 */
export async function copyInviteLink(roomId: string): Promise<void> {
  const url = generateInviteUrl(roomId);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      // Fallback for non-HTTPS / older browsers
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    toast.success("Invite link copied!");
  } catch {
    toast.error("Could not copy link — copy it manually.");
  }
}
