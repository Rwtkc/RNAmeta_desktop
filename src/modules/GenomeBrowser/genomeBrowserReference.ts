import { exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { GenomeReferenceFiles, GenomeReferenceState } from "./genomeBrowserTypes";

const LEGACY_TAIR10_REFERENCE = {
  fasta: "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa",
  fai: "Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.fai",
  gff3: "Arabidopsis_thaliana.TAIR10.51.gff3.gz"
} as const;

async function resolveFirstExisting(root: string, candidates: string[]) {
  for (const candidate of candidates) {
    const path = await join(root, candidate);
    if (await exists(path)) return { path, name: candidate };
  }
  return { path: await join(root, candidates[0]), name: candidates[0] };
}

export async function inspectGenomeReference(root: string, speciesId: string): Promise<GenomeReferenceState> {
  const legacy = speciesId === "ara_TAIR10" ? LEGACY_TAIR10_REFERENCE : null;
  const [fasta, fai, gff3] = await Promise.all([
    resolveFirstExisting(root, [`${speciesId}.fa`, ...(legacy ? [legacy.fasta] : [])]),
    resolveFirstExisting(root, [`${speciesId}.fa.fai`, ...(legacy ? [legacy.fai] : [])]),
    resolveFirstExisting(root, [`${speciesId}.annotation.gtf`, ...(legacy ? [legacy.gff3] : [])])
  ]);
  const resolved = { fasta, fai, gff3 };
  const checks = await Promise.all(Object.entries(resolved).map(async ([key, value]) => [key, await exists(value.path)] as const));
  const files = Object.fromEntries(Object.entries(resolved).map(([key, value]) => [key, value.path])) as unknown as GenomeReferenceFiles;
  return { files, missing: checks.filter(([, present]) => !present).map(([key]) => resolved[key as keyof typeof resolved].name) };
}

export function toIgvUrl(path: string) {
  return convertFileSrc(path);
}
