import { useEffect, useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, SlidersHorizontal } from "lucide-react";
import { FigureExportDialog } from "@/components/analysis/FigureExportDialog";
import { SummaryStatItem } from "@/components/analysis/SummaryStatItem";
import { PeakDistributionChart } from "@/components/peak_distribution/PeakDistributionChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import { buildMetaPlotPdfBytes, buildMetaPlotPngBytes } from "@/lib/metaPlotExport";
import {
  buildPeakDistributionDataTable,
  exportAnalysisDataTable,
  isDataExportFormat
} from "@/lib/analysisDataExport";
import {
  buildPeakDistributionAnalysisControls,
  buildPeakDistributionRequest,
  filterPeakDistributionPayload,
  tunePeakDistributionPayload
} from "@/lib/peakDistributionRuntime";
import {
  buildAnalysisCacheKey,
  resolveSessionCachePath
} from "@/lib/sessionCache";
import { PeakDistributionControlsCard } from "@/modules/PeakDistribution/PeakDistributionControlsCard";
import {
  defaultPeakDistributionExportState,
  formatPeakDistributionExportError,
  normalizePeakDistributionEngineLine,
  peakDistributionExportFileName,
  peakDistributionFeatures,
  tryReadPeakDistributionRunResult
} from "@/modules/PeakDistribution/peakDistributionModuleHelpers";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

