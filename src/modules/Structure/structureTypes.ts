import type { BedRow, TranscriptWorkspace } from "@/modules/GenomeBrowser/genomeBrowserTypes";

export interface StructureHighlight {
  start: number;
  end: number;
  label: string;
  color: string;
}

export interface StructureResult {
  status: "ok" | "error";
  message?: string;
  transcriptId: string;
  transcriptLength: number;
  interval: string;
  sequence: string;
  structure: string;
  energy: number | null;
  method: string;
  highlightStart: number;
  highlightEnd: number;
  highlights: StructureHighlight[];
}

export interface StructureMappingResult {
  status: "ok" | "error";
  message?: string;
  rows: BedRow[];
  total: number;
  workspaceCachePath: string;
  workspaceGffPath: string;
}

export interface StructureWorkspace extends TranscriptWorkspace {}

export interface StructureViewerHandle {
  getSvgMarkup: () => Promise<string | null>;
}
