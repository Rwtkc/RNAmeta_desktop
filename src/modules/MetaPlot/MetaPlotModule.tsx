import { useEffect, useMemo, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, SlidersHorizontal } from "lucide-react";
import { FigureExportDialog } from "@/components/analysis/FigureExportDialog";
import { SummaryStatItem } from "@/components/analysis/SummaryStatItem";
import { MetaPlotInteractiveChart } from "@/components/meta_plot/MetaPlotInteractiveChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import { buildMetaPlotPdfBytes, buildMetaPlotPngBytes } from "@/lib/metaPlotExport";
import {
  buildMetaPlotDataTable,
  exportAnalysisDataTable,
  isDataExportFormat
} from "@/lib/analysisDataExport";
import {
  buildMetaPlotRequest,
  tuneMetaPlotPayload
} from "@/lib/metaPlotRuntime";
import {
  buildAnalysisCacheKey,
  resolveSessionCachePath
} from "@/lib/sessionCache";
import { buildMetaPlotSvg } from "@/lib/metaPlotSvg";
import { MetaPlotControlsCard } from "@/modules/MetaPlot/MetaPlotControlsCard";
import {
  defaultMetaPlotExportState,
  formatMetaPlotExportError,
  metaPlotExportFileName,
  normalizeMetaPlotEngineLine,
  tryReadMetaPlotRunResult
} from "@/modules/MetaPlot/metaPlotModuleHelpers";
import {
  defaultMetaPlotControls,
  useAppStore,
  type MetaPlotControls
} from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

