import {
  useMemo,
  useRef,
  useState
} from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, Play } from "lucide-react";
import { PeakDistributionChart } from "@/components/peak_distribution/PeakDistributionChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import {
  buildPeakExonTypeRequest,
  coercePeakExonTypeRunResult,
  parsePeakExonTypeProgressLine
} from "@/lib/peakExonTypeRuntime";
import { tunePeakDistributionPayload } from "@/lib/peakDistributionRuntime";
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

interface PeakExonTypeExportState extends PeakExonExportState {}

const defaultExportState: PeakExonTypeExportState = {
  format: "png",
  width: "1200",
  height: "560",
  dpi: "300"
};

export function PeakExonTypeModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] =
    useState<PeakExonTypeExportState>(defaultExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    peakExonTypePayload,
    peakExonTypeSummary,
    setPeakExonTypeResult
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

  async function runPeakExonType() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setPeakExonTypeResult(null, null);

      const runId = `peak-exon-type-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      const requestRelativePath = await join(
        "peak-exon-type",
        `${runId}.request.json`
      );
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/peak_exon_type_runner.R"
      });

      const requestPayload = buildPeakExonTypeRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "peak-exon-type",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: {}
      });
      const responseRelativePath = await join(
        "peak-exon-type",
        `${cacheKey}.response.json`
      );
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadModuleRunResult(
        responsePath,
        coercePeakExonTypeRunResult
      );
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        setPeakExonTypeResult(
          tunePeakDistributionPayload(cachedResult.chartPayload),
          cachedResult.summary
        );
        addLog(
          "success",
          `[Peak Exon Type] Restored session cache for ${cachedResult.summary.sampleCount} sample(s).`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[Peak Exon Type] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Peak Exon Type analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizePeakExonEngineLine(
            line,
            "Peak Exon Type",
            parsePeakExonTypeProgressLine
          );
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizePeakExonEngineLine(
            line,
            "Peak Exon Type",
            parsePeakExonTypeProgressLine
          );
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadModuleRunResult(
        responsePath,
        coercePeakExonTypeRunResult
      );
      if (!result) {
        throw new Error("Peak Exon Type runner did not return a response payload.");
      }

      if (!result.chartPayload || !result.summary || result.status !== "ok") {
        throw new Error(result.message ?? "Peak Exon Type analysis failed.");
      }

      setPeakExonTypeResult(
        tunePeakDistributionPayload(result.chartPayload),
        result.summary
      );
      addLog(
        "success",
        `[Peak Exon Type] Completed ${result.summary.sampleCount} sample(s), ${result.summary.intervalCount} intervals, ${result.summary.exonHitCount} exon hits.`
      );
    } catch (error) {
      const result = responsePath
        ? await tryReadModuleRunResult(responsePath, coercePeakExonTypeRunResult)
        : null;
      const message =
        result?.message ??
        (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Peak Exon Type] ${message}`);
    }
  }

  async function exportChart() {
    const svgElement = chartRef.current?.querySelector("svg");
    if (!svgElement || !peakExonTypePayload) {
      return;
    }

    try {
      const didExport = await exportPeakExonChart({
        dataPayload: peakExonTypePayload,
        svgElement,
        exportState,
        dialogTitle: "Export Peak Exon Type",
        fileStem: "peak_exon_type",
        defaultWidth: 1200,
        defaultHeight: 560,
        logLabel: "Peak Exon Type",
        addLog
      });
      if (didExport) {
        setIsExportDialogOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      addLog("error", `[Peak Exon Type] ${message}`);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>Peak Exon Type</h1>
          <p>
            Compare the relative share of first, middle and last exon overlaps
            for each uploaded BED file.
          </p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={() => void runPeakExonType()}
        >
          <Play size={14} />
          Run Peak Exon Type
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
          peakExonTypePayload ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>Stacked percentage bar chart of first, middle and last exon composition.</p>
          </div>
          {peakExonTypePayload ? (
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

        {peakExonTypeSummary ? (
          <PeakExonSummaryGrid
            items={[
              { label: "Species", value: peakExonTypeSummary.species },
              {
                label: "Samples",
                value: String(peakExonTypeSummary.sampleCount)
              },
              {
                label: "Intervals",
                value: String(peakExonTypeSummary.intervalCount)
              },
              {
                label: "Exon Hits",
                value: String(peakExonTypeSummary.exonHitCount)
              }
            ]}
          />
        ) : null}

        <div className="peak-distribution-stage">
          {peakExonTypePayload ? (
            <div ref={chartRef} className="peak-distribution-stage__figure">
              <PeakDistributionChart payload={peakExonTypePayload} />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>
                  Run Peak Exon Type to render the exon-position composition chart.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <PeakExonExportDialog
          title="Peak Exon Type export"
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
