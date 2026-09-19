export interface GenomeReferenceFiles {
  fasta: string;
  fai: string;
  gff3: string;
}

export interface BedRow {
  [key: string]: string | number;
  row_key: string;
  chrom: string;
  start: number;
  end: number;
  transcript_interval: string;
  transcript_id: string;
  gene_id: string;
  transcript_length: number;
  overlap_bases: number;
}

export interface GenomeReferenceState {
  files: GenomeReferenceFiles;
  missing: string[];
}

export interface TranscriptWorkspace {
  transcriptId: string;
  transcriptLength: number;
  fastaPath: string;
  faiPath: string;
  bedPath: string;
  cytobandPath: string;
  segments: Array<{ label: string; start: number; end: number }>;
}
