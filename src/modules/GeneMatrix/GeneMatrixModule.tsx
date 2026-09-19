import { useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, Play } from "lucide-react";
import { FigureExportDialog } from "@/components/analysis/FigureExportDialog";
import { SummaryStatItem } from "@/components/analysis/SummaryStatItem";
import { GeneMatrixChart } from "@/components/gene_matrix/GeneMatrixChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import { buildMetaPlotPdfBytes, buildMetaPlotPngBytes } from "@/lib/metaPlotExport";
import {
  buildGeneMatrixDataTable,
  exportAnalysisDataTable,
  isDataExportFormat
} from "@/lib/analysisDataExport";
import { buildGeneMatrixRequest } from "@/lib/geneMatrixRuntime";
import {
  buildAnalysisCacheKey,
  resolveSessionCachePath
} from "@/lib/sessionCache";
import {
  defaultGeneMatrixExportState,
  formatGeneMatrixExportError,
  geneMatrixExportFileName,
  normalizeGeneMatrixEngineLine,
  tryReadGeneMatrixRunResult
} from "@/modules/GeneMatrix/geneMatrixModuleHelpers";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

export function GeneMatrixModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] = useState(defaultGeneMatrixExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    geneMatrixPayload,
    geneMatrixSummary,
    setGeneMatrixResult
  } = useAppStore();
  const { addLog } = useLogStore();
  const { isRunning, runShellCommand } = useRAnalysis();
  const analysisFiles = savedFiles.length > 0 ? savedFiles : selectedFiles;
  const cacheFiles = selectedFiles.length > 0 ? selectedFiles : analysisFiles;

  const selectedSpecies = useMemo(
    () => SPECIES_OPTIONS.find((option) => option.label === species) ?? null,
    [species]
  );
  const canRunAnalysis = Boolean(
    annotationValidation?.isValid &&
      annotationDir &&
      selectedSpecies?.id &&
      analysisFiles.length >= 2 &&
      analysisFiles.length <= 5
  );

  async function runGeneMatrix() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setGeneMatrixResult(null, null);

      const runId = `gene-matrix-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const requestRelativePath = await join("gene-matrix", `${runId}.request.json`);
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/gene_matrix_runner.R"
      });

      const requestPayload = buildGeneMatrixRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "gene-matrix",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: {}
      });
      const responseRelativePath = await join("gene-matrix", `${cacheKey}.response.json`);
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadGeneMatrixRunResult(responsePath);
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        setGeneMatrixResult(cachedResult.chartPayload, cachedResult.summary);
        addLog(
          "success",
          `[Gene Matrix] Restored session cache for ${cachedResult.summary.sampleCount} sample(s).`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[Gene Matrix] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Gene Matrix analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizeGeneMatrixEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizeGeneMatrixEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadGeneMatrixRunResult(responsePath);
      if (!result) {
        throw new Error("Gene Matrix runner did not return a response payload.");
      }

      if (!result.chartPayload || !result.summary || result.status !== "ok") {
        throw new Error(result.message ?? "Gene Matrix analysis failed.");
      }

      setGeneMatrixResult(result.chartPayload, result.summary);
      addLog(
        "success",
        `[Gene Matrix] Completed ${result.summary.sampleCount} sample(s), ${result.summary.unionGeneCount} union genes.`
      );
    } catch (error) {
      const result = responsePath ? await tryReadGeneMatrixRunResult(responsePath) : null;
      const message =
        result?.message ?? (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Gene Matrix] ${message}`);
    }
  }

  async function exportChart() {
    if (!geneMatrixPayload) {
      return;
    }

    const format = exportState.format;
    if (isDataExportFormat(format)) {
      try {
        const didExport = await exportAnalysisDataTable({
          addLog,
          defaultPath: geneMatrixExportFileName(format),
          format,
          logLabel: "Gene Matrix",
          table: buildGeneMatrixDataTable(geneMatrixPayload),
          title: `Export Gene Matrix ${format.toUpperCase()}`
        });
        if (didExport) {
          setIsExportDialogOpen(false);
        }
      } catch (error) {
        const message = `${format.toUpperCase()} export failed: ${formatGeneMatrixExportError(error)}`;
        setRunError(message);
        addLog("error", `[Gene Matrix] ${message}`);
      }
      return;
    }

    const svgElement = chartRef.current?.querySelector("svg");
    if (!svgElement) {
      return;
    }

    const width = Math.max(1, Number.parseInt(exportState.width, 10) || 1200);
    const height = Math.max(1, Number.parseInt(exportState.height, 10) || 700);
    const dpi = Math.max(72, Number.parseInt(exportState.dpi, 10) || 300);
    const svgMarkup = new XMLSerializer().serializeToString(svgElement);
    const suggestedPath = geneMatrixExportFileName(format);
    const selectedPath = await save({
      title: `Export Gene Matrix ${format.toUpperCase()}`,
      defaultPath: suggestedPath,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    });

    if (!selectedPath) {
      return;
    }

    let stage = "building export payload";
    try {
      addLog(
        "command",
        `[Gene Matrix] Preparing ${format.toUpperCase()} export ${width}x${height} @ ${dpi} DPI.`
      );

      const bytes =
        format === "png"
          ? await buildMetaPlotPngBytes(svgMarkup, width, height, dpi)
          : await buildMetaPlotPdfBytes(svgMarkup, width, height, dpi);

      stage = "writing output file";
      const outputTarget =
        selectedPath.startsWith("file://") ? new URL(selectedPath) : selectedPath;
      await writeFile(outputTarget, bytes);
      addLog(
        "success",
        `[Gene Matrix] Exported ${format.toUpperCase()} ${width}x${height} @ ${dpi} DPI -> ${selectedPath}`
      );
      setIsExportDialogOpen(false);
    } catch (error) {
      const message = `${format.toUpperCase()} export failed during ${stage}: ${formatGeneMatrixExportError(error)}`;
      setRunError(message);
      addLog("error", `[Gene Matrix] ${message}`);
    }
  }

  const sampleCountWarning =
    selectedFiles.length < 2
      ? "Gene Matrix requires 2-5 BED files. Upload more in Upload / Run."
      : selectedFiles.length > 5
        ? "Gene Matrix supports up to 5 BED files. Remove some in Upload / Run."
        : null;

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>Gene Matrix</h1>
          <p>
            Compute gene-level overlap across 2-5 BED samples and display the
            intersection sizes in an UpSet chart.
          </p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={() => void runGeneMatrix()}
        >
          <Play size={14} />
          Run Gene Matrix
        </button>
      </div>

      {sampleCountWarning ? (
        <div className="inline-alert inline-alert--warning">
          <span>{sampleCountWarning}</span>
        </div>
      ) : !annotationValidation?.isValid ? (
        <div className="inline-alert inline-alert--warning">
          <span>
            Complete Project Status validation in Upload / Run to enable analysis.
          </span>
        </div>
      ) : null}

      <section
        className={`config-card analysis-result-card${
          geneMatrixPayload ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>UpSet-style intersection chart with gene counts per sample combination.</p>
          </div>
          {geneMatrixPayload ? (
            <div className="export-menu">
              <button
                type="button"
                className="action-button action-button--compact"
                onClick={() => setIsExportDialogOpen(true)}
              >
                <Download size={14} />
                Export
                <ChevronDown size={14} />
              </button>
            </div>
          ) : null}
        </div>

        {runError ? (
          <div className="inline-alert inline-alert--danger">
            <span>{runError}</span>
          </div>
        ) : null}

        {geneMatrixSummary ? (
          <div className="meta-plot-summary-grid gene-matrix-summary-grid">
            <SummaryStatItem label="Species" value={geneMatrixSummary.species} />
            <SummaryStatItem
              label="Samples"
              value={String(geneMatrixSummary.sampleCount)}
            />
            <SummaryStatItem
              label="Union Genes"
              value={String(geneMatrixSummary.unionGeneCount)}
            />
          </div>
        ) : null}

        <div className="peak-distribution-stage">
          {geneMatrixPayload ? (
            <div ref={chartRef} className="peak-distribution-stage__figure">
              <GeneMatrixChart payload={geneMatrixPayload} />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>Run Gene Matrix to render the sample intersection UpSet chart.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <FigureExportDialog
          ariaLabel="Gene Matrix export"
          badgeIcon={<BarChart3 size={18} />}
          description="Configure output size and resolution before writing the file."
          onClose={() => setIsExportDialogOpen(false)}
          onStateChange={setExportState}
          onSubmit={() => void exportChart()}
          state={exportState}
        />
      ) : null}
    </section>
  );
}
