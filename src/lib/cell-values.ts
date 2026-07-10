// Helpers for cell value shapes that are richer than a plain string.
//
// URL columns  → optionally store { url, label } as JSON so a link can show a
//                 friendly display name ("Candidate Document") instead of the
//                 raw URL. Plain-string values remain fully supported.
// File columns → store an array of { name, type, url } (url is a data: URL or a
//                 link such as /doc/<id>). Legacy plain-string links (a single
//                 generated-document link) are still understood.

export type UrlValue = { url: string; label?: string };
export type FileValue = { name: string; type?: string; url: string };

// Parse a URL cell value into { url, label }. Accepts JSON or a plain string.
export function parseUrlValue(raw: string | null | undefined): UrlValue {
  if (!raw) return { url: "" };
  const s = raw.trim();
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s);
      if (o && typeof o.url === "string")
        return { url: o.url, label: typeof o.label === "string" ? o.label : undefined };
    } catch {}
  }
  return { url: s };
}

// Text shown for a URL cell: label if set, else a tidied URL.
export function urlDisplay(raw: string | null | undefined): string {
  const { url, label } = parseUrlValue(raw);
  if (label && label.trim()) return label.trim();
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// Absolute href for a URL cell (adds https:// when the scheme is missing).
export function urlHref(raw: string | null | undefined): string {
  const { url } = parseUrlValue(raw);
  if (!url) return "";
  return /^(https?:|mailto:|tel:|\/)/i.test(url) ? url : `https://${url}`;
}

// Serialize a URL cell. Stores plain string when there is no custom label.
export function serializeUrlValue(url: string, label: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const l = label.trim();
  return l ? JSON.stringify({ url: u, label: l }) : u;
}

// Parse a File cell value into a list of files. Accepts a JSON array, or a
// legacy single-link string (e.g. "/doc/abc" from document generation).
export function parseFileValue(raw: string | null | undefined): FileValue[] {
  if (!raw) return [];
  const s = raw.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr))
        return arr
          .filter((f) => f && typeof f.url === "string")
          .map((f) => ({ name: String(f.name ?? "file"), type: f.type, url: f.url }));
    } catch {}
  }
  // Legacy: a single link (generated document).
  return [{ name: "Document", url: s }];
}