export function MetaPlotModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] = useState(defaultMetaPlotExportState);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    metaPlotControls,
    metaPlotPayload,
    metaPlotSummary,
    setMetaPlotControl,
    setMetaPlotResult
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
  const renderedSvg = useMemo(
    () => (metaPlotPayload ? buildMetaPlotSvg(metaPlotPayload, 1200, 560) : ""),
    [metaPlotPayload]
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

  function resetControls() {
    (Object.keys(defaultMetaPlotControls) as Array<keyof MetaPlotControls>).forEach((key) => {
      setMetaPlotControl(key, defaultMetaPlotControls[key]);
    });
  }

  async function runMetaPlot() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";
    let emittedRangeWarning = false;

    try {
      setRunError("");
      setMetaPlotResult(null, null);

      const runId = `meta-plot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const requestRelativePath = await join("meta-plot", `${runId}.request.json`);
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/meta_plot_runner.R"
      });

      const requestPayload = buildMetaPlotRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles,
        controls: metaPlotControls
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "meta-plot",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: metaPlotControls
      });
      const responseRelativePath = await join("meta-plot", `${cacheKey}.response.json`);
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadMetaPlotRunResult(responsePath);
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        const tunedPayload = tuneMetaPlotPayload(cachedResult.chartPayload);
        setMetaPlotResult(tunedPayload, cachedResult.summary);
        addLog(
          "success",
          `[Meta Plot] Restored session cache for ${cachedResult.summary.sampleCount} sample(s), ${cachedResult.summary.intervalCount} intervals.`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog("command", `[Meta Plot] Starting analysis for ${selectedFiles.length} BED file(s).`);

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Meta Plot analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizeMetaPlotEngineLine(line);
          if (!normalized) {
            return;
          }
          if (
            normalized.message.includes("out-of-bound transcript ranges") &&
            emittedRangeWarning
          ) {
            return;
          }
          if (normalized.message.includes("out-of-bound transcript ranges")) {
            emittedRangeWarning = true;
          }
          addLog(normalized.type, normalized.message);
        },
        onStderr: (line) => {
          const normalized = normalizeMetaPlotEngineLine(line);
          if (!normalized) {
            return;
          }
          if (
            normalized.message.includes("out-of-bound transcript ranges") &&
            emittedRangeWarning
          ) {
            return;
          }
          if (normalized.message.includes("out-of-bound transcript ranges")) {
            emittedRangeWarning = true;
          }
          addLog(normalized.type, normalized.message);
        }
      });

      const result = await tryReadMetaPlotRunResult(responsePath);
      if (!result) {
        throw new Error("Meta Plot runner did not return a response payload.");
      }

      if (result.status !== "ok" || !result.chartPayload || !result.summary) {
        throw new Error(result.message ?? "Meta Plot analysis failed.");
      }

      const tunedPayload = tuneMetaPlotPayload(result.chartPayload);
      setMetaPlotResult(tunedPayload, result.summary);
      addLog(
        "success",
        `[Meta Plot] Completed ${result.summary.sampleCount} sample(s), ${result.summary.intervalCount} intervals, ${result.summary.sampledPointCount} sampled points.`
      );
    } catch (error) {
      const result = responsePath ? await tryReadMetaPlotRunResult(responsePath) : null;
      const message =
        result?.message ?? (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Meta Plot] ${message}`);
    }
  }

  async function exportMetaPlot() {
    if (!metaPlotPayload || !renderedSvg) {
      return;
    }

    const format = exportState.format;
    if (isDataExportFormat(format)) {
      try {
        const didExport = await exportAnalysisDataTable({
          addLog,
          defaultPath: metaPlotExportFileName(format),
          format,
          logLabel: "Meta Plot",
          table: buildMetaPlotDataTable(metaPlotPayload),
          title: `Export Meta Plot ${format.toUpperCase()}`
        });
        if (didExport) {
          setIsExportDialogOpen(false);
        }
      } catch (error) {
        const message = `${format.toUpperCase()} export failed: ${formatMetaPlotExportError(error)}`;
        setRunError(message);
        addLog("error", `[Meta Plot] ${message}`);
      }
      return;
    }

    const width = Math.max(1, Number.parseInt(exportState.width, 10) || 1200);
    const height = Math.max(1, Number.parseInt(exportState.height, 10) || 560);
    const dpi = Math.max(72, Number.parseInt(exportState.dpi, 10) || 300);

    const suggestedPath = metaPlotExportFileName(format);
    const selectedPath = await save({
      title: format === "png" ? "Export Meta Plot PNG" : "Export Meta Plot PDF",
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
        `[Meta Plot] Preparing ${format.toUpperCase()} export ${width}x${height} @ ${dpi} DPI.`
      );

      const bytes =
        format === "png"
          ? await buildMetaPlotPngBytes(renderedSvg, width, height, dpi)
          : await buildMetaPlotPdfBytes(renderedSvg, width, height, dpi);

      addLog(
        "info",
        `[Meta Plot] Built ${format.toUpperCase()} payload (${bytes.byteLength} bytes).`
      );

      stage = "writing output file";
      const outputTarget =
        selectedPath.startsWith("file://") ? new URL(selectedPath) : selectedPath;
      await writeFile(outputTarget, bytes);
      addLog(
        "success",
        `[Meta Plot] Exported ${format.toUpperCase()} ${width}x${height} @ ${dpi} DPI -> ${selectedPath}`
      );
      setIsExportDialogOpen(false);
    } catch (error) {
      const message = `${format.toUpperCase()} export failed during ${stage}: ${formatMetaPlotExportError(error)}`;
      setRunError(message);
      addLog("error", `[Meta Plot] ${message}`);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero">
        <h1>Meta Plot</h1>
        <p>Generate transcript-relative meta-plot profiles and review the resulting desktop visualization and summary output.</p>
      </div>

      {!canRunAnalysis ? (
        <div className="inline-alert inline-alert--warning">
          Complete Project Status validation and upload at least one BED file in Upload / Run to enable analysis.
        </div>
      ) : null}

      <MetaPlotControlsCard
        canRunAnalysis={canRunAnalysis}
        controls={metaPlotControls}
        isRunning={isRunning}
        onControlChange={setMetaPlotControl}
        onReset={resetControls}
        onRun={() => void runMetaPlot()}
      />

      <section
        className={`config-card analysis-result-card${
          metaPlotPayload && renderedSvg ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>The chart and summary below are generated from the same desktop R runner output.</p>
          </div>
          {metaPlotPayload && renderedSvg ? (
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

        {metaPlotSummary ? (
          <div className="meta-plot-summary-grid">
            <SummaryStatItem label="Species" value={metaPlotSummary.species} />
            <SummaryStatItem label="Samples" value={String(metaPlotSummary.sampleCount)} />
            <SummaryStatItem label="Intervals" value={String(metaPlotSummary.intervalCount)} />
            <SummaryStatItem
              label="Sampled Points"
              value={String(metaPlotSummary.sampledPointCount)}
            />
            <SummaryStatItem
              label="Transcript Hits"
              value={String(metaPlotSummary.overlapCount)}
            />
          </div>
        ) : null}

        <div className="meta-plot-stage">
          {metaPlotPayload && renderedSvg ? (
            <div className="meta-plot-stage__figure">
              <div className="meta-plot-stage__svg">
                <MetaPlotInteractiveChart payload={metaPlotPayload} />
              </div>
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>Run Meta Plot to render the current transcript-density result.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <FigureExportDialog
          ariaLabel="Meta Plot export"
          badgeIcon={<SlidersHorizontal size={18} />}
          description="Configure output size and resolution before writing the file."
          onClose={() => setIsExportDialogOpen(false)}
          onStateChange={setExportState}
          onSubmit={() => void exportMetaPlot()}
          state={exportState}
        />
      ) : null}
    </section>
  );
}
