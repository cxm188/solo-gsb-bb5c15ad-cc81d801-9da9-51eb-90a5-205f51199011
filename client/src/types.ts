export type ModeKey = '25' | '2997df';

export interface ModeInfo {
  key: ModeKey;
  label: string;
  dropFrame: boolean;
  fps: number;
}

export interface RowResult {
  line: number;
  name: string;
  sourceInText: string;
  sourceOutText: string;
  programInText: string;
  programOutText: string;
  sourceInFrames: number | null;
  sourceOutFrames: number | null;
  programInFrames: number | null;
  programOutFrames: number | null;
  sourceDuration: number | null;
  programDuration: number | null;
  sourceDurationTc: string | null;
  programDurationTc: string | null;
  programInTc: string | null;
  programOutTc: string | null;
  programOrder: number | null;
  errors: string[];
  warnings: string[];
  timelineValid: boolean;
}

export interface OverlapPair {
  lines: [number, number];
  names: [string, string];
  startFrames: number;
  endFrames: number;
  startTc: string;
  endTc: string;
  overlapFrames: number;
  overlapTc: string;
  a: PairSide;
  b: PairSide;
}

export interface PairSide {
  line: number;
  name: string;
  inFrames: number;
  outFrames: number;
  inTc: string;
  outTc: string;
}

export interface Gap {
  index: number;
  startFrames: number;
  endFrames: number;
  startTc: string;
  endTc: string;
  gapFrames: number;
  gapTc: string;
  beforeLines: number[];
  afterLines: number[];
  lines: number[];
  beforeNames: string[];
  afterNames: string[];
}

export interface UnionPiece {
  startFrames: number;
  endFrames: number;
  startTc: string;
  endTc: string;
  frames: number;
}

export interface AnalyzeResult {
  mode: ModeKey;
  modeLabel: string;
  dropFrame: boolean;
  nominalFps: number;
  hasHeader: boolean;
  csvError: string | null;
  rowCount: number;
  invalidRowCount: number;
  timelineRowCount: number;
  overlapCount: number;
  gapCount: number;
  rows: RowResult[];
  overlaps: OverlapPair[];
  gaps: Gap[];
  timeline: {
    startFrames: number | null;
    endFrames: number | null;
    startTc: string | null;
    endTc: string | null;
    spanFrames: number;
    spanTc: string;
    unionFrames: number;
    unionTc: string;
    coverageRatio: number | null;
    unionPieces: UnionPiece[];
  };
  problemLines: number[];
}
