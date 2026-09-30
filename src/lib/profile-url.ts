/**
 * Their activity page on LinkedIn (posts, comments, reposts), from any form
 * of their profile link. Null when the link is not a person's profile.
 */
export function postsUrl(profileUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(profileUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  const slug = url.pathname.match(/^\/in\/([^/]+)/)?.[1];
  return slug ? `https://www.linkedin.com/in/${slug}/recent-activity/all/` : null;
}

/**
 * Your chat with them on LinkedIn, from the conversation id the helper
 * saved; their profile when there is none yet.
 */
export function chatUrl(conversationId: string | undefined, profileUrl: string): string {
  if (conversationId && !conversationId.startsWith("urn:")) {
    return `https://www.linkedin.com/messaging/thread/${encodeURIComponent(conversationId).replace(/%3D/g, "=")}/`;
  }
  return profileUrl;
}
