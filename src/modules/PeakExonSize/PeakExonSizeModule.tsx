import {
  useMemo,
  useRef,
  useState
} from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, Play } from "lucide-react";
import { PeakExonFacetBoxplotChart } from "@/components/peak_exon/PeakExonFacetBoxplotChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import {
  buildPeakExonSizeRequest,
  coercePeakExonSizeRunResult,
  parsePeakExonSizeProgressLine
} from "@/lib/peakExonSizeRuntime";
import {
  buildAnalysisCacheKey,
  resolveSessionCachePath
} from "@/lib/sessionCache";
import {
  exportPeakExonChart,
  normalizePeakExonEngineLine,
  PeakExonExportDialog,
  PeakExonSummaryGrid,
  tryReadModuleRunResult,
  type PeakExonExportState
} from "@/modules/PeakExon/shared";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

interface PeakExonSizeExportState extends PeakExonExportState {}

const defaultExportState: PeakExonSizeExportState = {
  format: "png",
  width: "1280",
  height: "620",
  dpi: "300"
};

export function PeakExonSizeModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] =
    useState<PeakExonSizeExportState>(defaultExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    peakExonSizePayload,
    peakExonSizeSummary,
    setPeakExonSizeResult
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

  async function runPeakExonSize() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setPeakExonSizeResult(null, null);

      const runId = `peak-exon-size-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      const requestRelativePath = await join(
        "peak-exon-size",
        `${runId}.request.json`
      );
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/peak_exon_size_runner.R"
      });

      const requestPayload = buildPeakExonSizeRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "peak-exon-size",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: {}
      });
      const responseRelativePath = await join(
        "peak-exon-size",
        `${cacheKey}.response.json`
      );
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadModuleRunResult(
        responsePath,
        coercePeakExonSizeRunResult
      );
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        setPeakExonSizeResult(
          cachedResult.chartPayload,
          cachedResult.summary
        );
        addLog(
          "success",
          `[Peak Exon Size] Restored session cache for ${cachedResult.summary.sampleCount} sample(s).`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[Peak Exon Size] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Peak Exon Size analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizePeakExonEngineLine(
            line,
            "Peak Exon Size",
            parsePeakExonSizeProgressLine
          );
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizePeakExonEngineLine(
            line,
            "Peak Exon Size",
            parsePeakExonSizeProgressLine
          );
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadModuleRunResult(
        responsePath,
        coercePeakExonSizeRunResult
      );
      if (!result) {
        throw new Error("Peak Exon Size runner did not return a response payload.");
      }

      if (!result.chartPayload || !result.summary || result.status !== "ok") {
        throw new Error(result.message ?? "Peak Exon Size analysis failed.");
      }

      setPeakExonSizeResult(result.chartPayload, result.summary);
      addLog(
        "success",
        `[Peak Exon Size] Completed ${result.summary.sampleCount} sample(s), ${result.summary.intervalCount} intervals, ${result.summary.exonHitCount} exon hits.`
      );
    } catch (error) {
      const result = responsePath
        ? await tryReadModuleRunResult(responsePath, coercePeakExonSizeRunResult)
        : null;
      const message =
        result?.message ??
        (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Peak Exon Size] ${message}`);
    }
  }

  async function exportChart() {
    const svgElement = chartRef.current?.querySelector("svg");
    if (!svgElement || !peakExonSizePayload) {
      return;
    }

    try {
      const didExport = await exportPeakExonChart({
        dataPayload: peakExonSizePayload,
        svgElement,
        exportState,
        dialogTitle: "Export Peak Exon Size",
        fileStem: "peak_exon_size",
        defaultWidth: 1280,
        defaultHeight: 620,
        logLabel: "Peak Exon Size",
        addLog
      });
      if (didExport) {
        setIsExportDialogOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      addLog("error", `[Peak Exon Size] ${message}`);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>Peak Exon Size</h1>
          <p>
            Summarise exon-length distributions for first, middle and last exon
            overlaps across the current BED session.
          </p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={() => void runPeakExonSize()}
        >
          <Play size={14} />
          Run Peak Exon Size
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
          peakExonSizePayload ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>Faceted boxplot of exon lengths across first, middle and last exons.</p>
          </div>
          {peakExonSizePayload ? (
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

        {peakExonSizeSummary ? (
          <PeakExonSummaryGrid
            items={[
              { label: "Species", value: peakExonSizeSummary.species },
              {
                label: "Samples",
                value: String(peakExonSizeSummary.sampleCount)
              },
              {
                label: "Intervals",
                value: String(peakExonSizeSummary.intervalCount)
              },
              {
                label: "Exon Hits",
                value: String(peakExonSizeSummary.exonHitCount)
              }
            ]}
          />
        ) : null}

        <div className="peak-distribution-stage">
          {peakExonSizePayload ? (
            <div ref={chartRef} className="peak-distribution-stage__figure">
              <PeakExonFacetBoxplotChart payload={peakExonSizePayload} />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>
                  Run Peak Exon Size to render the exon-length distribution chart.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <PeakExonExportDialog
          title="Peak Exon Size export"
          icon={<BarChart3 size={18} />}
          exportState={exportState}
          onChange={setExportState}
          onClose={() => setIsExportDialogOpen(false)}
          onSubmit={() => void exportChart()}
        />
      ) : null}
    </section>
  );
}
