const STRUCTURE_PROGRESS_PATTERN = /\[structure\]\[(\d+)%\]\s*(.+)$/i;

export function normalizeStructureEngineLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(STRUCTURE_PROGRESS_PATTERN);
  if (match) return `[Structure] ${Number(match[1])}% ${match[2].trim()}`;
  return `[Structure] ${trimmed}`;
}

export function fileName(path: string) {
  return path.split(/[/\\]/).pop() || path;
}
