import { exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { GenomeReferenceFiles, GenomeReferenceState } from "./genomeBrowserTypes";

export const TAIR10_REFERENCE = {
  fasta: "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa",
  fai: "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.fai",
  gff3: "Arabidopsis_thaliana.TAIR10.51.gff3.gz"
} as const;

export async function inspectTair10Reference(root: string): Promise<GenomeReferenceState> {
  const files = {
    fasta: await join(root, TAIR10_REFERENCE.fasta),
    fai: await join(root, TAIR10_REFERENCE.fai),
    gff3: await join(root, TAIR10_REFERENCE.gff3)
  } satisfies GenomeReferenceFiles;
  const checks = await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await exists(path)] as const));
  return { files, missing: checks.filter(([, present]) => !present).map(([key]) => TAIR10_REFERENCE[key as keyof typeof TAIR10_REFERENCE]) };
}

export function toIgvUrl(path: string) {
  return convertFileSrc(path);
}
