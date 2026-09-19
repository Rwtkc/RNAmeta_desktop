import { useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, Play } from "lucide-react";
import { FigureExportDialog } from "@/components/analysis/FigureExportDialog";
import { SummaryStatItem } from "@/components/analysis/SummaryStatItem";
import { BoxplotChart } from "@/components/peak_gene_size/BoxplotChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import { buildMetaPlotPdfBytes, buildMetaPlotPngBytes } from "@/lib/metaPlotExport";
import {
  buildBoxplotDataTable,
  exportAnalysisDataTable,
  isDataExportFormat
} from "@/lib/analysisDataExport";
import { buildPeakGeneSizeRequest } from "@/lib/peakGeneSizeRuntime";
import {
  buildAnalysisCacheKey,
  resolveSessionCachePath
} from "@/lib/sessionCache";
import {
  defaultPeakGeneSizeExportState,
  formatPeakGeneSizeExportError,
  normalizePeakGeneSizeEngineLine,
  peakGeneSizeExportFileName,
  tryReadPeakGeneSizeRunResult
} from "@/modules/PeakGeneSize/peakGeneSizeModuleHelpers";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

export function PeakGeneSizeModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] = useState(defaultPeakGeneSizeExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    peakGeneSizePayload,
    peakGeneSizeSummary,
    setPeakGeneSizeResult
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
      analysisFiles.length > 0
  );

  async function runPeakGeneSize() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setPeakGeneSizeResult(null, null);

      const runId = `peak-gene-size-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      const requestRelativePath = await join(
        "peak-gene-size",
        `${runId}.request.json`
      );
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/peak_gene_size_runner.R"
      });

      const requestPayload = buildPeakGeneSizeRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "peak-gene-size",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: {}
      });
      const responseRelativePath = await join(
        "peak-gene-size",
        `${cacheKey}.response.json`
      );
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadPeakGeneSizeRunResult(responsePath);
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        setPeakGeneSizeResult(
          cachedResult.chartPayload,
          cachedResult.summary
        );
        addLog(
          "success",
          `[Peak Gene Size] Restored session cache for ${cachedResult.summary.sampleCount} sample(s).`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[Peak Gene Size] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Peak Gene Size analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizePeakGeneSizeEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizePeakGeneSizeEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadPeakGeneSizeRunResult(responsePath);
      if (!result) {
        throw new Error("Peak Gene Size runner did not return a response payload.");
      }

      if (!result.chartPayload || !result.summary || result.status !== "ok") {
        throw new Error(result.message ?? "Peak Gene Size analysis failed.");
      }

      setPeakGeneSizeResult(result.chartPayload, result.summary);
      addLog(
        "success",
        `[Peak Gene Size] Completed ${result.summary.sampleCount} sample(s), ${result.summary.intervalCount} intervals, ${result.summary.transcriptCount} transcripts.`
      );
    } catch (error) {
      const result = responsePath
        ? await tryReadPeakGeneSizeRunResult(responsePath)
        : null;
      const message =
        result?.message ??
        (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Peak Gene Size] ${message}`);
    }
  }

  async function exportChart() {
    if (!peakGeneSizePayload) {
      return;
    }

    const format = exportState.format;
    if (isDataExportFormat(format)) {
      try {
        const didExport = await exportAnalysisDataTable({
          addLog,
          defaultPath: peakGeneSizeExportFileName(format),
          format,
          logLabel: "Peak Gene Size",
          table: buildBoxplotDataTable(peakGeneSizePayload),
          title: `Export Peak Gene Size ${format.toUpperCase()}`
        });
        if (didExport) {
          setIsExportDialogOpen(false);
        }
      } catch (error) {
        const message = `${format.toUpperCase()} export failed: ${formatPeakGeneSizeExportError(error)}`;
        setRunError(message);
        addLog("error", `[Peak Gene Size] ${message}`);
      }
      return;
    }

    const svgElement = chartRef.current?.querySelector("svg");
    if (!svgElement) {
      return;
    }

    const width = Math.max(1, Number.parseInt(exportState.width, 10) || 1200);
    const height = Math.max(1, Number.parseInt(exportState.height, 10) || 620);
    const dpi = Math.max(72, Number.parseInt(exportState.dpi, 10) || 300);
    const svgMarkup = new XMLSerializer().serializeToString(svgElement);
    const suggestedPath = peakGeneSizeExportFileName(format);
    const selectedPath = await save({
      title: `Export Peak Gene Size ${format.toUpperCase()}`,
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
        `[Peak Gene Size] Preparing ${format.toUpperCase()} export ${width}x${height} @ ${dpi} DPI.`
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
        `[Peak Gene Size] Exported ${format.toUpperCase()} ${width}x${height} @ ${dpi} DPI -> ${selectedPath}`
      );
      setIsExportDialogOpen(false);
    } catch (error) {
      const message = `${format.toUpperCase()} export failed during ${stage}: ${formatPeakGeneSizeExportError(error)}`;
      setRunError(message);
      addLog("error", `[Peak Gene Size] ${message}`);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>Peak Gene Size</h1>
          <p>
            Map peaks to overlapping transcripts and compare transcript length
            distributions across samples with an interactive boxplot.
          </p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={() => void runPeakGeneSize()}
        >
          <Play size={14} />
          Run Peak Gene Size
        </button>
      </div>

      {!canRunAnalysis ? (
        <div className="inline-alert inline-alert--warning">
          <span>
            Complete Project Status validation and upload at least one BED file
            in Upload / Run to enable analysis.
          </span>
        </div>
      ) : null}

      <section
        className={`config-card analysis-result-card${
          peakGeneSizePayload ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>Boxplot of log-transcript lengths for each sample.</p>
          </div>
          {peakGeneSizePayload ? (
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

        {peakGeneSizeSummary ? (
          <div className="meta-plot-summary-grid peak-distribution-summary-grid">
            <SummaryStatItem
              label="Species"
              value={peakGeneSizeSummary.species}
            />
            <SummaryStatItem
              label="Samples"
              value={String(peakGeneSizeSummary.sampleCount)}
            />
            <SummaryStatItem
              label="Intervals"
              value={String(peakGeneSizeSummary.intervalCount)}
            />
            <SummaryStatItem
              label="Transcripts"
              value={String(peakGeneSizeSummary.transcriptCount)}
            />
          </div>
        ) : null}

        <div className="peak-distribution-stage">
          {peakGeneSizePayload ? (
            <div ref={chartRef} className="peak-distribution-stage__figure">
              <BoxplotChart payload={peakGeneSizePayload} />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>
                  Run Peak Gene Size to render the transcript length boxplot.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <FigureExportDialog
          ariaLabel="Peak Gene Size export"
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
