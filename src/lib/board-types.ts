import type { ColumnType, StatusLabel } from "@/lib/constants";

export type PersonLite = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
};

export type ColumnData = {
  id: string;
  name: string;
  type: ColumnType;
  labels: StatusLabel[]; // for status columns
  description?: string; // optional column description (shown as ⓘ tooltip)
  required?: boolean; // marks the column as required (red * on header)
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

export type FormConfig = {
  enabled: boolean;
  title: string;
  desc: string;
  columns: string[]; // included columnIds
  dedupeColumnId: string | null;
};

export type BoardData = {
  id: string;
  name: string;
  description: string;
  environmentName: string;
  columns: ColumnData[];
  groups: GroupData[];
  form: FormConfig;
};
