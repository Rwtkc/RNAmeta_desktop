import { useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { ChevronDown, Download, Dna, Play } from "lucide-react";
import {
  FigureExportDialog,
  type FigureExportState
} from "@/components/analysis/FigureExportDialog";
import { BedFileSelector } from "@/components/shared/BedFileSelector";
import {
  buildMetaPlotPdfBytes,
  buildMetaPlotPngBytes,
  getSvgMarkupIntrinsicSize
} from "@/lib/metaPlotExport";
import { StructureTable } from "./StructureTable";
import { StructureViewer } from "./StructureViewer";
import type { StructureViewerHandle } from "./structureTypes";
import { useStructureWorkflow } from "./useStructureWorkflow";
import type { BedRow } from "@/modules/GenomeBrowser/genomeBrowserTypes";

const DEFAULT_EXPORT: FigureExportState = {
  format: "png",
  width: "3200",
  height: "2000",
  dpi: "600"
};

function ResultHeader({ canExport, onExport }: {
  canExport: boolean;
  onExport: () => void;
}) {
  return <div className="config-card__head config-card__head--with-action">
    <div className="config-card__copy"><h3>Rendered Result</h3></div>
    {canExport ? <div className="export-menu"><button type="button"
      className="action-button action-button--compact" onClick={onExport}>
      <Download size={14} />Export<ChevronDown size={14} />
    </button></div> : null}
  </div>;
}

export function StructureModule() {
  const workflow = useStructureWorkflow();
  const viewerRef = useRef<StructureViewerHandle | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportState, setExportState] = useState(DEFAULT_EXPORT);
  const [exportScale, setExportScale] = useState(3);
  const [pendingRow, setPendingRow] = useState<BedRow | null>(null);
  const canMap = Boolean(
    workflow.annotationValidation?.isValid && workflow.bedPath && workflow.isTair10
  );

  async function exportFigure() {
    if (!workflow.result) return;
    const svgMarkup = await viewerRef.current?.getSvgMarkup();
    if (!svgMarkup) {
      workflow.setError("Structure SVG is not ready for export.");
      return;
    }
    const format = exportState.format === "pdf" ? "pdf" : "png";
    const intrinsic = getSvgMarkupIntrinsicSize(svgMarkup);
    const width = Math.max(1, Math.ceil(intrinsic.width * exportScale));
    const height = Math.max(1, Math.ceil(intrinsic.height * exportScale));
    const dpi = 300 * exportScale;
    const selectedPath = await save({
      title: `Export Structure ${format.toUpperCase()}`,
      defaultPath: `structure_${workflow.result.transcriptId}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    });
    if (!selectedPath) return;
    try {
      const bytes = format === "png"
        ? await buildMetaPlotPngBytes(svgMarkup, width, height, dpi)
        : await buildMetaPlotPdfBytes(svgMarkup, width, height, dpi);
      await writeFile(selectedPath.startsWith("file://") ? new URL(selectedPath) : selectedPath, bytes);
      workflow.addLog("success", `[Structure] Exported ${format.toUpperCase()} -> ${selectedPath}`);
      setIsExportOpen(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      workflow.setError(message);
      workflow.addLog("error", `[Structure] ${message}`);
    }
  }

  return <section className="module-page analysis-module-page structure-page">
    <div className="module-page__hero module-page__hero--with-action structure-hero">
      <div className="module-page__hero-copy">
        <span className="structure-hero__context">Local RNAfold workspace</span>
        <h1>Structure</h1>
        <p>Map BED intervals to transcripts, fold complete transcript sequences locally, and inspect highlighted RNA secondary structures.</p>
      </div>
      <button type="button" className="action-button action-button--primary"
        disabled={!canMap || workflow.isRunning || workflow.isMapping}
        onClick={() => void workflow.runMapping()}>
        <Play size={14} />Run Structure
      </button>
    </div>

    {!canMap ? <div className="inline-alert inline-alert--warning">
      Complete Project Configuration for TAIR10 and upload at least one BED file to enable Structure.
    </div> : null}

    <BedFileSelector
      files={workflow.analysisFiles}
      value={workflow.bedPath}
      disabled={workflow.isRunning || workflow.isMapping || workflow.isFolding}
      onChange={workflow.setBedPath}
    />

    {workflow.error ? <div className="inline-alert inline-alert--danger">{workflow.error}</div> : null}
    {workflow.hasMapped && workflow.rows.length > 0 ? <StructureTable
      rows={workflow.rows}
      selectedRow={workflow.selectedRow}
      disabled={workflow.isRunning || workflow.isFolding}
      onSelect={setPendingRow}
    /> : null}
    {workflow.hasMapped && !workflow.isMapping && workflow.rows.length === 0 && !workflow.error
      ? <div className="inline-alert inline-alert--warning">No transcript overlaps were found for the selected BED file.</div>
      : null}

    <section className={`config-card analysis-result-card structure-result-card${workflow.result ? "" : " analysis-result-card--pending"}`}>
      <ResultHeader canExport={Boolean(workflow.result)} onExport={() => setIsExportOpen(true)} />
      {workflow.result ? <>
        <div className="meta-plot-summary-grid structure-summary-grid">
          <div className="meta-plot-summary-item"><span className="meta-plot-summary-item__label">Transcript</span><strong className="meta-plot-summary-item__value">{workflow.result.transcriptId}</strong></div>
          <div className="meta-plot-summary-item"><span className="meta-plot-summary-item__label">Length</span><strong className="meta-plot-summary-item__value">{workflow.result.transcriptLength} nt</strong></div>
          <div className="meta-plot-summary-item"><span className="meta-plot-summary-item__label">BED interval</span><strong className="meta-plot-summary-item__value">{workflow.result.interval}</strong></div>
          <div className="meta-plot-summary-item"><span className="meta-plot-summary-item__label">Free energy</span><strong className="meta-plot-summary-item__value">{workflow.result.energy == null ? "—" : `${workflow.result.energy} kcal/mol`}</strong></div>
        </div>
        <StructureViewer ref={viewerRef} result={workflow.result} />
        <details className="structure-sequence-details">
          <summary>Sequence and dot-bracket data</summary>
          <div><span>Sequence</span><code>{workflow.result.sequence}</code></div>
          <div><span>Structure</span><code>{workflow.result.structure}</code></div>
        </details>
      </> : null}
    </section>

    {isExportOpen ? <FigureExportDialog
      ariaLabel="Structure export"
      badgeIcon={<Dna size={18} />}
      description="Export the current local RNA secondary structure."
      formats={["png", "pdf"]}
      noWrapDescription
      onClose={() => setIsExportOpen(false)}
      onStateChange={setExportState}
      onSubmit={() => void exportFigure()}
      scales={[2, 3, 4]}
      selectedScale={exportScale}
      sentenceCaseTitle
      onScaleChange={setExportScale}
      state={exportState}
      title="Structure Export"
    /> : null}

    {pendingRow ? <div className="structure-confirm-backdrop" role="presentation">
      <div className="structure-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="structure-confirm-title">
        <div className="structure-confirm-dialog__head">
          <div><span className="structure-confirm-dialog__eyebrow">RNAfold confirmation</span>
            <h2 id="structure-confirm-title">Run RNAfold?</h2></div>
          <button type="button" className="structure-confirm-dialog__close" onClick={() => setPendingRow(null)} aria-label="Close confirmation">×</button>
        </div>
        <div className="structure-confirm-dialog__body">
          <p>Fold the complete transcript sequence for this BED overlap?</p>
          <dl>
            <div><dt>Transcript</dt><dd>{String(pendingRow.transcript_id)}</dd></div>
            <div><dt>Interval</dt><dd>{String(pendingRow.transcript_interval)}</dd></div>
            <div><dt>Length</dt><dd>{String(pendingRow.transcript_length)} nt</dd></div>
          </dl>
        </div>
        <div className="structure-confirm-dialog__actions">
          <button type="button" className="structure-confirm-dialog__cancel" onClick={() => setPendingRow(null)}>Cancel</button>
          <button type="button" className="structure-confirm-dialog__confirm" onClick={() => {
            const row = pendingRow;
            setPendingRow(null);
            void workflow.runStructure(row);
          }}>Run RNAfold</button>
        </div>
      </div>
    </div> : null}
  </section>;
}
