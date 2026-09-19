const GENOME_BROWSER_PROGRESS_PATTERN =
  /\[genome-browser-(?:mapping|workspace)\]\[(\d+)%\]\s*(.+)$/i;

export function normalizeGenomeBrowserEngineLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const progress = trimmed.match(GENOME_BROWSER_PROGRESS_PATTERN);
  if (progress) {
    return `[Genome Browser] ${Number(progress[1])}% ${progress[2].trim()}`;
  }
  return `[Genome Browser] ${trimmed}`;
}
