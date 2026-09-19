import { useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, Play } from "lucide-react";
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
import { buildGeneTypeRequest } from "@/lib/geneTypeRuntime";
import { tunePeakDistributionPayload } from "@/lib/peakDistributionRuntime";
import {
  buildAnalysisCacheKey,
  resolveSessionCachePath
} from "@/lib/sessionCache";
import {
  defaultGeneTypeExportState,
  formatGeneTypeExportError,
  geneTypeExportFileName,
  normalizeGeneTypeEngineLine,
  tryReadGeneTypeRunResult
} from "@/modules/GeneType/geneTypeModuleHelpers";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

export function GeneTypeModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] = useState(defaultGeneTypeExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    geneTypePayload,
    geneTypeSummary,
    setGeneTypeResult
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

  async function runGeneType() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setGeneTypeResult(null, null);

      const runId = `gene-type-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const requestRelativePath = await join("gene-type", `${runId}.request.json`);
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/gene_type_runner.R"
      });

      const requestPayload = buildGeneTypeRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "gene-type",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: {}
      });
      const responseRelativePath = await join("gene-type", `${cacheKey}.response.json`);
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadGeneTypeRunResult(responsePath);
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        setGeneTypeResult(
          tunePeakDistributionPayload(cachedResult.chartPayload),
          cachedResult.summary
        );
        addLog(
          "success",
          `[Gene Type] Restored session cache for ${cachedResult.summary.sampleCount} sample(s).`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[Gene Type] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Gene Type analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizeGeneTypeEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizeGeneTypeEngineLine(line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadGeneTypeRunResult(responsePath);
      if (!result) {
        throw new Error("Gene Type runner did not return a response payload.");
      }

      if (!result.chartPayload || !result.summary || result.status !== "ok") {
        throw new Error(result.message ?? "Gene Type analysis failed.");
      }

      setGeneTypeResult(
        tunePeakDistributionPayload(result.chartPayload),
        result.summary
      );
      addLog(
        "success",
        `[Gene Type] Completed ${result.summary.sampleCount} sample(s), ${result.summary.intervalCount} intervals, ${result.summary.overlapCount} overlaps.`
      );
    } catch (error) {
      const result = responsePath ? await tryReadGeneTypeRunResult(responsePath) : null;
      const message =
        result?.message ?? (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Gene Type] ${message}`);
    }
  }

  async function exportChart() {
    if (!geneTypePayload) {
      return;
    }

    const format = exportState.format;
    if (isDataExportFormat(format)) {
      try {
        const didExport = await exportAnalysisDataTable({
          addLog,
          defaultPath: geneTypeExportFileName(format),
          format,
          logLabel: "Gene Type",
          table: buildPeakDistributionDataTable(geneTypePayload),
          title: `Export Gene Type ${format.toUpperCase()}`
        });
        if (didExport) {
          setIsExportDialogOpen(false);
        }
      } catch (error) {
        const message = `${format.toUpperCase()} export failed: ${formatGeneTypeExportError(error)}`;
        setRunError(message);
        addLog("error", `[Gene Type] ${message}`);
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
    const suggestedPath = geneTypeExportFileName(format);
    const selectedPath = await save({
      title: `Export Gene Type ${format.toUpperCase()}`,
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
        `[Gene Type] Preparing ${format.toUpperCase()} export ${width}x${height} @ ${dpi} DPI.`
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
        `[Gene Type] Exported ${format.toUpperCase()} ${width}x${height} @ ${dpi} DPI -> ${selectedPath}`
      );
      setIsExportDialogOpen(false);
    } catch (error) {
      const message = `${format.toUpperCase()} export failed during ${stage}: ${formatGeneTypeExportError(error)}`;
      setRunError(message);
      addLog("error", `[Gene Type] ${message}`);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>Gene Type</h1>
          <p>
            Detect transcript biotype overlaps for each uploaded BED file and
            visualise the frequency of protein-coding, lncRNA and other gene types.
          </p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={() => void runGeneType()}
        >
          <Play size={14} />
          Run Gene Type
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
          geneTypePayload ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>Grouped bar chart showing transcript biotype frequencies per sample.</p>
          </div>
          {geneTypePayload ? (
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

        {geneTypeSummary ? (
          <div className="meta-plot-summary-grid peak-distribution-summary-grid">
            <SummaryStatItem label="Species" value={geneTypeSummary.species} />
            <SummaryStatItem label="Samples" value={String(geneTypeSummary.sampleCount)} />
            <SummaryStatItem
              label="Intervals"
              value={String(geneTypeSummary.intervalCount)}
            />
            <SummaryStatItem
              label="Overlaps"
              value={String(geneTypeSummary.overlapCount)}
            />
          </div>
        ) : null}

        <div className="peak-distribution-stage">
          {geneTypePayload ? (
            <div ref={chartRef} className="peak-distribution-stage__figure">
              <PeakDistributionChart payload={geneTypePayload} />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>Run Gene Type to render the transcript biotype frequency chart.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <FigureExportDialog
          ariaLabel="Gene Type export"
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
