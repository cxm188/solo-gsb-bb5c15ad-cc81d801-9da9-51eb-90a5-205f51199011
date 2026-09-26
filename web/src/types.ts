export type Mode = "ndf25" | "df2997";

export interface RowResult {
  line: number;
  name: string;
  srcIn: string;
  srcOut: string;
  recIn: string;
  recOut: string;
  srcInF: number | null;
  srcOutF: number | null;
  recInF: number | null;
  recOutF: number | null;
  srcDur: number | null;
  recDur: number | null;
  errors: string[];
}

export interface DurationIssue {
  line: number;
  name: string;
  srcDur: number;
  recDur: number;
  diff: number;
}

export interface GapIssue {
  startF: number;
  endF: number;
  frames: number;
  startTc: string;
  endTc: string;
  beforeLine: number;
  afterLine: number;
}

export interface OverlapIssue {
  startF: number;
  endF: number;
  frames: number;
  startTc: string;
  endTc: string;
  lines: [number, number];
}

export interface CheckResponse {
  mode: Mode;
  dataRowCount: number;
  rows: RowResult[];
  durationIssues: DurationIssue[];
  gaps: GapIssue[];
  overlaps: OverlapIssue[];
}
