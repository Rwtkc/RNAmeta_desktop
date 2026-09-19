import { readTextFile } from "@tauri-apps/plugin-fs";

interface BedInputRow {
  id: string;
  chrom: string;
  start: number;
  end: number;
  name: string;
}

export async function readBedRows(path: string): Promise<BedInputRow[]> {
  const text = await readTextFile(path);
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim() || line.startsWith("track") || line.startsWith("#")) return [];
    const fields = line.split(/\t| +/);
    const start = Number(fields[1]);
    const end = Number(fields[2]);
    if (!fields[0] || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{ id: `${index + 1}`, chrom: fields[0], start, end, name: fields[3] || `BED interval ${index + 1}` }];
  });
}
