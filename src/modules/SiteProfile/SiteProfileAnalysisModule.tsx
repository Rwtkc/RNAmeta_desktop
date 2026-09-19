import { useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { ChevronDown, Download, MapPinned, Play } from "lucide-react";
import { FigureExportDialog } from "@/components/analysis/FigureExportDialog";
import { SiteProfileChart } from "@/components/site_profile/SiteProfileChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import { buildMetaPlotPdfBytes, buildMetaPlotPngBytes } from "@/lib/metaPlotExport";
import { buildSiteProfileSvgMarkup } from "@/lib/siteProfileExport";
import {
  buildSiteProfileDataTable,
  exportAnalysisDataTable,
  isDataExportFormat
} from "@/lib/analysisDataExport";
import {
  buildAnalysisCacheKey,
  resolveSessionCachePath
} from "@/lib/sessionCache";
import {
  getSiteModuleDefinition,
  type SiteModuleId
} from "@/modules/SiteProfile/siteModuleDefinitions";
import {
  buildSiteRequest,
  defaultSiteExportState,
  formatSiteExportError,
  normalizeSiteEngineLine,
  renderSiteSummaryCards,
  resolveSiteStoreSlice,
  resolveSiteSummaryNotice,
  setSiteStoreResult,
  siteExportFileName,
  siteSuccessLogMessage,
  tryReadSiteRunResult
} from "@/modules/SiteProfile/siteProfileModuleHelpers";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";
import type { SiteProfilePayload } from "@/types/native";

export function SiteProfileAnalysisModule({
  moduleId
}: {
  moduleId: SiteModuleId;
}) {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [currentHeatmapSample, setCurrentHeatmapSample] = useState<string | null>(null);
  const [exportState, setExportState] = useState(defaultSiteExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const store = useAppStore();
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles
  } = store;
  const moduleState = resolveSiteStoreSlice(moduleId, store);
  const { payload, summary } = moduleState;
  const { addLog } = useLogStore();
  const { isRunning, runShellCommand } = useRAnalysis();
  const config = getSiteModuleDefinition(moduleId);
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

  async function runAnalysis() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setSiteStoreResult(store, moduleId, null, null);

      const runId = `${moduleId}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      const requestRelativePath = await join(moduleId, `${runId}.request.json`);
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: config.runnerScript
      });

      const requestPayload = buildSiteRequest(moduleId, {
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: config.cacheModuleName,
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: {
          payloadPrecisionVersion: 2
        }
      });
      const responseRelativePath = await join(moduleId, `${cacheKey}.response.json`);
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadSiteRunResult(moduleId, responsePath);
      if (cachedResult?.status === "ok" && cachedResult.summary) {
        setSiteStoreResult(
          store,
          moduleId,
          cachedResult.chartPayload ?? null,
          cachedResult.summary
        );
        addLog(
          "success",
          `[${config.logPrefix}] Restored session cache for ${cachedResult.summary.sampleCount} sample(s).`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[${config.logPrefix}] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: `${config.title} analysis`,
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizeSiteEngineLine(moduleId, line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizeSiteEngineLine(moduleId, line);
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadSiteRunResult(moduleId, responsePath);
      if (!result) {
        throw new Error(`${config.title} runner did not return a response payload.`);
      }

      if (result.status !== "ok" || !result.summary) {
        throw new Error(result.message ?? `${config.title} analysis failed.`);
      }

      setSiteStoreResult(store, moduleId, result.chartPayload ?? null, result.summary);
      addLog("success", siteSuccessLogMessage(moduleId, result.summary));
    } catch (error) {
      const result = responsePath ? await tryReadSiteRunResult(moduleId, responsePath) : null;
      const message =
        result?.message ?? (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[${config.logPrefix}] ${message}`);
    }
  }

  async function exportChart() {
    if (!payload) {
      return;
    }

    const format = exportState.format;
    if (isDataExportFormat(format)) {
      try {
        const didExport = await exportAnalysisDataTable({
          addLog,
          defaultPath: siteExportFileName(moduleId, format),
          format,
          logLabel: config.logPrefix,
          table: buildSiteProfileDataTable(payload, currentHeatmapSample),
          title: `Export ${config.title} ${format.toUpperCase()}`
        });
        if (didExport) {
          setIsExportDialogOpen(false);
        }
      } catch (error) {
        const message = `${format.toUpperCase()} export failed: ${formatSiteExportError(error)}`;
        setRunError(message);
        addLog("error", `[${config.logPrefix}] ${message}`);
      }
      return;
    }

    const exportElement = chartRef.current?.querySelector(
      ".site-profile-d3-chart"
    ) as HTMLElement | null;
    if (!exportElement) {
      return;
    }

    const width = Math.max(1, Number.parseInt(exportState.width, 10) || 1400);
    const height = Math.max(1, Number.parseInt(exportState.height, 10) || 1600);
    const dpi = Math.max(72, Number.parseInt(exportState.dpi, 10) || 300);
    const svgMarkup = buildSiteProfileSvgMarkup(exportElement, width, height);
    const suggestedPath = siteExportFileName(moduleId, format);
    const selectedPath = await save({
      title: `Export ${config.title} ${format.toUpperCase()}`,
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
        `[${config.logPrefix}] Preparing ${format.toUpperCase()} export ${width}x${height} @ ${dpi} DPI.`
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
        `[${config.logPrefix}] Exported ${format.toUpperCase()} ${width}x${height} @ ${dpi} DPI -> ${selectedPath}`
      );
      setIsExportDialogOpen(false);
    } catch (error) {
      const message = `${format.toUpperCase()} export failed during ${stage}: ${formatSiteExportError(error)}`;
      setRunError(message);
      addLog("error", `[${config.logPrefix}] ${message}`);
    }
  }

  const noticeMessage = resolveSiteSummaryNotice(moduleId, summary);

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>{config.title}</h1>
          <p>{config.titleDescription}</p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={() => void runAnalysis()}
        >
          <Play size={14} />
          {config.runLabel}
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
          payload ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <MapPinned size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>{config.resultDescription}</p>
          </div>
          {payload ? (
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

        {!runError && noticeMessage ? (
          <div className="inline-note">
            <span>{noticeMessage}</span>
          </div>
        ) : null}

        {summary ? (
          <div className="meta-plot-summary-grid transcription-summary-grid">
            {renderSiteSummaryCards(moduleId, summary)}
          </div>
        ) : null}

        <div className="site-profile-stage">
          {payload ? (
            <div ref={chartRef} className="site-profile-stage__figure">
              <SiteProfileChart
                payload={payload as SiteProfilePayload}
                onHeatmapSampleChange={setCurrentHeatmapSample}
              />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>{config.idlePlaceholder}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <FigureExportDialog
          ariaLabel={`${config.title} export`}
          badgeIcon={<MapPinned size={18} />}
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
