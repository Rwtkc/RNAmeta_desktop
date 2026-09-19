function fileName(path: string) {
  return path.split(/[/\\]/).pop() || path;
}

export function BedFileSelector({ files, value, disabled = false, onChange }: {
  files: string[];
  value: string;
  disabled?: boolean;
  onChange: (path: string) => void;
}) {
  if (files.length === 0) return null;

  return <section className="bed-file-selector" aria-label="BED file selection">
    <div className="bed-file-selector__label">
      <h3>BED input</h3>
    </div>
    <div className="selected-files-list">
      {files.map((path) => <button
        key={path}
        type="button"
        className={`selected-file-chip${value === path ? " is-active" : ""}`}
        disabled={disabled}
        title={path}
        onClick={() => onChange(path)}
      >
        <span>{fileName(path)}</span>
      </button>)}
    </div>
  </section>;
}