export function PeakDistributionModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] = useState(defaultPeakDistributionExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    peakDistributionControls,
    peakDistributionPayload,
    peakDistributionSummary,
    setPeakDistributionFeatures,
    setPeakDistributionResult
  } = useAppStore();
  const { addLog } = useLogStore();
  const { isRunning, runShellCommand } = useRAnalysis();
  const analysisFiles = savedFiles.length > 0 ? savedFiles : selectedFiles;
  const cacheFiles = selectedFiles.length > 0 ? selectedFiles : analysisFiles;

  const selectedSpecies = useMemo(
    () => SPECIES_OPTIONS.find((option) => option.label === species) ?? null,
    [species]
  );
  const renderedPayload = useMemo(
    () =>
      filterPeakDistributionPayload(
        peakDistributionPayload,
        peakDistributionControls.selectedFeatures
      ),
    [peakDistributionControls.selectedFeatures, peakDistributionPayload]
  );
  const canRunAnalysis = Boolean(
    annotationValidation?.isValid &&
      annotationDir &&
      selectedSpecies?.id &&
      analysisFiles.length > 0
  );

  useEffect(() => {
    if (!isExportDialogOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsExportDialogOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExportDialogOpen]);

  function toggleFeature(feature: string) {
    const current = peakDistributionControls.selectedFeatures;
    const nextRaw = current.includes(feature)
      ? current.filter((value) => value !== feature)
      : [...current, feature];
    const next = peakDistributionFeatures.filter((value) => nextRaw.includes(value));

    if (next.length > 0) {
      setPeakDistributionFeatures(next);
    }
  }

  async function runPeakDistribution() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setPeakDistributionResult(null, null);

      const runId = `peak-distribution-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      const requestRelativePath = await join("peak-distribution", `${runId}.request.json`);
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/peak_distribution_runner.R"
      });

      const requestPayload = buildPeakDistributionRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles,
        controls: peakDistributionControls
      });
      const analysisControls =
        buildPeakDistributionAnalysisControls(peakDistributionControls);
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "peak-distribution",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: analysisControls
      });
      const responseRelativePath = await join(
        "peak-distribution",
        `${cacheKey}.response.json`
      );
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadPeakDistributionRunResult(responsePath);
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        setPeakDistributionResult(
          tunePeakDistributionPayload(cachedResult.chartPayload),
          cachedResult.summary
        );
        addLog(
          "success",
          `[Peak Distribution] Restored session cache for ${cachedResult.summary.sampleCount} sample(s), ${cachedResult.summary.intervalCount} intervals.`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[Peak Distribution] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Peak Distribution analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizePeakDistributionEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizePeakDistributionEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadPeakDistributionRunResult(responsePath);
      if (!result) {
        throw new Error("Peak Distribution runner did not return a response payload.");
      }

      if (!result.chartPayload || !result.summary || result.status !== "ok") {
        throw new Error(result.message ?? "Peak Distribution analysis failed.");
      }

      setPeakDistributionResult(
        tunePeakDistributionPayload(result.chartPayload),
        result.summary
      );
      addLog(
        "success",
        `[Peak Distribution] Completed ${result.summary.sampleCount} sample(s), ${result.summary.intervalCount} intervals, ${result.summary.featureRowCount} feature rows.`
      );
    } catch (error) {
      const result = responsePath
        ? await tryReadPeakDistributionRunResult(responsePath)
        : null;
      const message =
        result?.message ?? (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Peak Distribution] ${message}`);
    }
  }

  async function exportPeakDistribution() {
    if (!renderedPayload) {
      return;
    }

    const format = exportState.format;
    if (isDataExportFormat(format)) {
      try {
        const didExport = await exportAnalysisDataTable({
          addLog,
          defaultPath: peakDistributionExportFileName(format),
          format,
          logLabel: "Peak Distribution",
          table: buildPeakDistributionDataTable(renderedPayload),
          title: `Export Peak Distribution ${format.toUpperCase()}`
        });
        if (didExport) {
          setIsExportDialogOpen(false);
        }
      } catch (error) {
        const message = `${format.toUpperCase()} export failed: ${formatPeakDistributionExportError(error)}`;
        setRunError(message);
        addLog("error", `[Peak Distribution] ${message}`);
      }
      return;
    }

    const svgElement = chartRef.current?.querySelector("svg");
    if (!svgElement) {
      return;
    }

    const width = Math.max(1, Number.parseInt(exportState.width, 10) || 1200);
    const height = Math.max(1, Number.parseInt(exportState.height, 10) || 560);
    const dpi = Math.max(72, Number.parseInt(exportState.dpi, 10) || 300);
    const svgMarkup = new XMLSerializer().serializeToString(svgElement);
    const suggestedPath = peakDistributionExportFileName(format);
    const selectedPath = await save({
      title: format === "png" ? "Export Peak Distribution PNG" : "Export Peak Distribution PDF",
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
        `[Peak Distribution] Preparing ${format.toUpperCase()} export ${width}x${height} @ ${dpi} DPI.`
      );

      const bytes =
        format === "png"
          ? await buildMetaPlotPngBytes(svgMarkup, width, height, dpi)
          : await buildMetaPlotPdfBytes(svgMarkup, width, height, dpi);

      addLog(
        "info",
        `[Peak Distribution] Built ${format.toUpperCase()} payload (${bytes.byteLength} bytes).`
      );

      stage = "writing output file";
      const outputTarget =
        selectedPath.startsWith("file://") ? new URL(selectedPath) : selectedPath;
      await writeFile(outputTarget, bytes);
      addLog(
        "success",
        `[Peak Distribution] Exported ${format.toUpperCase()} ${width}x${height} @ ${dpi} DPI -> ${selectedPath}`
      );
      setIsExportDialogOpen(false);
    } catch (error) {
      const message = `${format.toUpperCase()} export failed during ${stage}: ${formatPeakDistributionExportError(error)}`;
      setRunError(message);
      addLog("error", `[Peak Distribution] ${message}`);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero">
        <h1>Peak Distribution</h1>
        <p>Run feature-level peak annotation against the saved Upload / Run BED context and compare how intervals distribute across promoter, UTR, CDS, intron, and intergenic regions.</p>
      </div>

      {!canRunAnalysis ? (
        <div className="inline-alert inline-alert--warning">
          Complete Project Status validation and upload at least one BED file in Upload / Run to enable analysis.
        </div>
      ) : null}

      <PeakDistributionControlsCard
        canRunAnalysis={canRunAnalysis}
        isRunning={isRunning}
        onRun={() => void runPeakDistribution()}
        onToggleFeature={toggleFeature}
        selectedFeatures={peakDistributionControls.selectedFeatures}
      />

      <section className={`config-card analysis-result-card${renderedPayload ? "" : " analysis-result-card--pending"}`}>
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>The chart and summary below are generated from the same desktop R runner output.</p>
          </div>
          {renderedPayload ? (
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

        {peakDistributionSummary ? (
          <div className="meta-plot-summary-grid peak-distribution-summary-grid">
            <SummaryStatItem label="Species" value={peakDistributionSummary.species} />
            <SummaryStatItem label="Samples" value={String(peakDistributionSummary.sampleCount)} />
            <SummaryStatItem label="Intervals" value={String(peakDistributionSummary.intervalCount)} />
            <SummaryStatItem label="Feature Rows" value={String(peakDistributionSummary.featureRowCount)} />
          </div>
        ) : null}

        <div className="peak-distribution-stage">
          {renderedPayload ? (
            <div ref={chartRef} className="peak-distribution-stage__figure">
              <PeakDistributionChart payload={renderedPayload} />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>
                  Run Peak Distribution to render the current feature-level
                  annotation result.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <FigureExportDialog
          ariaLabel="Peak Distribution export"
          badgeIcon={<SlidersHorizontal size={18} />}
          description="Configure output size and resolution before writing the file."
          onClose={() => setIsExportDialogOpen(false)}
          onStateChange={setExportState}
          onSubmit={() => void exportPeakDistribution()}
          state={exportState}
        />
      ) : null}
    </section>
  );
}
