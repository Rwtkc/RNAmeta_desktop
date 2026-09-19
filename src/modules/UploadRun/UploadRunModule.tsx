import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BadgeCheck, Clock3 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { PreviewTable } from "@/types/native";

export function UploadRunModule() {
  const [activePreviewFile, setActivePreviewFile] = useState("");
  const [previewError, setPreviewError] = useState("");
  const { selectedFiles, preview, previewFile, setSelectedFiles, setPreview } = useAppStore();
  const activePreview = previewFile === activePreviewFile ? preview : null;
  const showPreview = Boolean(previewError || activePreview?.rows.length);

  function basename(path: string) {
    return path.split(/[/\\]/).pop() || path;
  }

  async function chooseBedFiles() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "BED files",
          extensions: ["bed"]
        }
      ]
    });

    if (!selected) {
      return;
    }

    const files = Array.isArray(selected) ? selected : [selected];
    const nextFiles = files.filter(
      (file): file is string => typeof file === "string" && file.length > 0
    );

    if (nextFiles.length === 0) {
      setSelectedFiles([]);
      return;
    }

    try {
      const normalizedFiles = await invoke<string[]>("normalize_uploaded_bed_files", {
        paths: nextFiles
      });
      setSelectedFiles(nextFiles, normalizedFiles);
      setPreviewError("");
    } catch (error) {
      setSelectedFiles([]);
      setPreview(null, "");
      setPreviewError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (selectedFiles.length === 0) {
      if (activePreviewFile) {
        setActivePreviewFile("");
      }
      return;
    }

    if (!activePreviewFile || !selectedFiles.includes(activePreviewFile)) {
      setActivePreviewFile(selectedFiles[0]);
    }
  }, [activePreviewFile, selectedFiles]);

  useEffect(() => {
    const activeFile = activePreviewFile;

    if (!activeFile) {
      setPreview(null, "");
      setPreviewError("");
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      setPreview(null, activeFile);
      setPreviewError("");

      try {
        const result = await invoke<PreviewTable>("read_delimited_preview", {
          path: activeFile,
          maxLines: 10
        });

        if (!cancelled) {
          setPreview(result, activeFile);
          setPreviewError("");
        }
      } catch (error) {
        if (!cancelled) {
          setPreview(null, activeFile);
          setPreviewError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [activePreviewFile, setPreview]);

  return (
    <section className="module-page upload-run-page">
      <div className="module-page__hero upload-run-hero">
        <div className="module-page__hero-copy">
          <span className="upload-run-hero__context">BED input workspace</span>
          <h1>Upload / Run</h1>
          <p>Select BED files, review their first rows, and prepare them for analysis modules.</p>
        </div>
      </div>

      <div className="upload-panel-stack">
        <UploadFieldCard
          title="BED collection"
          description="Select one or more BED files to use across the analysis modules."
          filename={activePreviewFile || "No BED file selected yet"}
          status={selectedFiles.length > 0 ? "ready" : "waiting"}
          actionLabel={selectedFiles.length > 0 ? "Replace BED files" : "Choose BED files"}
          onAction={() => void chooseBedFiles()}
        >
          {selectedFiles.length > 0 ? (
            <div className="selected-files-panel">
              <div className="selected-files-panel__head">
                <span>{`Selected files (${selectedFiles.length})`}</span>
              </div>

              <div className="selected-files-list">
                {selectedFiles.map((filePath) => {
                  const isActive = filePath === activePreviewFile;

                  return (
                    <button
                      key={filePath}
                      type="button"
                      className={`selected-file-chip${isActive ? " is-active" : ""}`}
                      onClick={() => {
                        setPreview(null, filePath);
                        setPreviewError("");
                        setActivePreviewFile(filePath);
                      }}
                    >
                      <span>{basename(filePath)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </UploadFieldCard>

        <section
          className={`config-card upload-preview-card${
            showPreview ? "" : " upload-preview-card--pending"
          }`}
        >
          <div className="config-card__head upload-preview-card__head">
            <div>
              <h3>Preview table</h3>
            </div>
          </div>

          {showPreview ? (
            previewError ? (
              <div className="table-shell">
                <div className="table-shell__empty">Failed to read preview: {previewError}</div>
              </div>
            ) : activePreview ? (
              <div className="browser-transcript-table-wrap">
                <table className="browser-transcript-table">
                  <thead>
                    <tr>
                      {activePreview.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activePreview.rows.map((row, rowIndex) => (
                      <tr key={`${activePreview.sourcePath}-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td key={`${activePreview.sourcePath}-${rowIndex}-${cellIndex}`}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null
          ) : null}
        </section>
      </div>
    </section>
  );
}

function UploadFieldCard({
  title,
  description,
  filename,
  status,
  actionLabel,
  onAction,
  children
}: {
  title: string;
  description: string;
  filename: string;
  status: "waiting" | "ready";
  actionLabel: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  const isReady = status === "ready";

  return (
    <section className="config-card upload-panel-card">
      <div className="upload-panel-card__head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className={`upload-status-badge ${isReady ? "is-ready" : ""}`}>
          {isReady ? <BadgeCheck size={12} /> : <Clock3 size={12} />}
          {isReady ? "Ready" : "Waiting"}
        </span>
      </div>

      <div className="upload-file-shell">
        <div className="upload-file-shell__main">
          <span className="upload-file-shell__label">Selected file</span>
          <strong>{filename}</strong>
        </div>

        <button
          type="button"
          className="path-row__button upload-secondary-button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      </div>

      {children}
    </section>
  );
}
