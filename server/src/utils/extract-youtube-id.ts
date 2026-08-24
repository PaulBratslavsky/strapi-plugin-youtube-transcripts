/**
 * Pull the 11 character video id out of whatever the user pasted.
 *
 * Models pass the link they were given rather than a bare id, and YouTube
 * hands out several shapes of link. `youtu.be` is the one its own share button
 * produces, so a version that did not accept it failed on the most common
 * thing a person would paste.
 *
 * Each pattern anchors on the id being exactly 11 characters, so a trailing
 * `?t=42` or `&list=` is ignored rather than captured.
 */
const ID = '([a-zA-Z0-9_-]{11})';

const PATTERNS: RegExp[] = [
  // youtube.com/watch?v=ID, including m. and music. subdomains
  new RegExp(`youtube\\.com/watch\\?(?:.*&)?v=${ID}`),
  // youtu.be/ID, the share-button format
  new RegExp(`youtu\\.be/${ID}`),
  // youtube.com/shorts/ID
  new RegExp(`youtube\\.com/shorts/${ID}`),
  // youtube.com/embed/ID, used by iframes
  new RegExp(`youtube\\.com/embed/${ID}`),
  // youtube.com/live/ID
  new RegExp(`youtube\\.com/live/${ID}`),
];

export function extractYouTubeID(urlOrID: string): string | null {
  if (!urlOrID) return null;

  const trimmed = urlOrID.trim();

  // Already an id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return null;
}
