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
