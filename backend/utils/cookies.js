// Reads one cookie from a request's Cookie header.
// The browser sends every cookie for this site in ONE header, like:
//   Cookie: theme=light; pairly_session=3f9a…
// so we split it into "name=value" pieces and find the one we want.
// (Express can SET cookies by itself, but needs a helper to READ them.)
export function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const equals = part.indexOf('=');
    if (equals === -1) continue;
    if (part.slice(0, equals).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(equals + 1).trim());
    } catch {
      return null; // badly encoded value: treat as "no cookie"
    }
  }
  return null;
}
