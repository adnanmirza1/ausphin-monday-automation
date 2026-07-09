// Shared domain vocabulary for the Work OS.

export const COLUMN_TYPES = [
  "text",
  "longtext",
  "status",
  "person",
  "date",
  "number",
  "email",
  "phone",
  "url",
  "signature",
  "connection",
  "mirror",
  "file",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const COLUMN_TYPE_META: Record<
  ColumnType,
  { label: string; icon: string }
> = {
  text: { label: "Text", icon: "T" },
  longtext: { label: "Long Text", icon: "¶" },
  status: { label: "Status", icon: "◉" },
  person: { label: "Person", icon: "@" },
  date: { label: "Date", icon: "▦" },
  number: { label: "Number", icon: "#" },
  email: { label: "Email", icon: "✉" },
  phone: { label: "Phone", icon: "☎" },
  url: { label: "Link / URL", icon: "🔗" },
  signature: { label: "Signature", icon: "✍" },
  connection: { label: "Connect Board", icon: "⛓" },
  mirror: { label: "Mirror", icon: "⇋" },
  file: { label: "File", icon: "⎙" },
};

// User statuses (Part 0 — active / inactive / unavailable / viewer)
export const USER_STATUSES = [
  "active",
  "viewer",
  "unavailable",
  "inactive",
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_META: Record<
  UserStatus,
  { label: string; color: string; note: string }
> = {
  active: { label: "Active", color: "#2E9C63", note: "Full access per role" },
  viewer: {
    label: "Viewer",
    color: "#5B7A99",
    note: "Read-only · preserves history · free seat",
  },
  unavailable: {
    label: "Unavailable",
    color: "#C67A1E",
    note: "Temporarily cannot sign in",
  },
  inactive: {
    label: "Inactive",
    color: "#9AA4B2",
    note: "Disabled — use Viewer to keep footprint",
  },
};

// Palette used across groups, statuses, departments.
export const PALETTE = [
  "#5B7A99", // steel / new
  "#C67A1E", // amber / accounting
  "#E2B93B", // yellow / contacting
  "#0B7A6F", // teal
  "#2E9C63", // green / done
  "#C0392B", // red / stuck
  "#8E44AD", // purple
  "#2D6CDF", // blue
  "#E06A9C", // pink
  "#5D6D7E", // slate
];

export type StatusLabel = { id: string; label: string; color: string };

// Default status labels for a fresh status column.
export const DEFAULT_STATUS_LABELS: StatusLabel[] = [
  { id: "new", label: "New", color: "#5B7A99" },
  { id: "working", label: "Working on it", color: "#E2B93B" },
  { id: "stuck", label: "Stuck", color: "#C0392B" },
  { id: "done", label: "Done", color: "#2E9C63" },
];

// Candidate → employer stages (Part 15).
export const TAG_STAGES = ["interview", "active", "placed", "past"] as const;
export type TagStage = (typeof TAG_STAGES)[number];

export const TAG_STAGE_META: Record<TagStage, { label: string; color: string }> = {
  interview: { label: "Interview", color: "#C67A1E" },
  active: { label: "Active", color: "#0B7A6F" },
  placed: { label: "Placed", color: "#2E9C63" },
  past: { label: "Past", color: "#9AA4B2" },
};

// System roles that ship by default (Part 0 + Part 16).
// permissions is a flexible JSON contract consumed by the access layer.
export type Permissions = {
  boards: "all" | string[];
  canManageUsers?: boolean;
  canManageEnvironments?: boolean;
  canManageBoards?: boolean;
  canBuildAutomations?: boolean;
  canEditColumns?: boolean;
  canEditItems?: boolean;
  readOnly?: boolean;
};

export const SYSTEM_ROLES: {
  name: string;
  color: string;
  rank: number;
  permissions: Permissions;
}[] = [
  {
    name: "Admin",
    color: "#C0392B",
    rank: 0,
    permissions: {
      boards: "all",
      canManageUsers: true,
      canManageEnvironments: true,
      canManageBoards: true,
      canBuildAutomations: true,
      canEditColumns: true,
      canEditItems: true,
    },
  },
  {
    name: "Developer",
    color: "#8E44AD",
    rank: 10,
    permissions: {
      boards: "all",
      canManageEnvironments: true,
      canManageBoards: true,
      canBuildAutomations: true,
      canEditColumns: true,
      canEditItems: true,
    },
  },
  {
    name: "Member",
    color: "#0B7A6F",
    rank: 50,
    permissions: {
      boards: "all",
      canEditItems: true,
      canBuildAutomations: true,
    },
  },
  {
    name: "Viewer",
    color: "#5B7A99",
    rank: 90,
    permissions: { boards: "all", readOnly: true },
  },
];
