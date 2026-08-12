// Single source of truth for DOCX placeholder generation (Improvement 2).
// Both the placeholder-reference UI (docugen-manager.tsx) and the DOCX fill
// engine's auto-resolution fallback (generate-doc.ts) import from here, so
// the displayed {{slug}} for a column is guaranteed to be the same slug the
// fill engine tries to resolve — the UI can never show a placeholder the
// backend wouldn't recognize.

// Deterministic, stable slug for a column name: lowercase, non-alphanumerics
// become underscores, collapsed, trimmed. "First Name" -> "first_name",
// "Email Address" -> "email_address", "Phone #2" -> "phone_2".
export function slugifyColumnName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_") || "column";
}

export function placeholderFor(columnName: string): string {
  return `{{${slugifyColumnName(columnName)}}}`;
}

// The item's own name/title isn't a Column row — it gets a fixed slug so it
// always shows up in the reference list and resolves in the fill engine.
export const ITEM_NAME_SLUG = "item";
export const ITEM_NAME_PLACEHOLDER = `{{${ITEM_NAME_SLUG}}}`;

export type PlaceholderColumn = { id: string; name: string; type: string };

export type PlaceholderRow = {
  columnId: string | null; // null for the synthetic "Item name" row
  columnName: string;
  columnType: string;
  slug: string;
  placeholder: string;
};

// Column types that carry a document-fillable value. Signature/connection
// values need extra wiring (image, linked item) and aren't excluded here —
// generate-doc.ts already resolves a display value for every type, so every
// column is "eligible" per Requirement 2 ("every eligible board column").
// mirror is included too since it resolves to a value the same way.
export function buildPlaceholderList(columns: PlaceholderColumn[]): PlaceholderRow[] {
  const rows: PlaceholderRow[] = [
    { columnId: null, columnName: "Item name", columnType: "name", slug: ITEM_NAME_SLUG, placeholder: ITEM_NAME_PLACEHOLDER },
  ];
  // De-dupe slugs deterministically (stable order = column order) — if two
  // columns slugify to the same thing (e.g. "Email" and "E-Mail"), the later
  // one gets a numeric suffix so every placeholder still resolves uniquely.
  const seen = new Set([ITEM_NAME_SLUG]);
  for (const c of columns) {
    let slug = slugifyColumnName(c.name);
    let n = 2;
    while (seen.has(slug)) {
      slug = `${slugifyColumnName(c.name)}_${n++}`;
    }
    seen.add(slug);
    rows.push({ columnId: c.id, columnName: c.name, columnType: c.type, slug, placeholder: `{{${slug}}}` });
  }
  return rows;
}

// Resolve a placeholder name (as found in an uploaded .docx, already
// trimmed) to the board column it should read from — by slug match. Used as
// the fill engine's fallback when a placeholder has no explicit mapping AND
// no column shares its exact name (see generate-doc.ts).
export function resolveColumnBySlug<T extends PlaceholderColumn>(
  placeholder: string,
  columns: T[]
): T | undefined {
  const target = slugifyColumnName(placeholder);
  if (target === ITEM_NAME_SLUG) return undefined; // caller handles "Item" specially
  return columns.find((c) => slugifyColumnName(c.name) === target);
}
