import {
  useMemo,
  useRef,
  useState
} from "react";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { BarChart3, ChevronDown, Download, Play } from "lucide-react";
import { BoxplotChart } from "@/components/peak_gene_size/BoxplotChart";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { useTransientRunError } from "@/hooks/useTransientRunError";
import {
  buildPeakExonNumRequest,
  coercePeakExonNumRunResult,
  parsePeakExonNumProgressLine
} from "@/lib/peakExonNumRuntime";
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

interface PeakExonNumExportState extends PeakExonExportState {}

const defaultExportState: PeakExonNumExportState = {
  format: "png",
  width: "1200",
  height: "620",
  dpi: "300"
};

export function PeakExonNumModule() {
  const { runError, setRunError } = useTransientRunError();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportState, setExportState] =
    useState<PeakExonNumExportState>(defaultExportState);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const {
    annotationDir,
    annotationValidation,
    species,
    selectedFiles,
    savedFiles,
    peakExonNumPayload,
    peakExonNumSummary,
    setPeakExonNumResult
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

  async function runPeakExonNum() {
    if (!selectedSpecies || !canRunAnalysis || isRunning) {
      return;
    }

    let responsePath = "";

    try {
      setRunError("");
      setPeakExonNumResult(null, null);

      const runId = `peak-exon-num-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      const requestRelativePath = await join(
        "peak-exon-num",
        `${runId}.request.json`
      );
      const requestPath = await resolveSessionCachePath(requestRelativePath);
      const runnerPath = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/peak_exon_num_runner.R"
      });

      const requestPayload = buildPeakExonNumRequest({
        species,
        speciesId: selectedSpecies.id,
        annotationDir,
        filePaths: analysisFiles
      });
      const cacheKey = await buildAnalysisCacheKey({
        moduleName: "peak-exon-num",
        annotationDir,
        speciesId: selectedSpecies.id,
        filePaths: cacheFiles,
        controls: {}
      });
      const responseRelativePath = await join(
        "peak-exon-num",
        `${cacheKey}.response.json`
      );
      responsePath = await resolveSessionCachePath(responseRelativePath);

      const cachedResult = await tryReadModuleRunResult(
        responsePath,
        coercePeakExonNumRunResult
      );
      if (
        cachedResult?.status === "ok" &&
        cachedResult.chartPayload &&
        cachedResult.summary
      ) {
        setPeakExonNumResult(cachedResult.chartPayload, cachedResult.summary);
        addLog(
          "success",
          `[Peak Exon Num] Restored session cache for ${cachedResult.summary.sampleCount} sample(s).`
        );
        return;
      }

      await writeTextFile(requestPath, JSON.stringify(requestPayload, null, 2));
      addLog(
        "command",
        `[Peak Exon Num] Starting analysis for ${selectedFiles.length} BED file(s).`
      );

      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Peak Exon Num analysis",
        captureOutput: false,
        onStdout: (line) => {
          const normalized = normalizePeakExonEngineLine(
            line,
            "Peak Exon Num",
            parsePeakExonNumProgressLine
          );
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        },
        onStderr: (line) => {
          const normalized = normalizePeakExonEngineLine(
            line,
            "Peak Exon Num",
            parsePeakExonNumProgressLine
          );
          if (normalized) {
            addLog(normalized.type, normalized.message);
          }
        }
      });

      const result = await tryReadModuleRunResult(
        responsePath,
        coercePeakExonNumRunResult
      );
      if (!result) {
        throw new Error("Peak Exon Num runner did not return a response payload.");
      }

      if (!result.chartPayload || !result.summary || result.status !== "ok") {
        throw new Error(result.message ?? "Peak Exon Num analysis failed.");
      }

      setPeakExonNumResult(result.chartPayload, result.summary);
      addLog(
        "success",
        `[Peak Exon Num] Completed ${result.summary.sampleCount} sample(s), ${result.summary.intervalCount} intervals, ${result.summary.transcriptCount} transcripts.`
      );
    } catch (error) {
      const result = responsePath
        ? await tryReadModuleRunResult(responsePath, coercePeakExonNumRunResult)
        : null;
      const message =
        result?.message ??
        (error instanceof Error ? error.message : String(error));

      setRunError(message);
      addLog("error", `[Peak Exon Num] ${message}`);
    }
  }

  async function exportChart() {
    const svgElement = chartRef.current?.querySelector("svg");
    if (!svgElement || !peakExonNumPayload) {
      return;
    }

    try {
      const didExport = await exportPeakExonChart({
        dataPayload: peakExonNumPayload,
        svgElement,
        exportState,
        dialogTitle: "Export Peak Exon Num",
        fileStem: "peak_exon_num",
        defaultWidth: 1200,
        defaultHeight: 620,
        logLabel: "Peak Exon Num",
        addLog
      });
      if (didExport) {
        setIsExportDialogOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      addLog("error", `[Peak Exon Num] ${message}`);
    }
  }

  return (
    <section className="module-page analysis-module-page">
      <div className="module-page__hero module-page__hero--with-action">
        <div className="module-page__hero-copy">
          <h1>Peak Exon Num</h1>
          <p>
            Compare transcript exon-count distributions for transcripts linked
            to peak overlaps in each BED sample.
          </p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={() => void runPeakExonNum()}
        >
          <Play size={14} />
          Run Peak Exon Num
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
          peakExonNumPayload ? "" : " analysis-result-card--pending"
        }`}
      >
        <div className="config-card__head config-card__head--with-action">
          <div className="config-card__icon">
            <BarChart3 size={18} />
          </div>
          <div className="config-card__copy">
            <h3>Rendered Result</h3>
            <p>Boxplot of transcript exon counts for each sample.</p>
          </div>
          {peakExonNumPayload ? (
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

        {peakExonNumSummary ? (
          <PeakExonSummaryGrid
            items={[
              { label: "Species", value: peakExonNumSummary.species },
              { label: "Samples", value: String(peakExonNumSummary.sampleCount) },
              {
                label: "Intervals",
                value: String(peakExonNumSummary.intervalCount)
              },
              {
                label: "Transcripts",
                value: String(peakExonNumSummary.transcriptCount)
              }
            ]}
          />
        ) : null}

        <div className="peak-distribution-stage">
          {peakExonNumPayload ? (
            <div ref={chartRef} className="peak-distribution-stage__figure">
              <BoxplotChart payload={peakExonNumPayload} />
            </div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-placeholder__frame">
                <span>
                  Run Peak Exon Num to render the exon-count distribution chart.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {isExportDialogOpen ? (
        <PeakExonExportDialog
          title="Peak Exon Num export"
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
