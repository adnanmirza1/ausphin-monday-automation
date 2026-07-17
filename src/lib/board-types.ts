import type { ColumnType, StatusLabel } from "@/lib/constants";

export type PersonLite = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
};

// Who can edit a column's cells (Improvement #1).
//   "all"      → anyone (default)
//   "admins"   → admins only
//   string[]   → legacy: a list of role ids
//   CustomEdit → any of the listed roles / departments / users
export type CustomEdit = { roles: string[]; departments: string[]; users: string[] };
export type EditPolicy = "all" | "admins" | string[] | CustomEdit;

// Options offered by the "Custom" column-permission picker.
export type PermData = {
  roles: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  people: PersonLite[];
};

export type ColumnData = {
  id: string;
  name: string;
  type: ColumnType;
  labels: StatusLabel[]; // for status columns
  description?: string; // optional column description (shown as ⓘ tooltip)
  required?: boolean; // marks the column as required (red * on header)
  defaultValue?: string; // value applied to this column on new items
  editable?: boolean; // false → current user may not edit this column's cells
  editPolicy?: EditPolicy; // who may edit
  // connection: targetBoardId · mirror: connectionColumnId + sourceColumnId
  targetBoardId?: string;
  connectionColumnId?: string;
  sourceColumnId?: string;
};

export type CellData = {
  value: string | null;
  personId: string | null;
  person: PersonLite | null;
  display?: string; // resolved label for connection (linked name) / mirror (source value)
};

export type ItemData = {
  id: string;
  name: string;
  cells: Record<string, CellData>; // keyed by columnId
};

export type GroupData = {
  id: string;
  name: string;
  color: string;
  items: ItemData[];
};

// Branding/theme for a public form (Form Customization).
export type FormAppearance = {
  logo?: string; // data URL (uploaded company logo)
  bg?: string; // page background colour
  brand?: string; // header band colour
  button?: string; // primary/submit button colour
  text?: string; // header text colour
  radius?: number; // corner radius in px
  font?: "sans" | "serif" | "mono"; // typography
};

export type FormConfig = {
  enabled: boolean;
  title: string;
  desc: string;
  columns: string[]; // included columnIds
  dedupeColumnId: string | null;
  groupId: string | null; // destination group for new submissions
  welcomeMessage: string; // shown after submit
  slug: string | null; // short public link code (/f/<slug>)
  appearance?: FormAppearance;
};

export type FormLite = {
  id: string;
  title: string;
  desc: string;
  enabled: boolean;
  slug: string | null;
  columns: string[];
  dedupeColumnId: string | null;
  groupId: string | null;
  welcomeMessage: string;
  appearance?: FormAppearance;
};

export type BoardData = {
  id: string;
  name: string;
  description: string;
  environmentName: string;
  columns: ColumnData[];
  groups: GroupData[];
  form: FormConfig;
  forms: FormLite[];
};
