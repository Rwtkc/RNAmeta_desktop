import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { readFile, readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Play } from "lucide-react";
import { BedFileSelector } from "@/components/shared/BedFileSelector";
import { SPECIES_OPTIONS } from "@/data/species";
import { useAppStore } from "@/store/useAppStore";
import { GenomeBrowserViewport } from "./GenomeBrowserViewport";
import { GenomeBrowserTable } from "./GenomeBrowserTable";
import { inspectGenomeReference } from "./genomeBrowserReference";
import { normalizeGenomeBrowserEngineLine } from "./genomeBrowserRuntime";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { resolveSessionCachePath } from "@/lib/sessionCache";
import { useLogStore } from "@/store/useLogStore";
import type { BedRow, GenomeReferenceState, TranscriptWorkspace } from "./genomeBrowserTypes";

function GenomeBrowserResultCard() {
  return <section className="config-card genome-browser-result-card">
    <div className="config-card__head"><div><h3>Rendered Result</h3></div></div>
  </section>;
}

interface GenomeBrowserBedCache {
  rows: BedRow[];
  selectedRow: BedRow | null;
  workspace: TranscriptWorkspace | null;
  mappingCachePath: string;
  mappingGffPath: string;
  hasRun: boolean;
}

export function GenomeBrowserModule() {
  const { annotationDir, annotationValidation, selectedFiles, savedFiles, species } = useAppStore();
  const [reference, setReference] = useState<GenomeReferenceState | null>(null);
  const bedFiles = useMemo(
    () => (savedFiles.length ? savedFiles : selectedFiles).filter((path) => /\.bed$/i.test(path)),
    [savedFiles, selectedFiles]
  );
  const [bedPath, setBedPath] = useState("");
  const [rows, setRows] = useState<BedRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<BedRow | null>(null);
  const [workspace, setWorkspace] = useState<TranscriptWorkspace | null>(null);
  const [mappingCachePath, setMappingCachePath] = useState("");
  const [mappingGffPath, setMappingGffPath] = useState("");
  const [error, setError] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const workspaceCacheRef = useRef(new Map<string, TranscriptWorkspace>());
  const bedCacheRef = useRef(new Map<string, GenomeBrowserBedCache>());
  const activeBedPathRef = useRef("");
  const { isRunning, runShellCommand } = useRAnalysis();
  const { addLog } = useLogStore();
  const selectedSpecies = useMemo(
    () => SPECIES_OPTIONS.find((option) => option.label === species) ?? null,
    [species]
  );
  const selectedSpeciesId = selectedSpecies?.id ?? "";
  const isReadyToRun = Boolean(annotationValidation?.isValid && bedPath && selectedSpeciesId);

  useEffect(() => {
    if (!bedPath || !bedFiles.includes(bedPath)) setBedPath(bedFiles[0] || "");
  }, [bedFiles, bedPath]);

  useEffect(() => {
    const previousBedPath = activeBedPathRef.current;
    if (previousBedPath && previousBedPath !== bedPath) {
      bedCacheRef.current.set(previousBedPath, {
        rows,
        selectedRow,
        workspace,
        mappingCachePath,
        mappingGffPath,
        hasRun
      });
    }
    activeBedPathRef.current = bedPath;
    const cached = bedPath ? bedCacheRef.current.get(bedPath) : null;
    setRows(cached?.rows ?? []);
    setSelectedRow(cached?.selectedRow ?? null);
    setWorkspace(cached?.workspace ?? null);
    setMappingCachePath(cached?.mappingCachePath ?? "");
    setMappingGffPath(cached?.mappingGffPath ?? "");
    setHasRun(cached?.hasRun ?? false);
    setError("");
  }, [bedPath]);

  useEffect(() => {
    let cancelled = false;
    bedCacheRef.current.clear();
    workspaceCacheRef.current.clear();
    setHasRun(false);
    setRows([]);
    setSelectedRow(null);
    setWorkspace(null);
    setMappingCachePath("");
    setMappingGffPath("");
    setError("");

    if (!annotationDir || !selectedSpeciesId) {
      setReference(null);
      return () => { cancelled = true; };
    }

    void inspectGenomeReference(annotationDir, selectedSpeciesId)
      .then((state) => {
        if (!cancelled) setReference(state);
      })
      .catch((cause) => {
        if (!cancelled) {
          setReference(null);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => { cancelled = true; };
  }, [annotationDir, selectedSpeciesId]);

  async function runMapping() {
    addLog("command", "[Genome Browser] Refresh requested.");
    if (isRunning || isMapping) return;
    if (!selectedSpeciesId) {
      setError("Please select a supported species before running Genome Browser.");
      addLog("error", "[Genome Browser] No species is selected.");
      return;
    }
    if (!annotationValidation?.isValid || !annotationDir || !bedPath) {
      setError("请先完成 Project Configuration 验证并在 Upload / Run 上传 BED 文件。");
      addLog("error", "[Genome Browser] Project configuration or BED input is incomplete.");
      return;
    }

    setHasRun(true);
    setIsMapping(true);
    setRows([]);
    setSelectedRow(null);
    setWorkspace(null);
    setMappingCachePath("");
    setMappingGffPath("");
    setError("");
    addLog("command", `[Genome Browser] Starting ${selectedSpeciesId} transcript mapping for ${bedPath.split(/[/\\]/).pop()}.`);

    try {
      const state = await inspectGenomeReference(annotationDir, selectedSpeciesId);
      setReference(state);
      if (state.missing.length) {
        throw new Error(`Reference directory is missing: ${state.missing.join(", ")}`);
      }

      const runId = `genome-browser-${Date.now()}`;
      const requestPath = await resolveSessionCachePath(await join("genome-browser", `${runId}.request.json`));
      const responsePath = await resolveSessionCachePath(await join("genome-browser", `${runId}.response.json`));
      const stagedBedPath = await resolveSessionCachePath(await join("genome-browser", `${runId}.bed`));
      const annotationSuffix = state.files.gff3.toLowerCase().endsWith(".gz") ? ".annotation.gz" : ".annotation.gtf";
      const stagedGffPath = await resolveSessionCachePath(await join("genome-browser", `${runId}${annotationSuffix}`));
      const workspaceCachePath = await resolveSessionCachePath(await join("genome-browser", `${runId}.transcript-cache.rds`));
      const runnerPath = await invoke<string>("resolve_resource_path", { relativePath: "scripts/genome_browser_mapping_runner.R" });
      await writeFile(stagedBedPath, await readFile(bedPath));
      await writeFile(stagedGffPath, await readFile(state.files.gff3));
      await writeTextFile(requestPath, JSON.stringify({ bedPath: stagedBedPath, gffPath: stagedGffPath, workspaceCachePath }));
      addLog("info", "[Genome Browser] Inputs staged; launching the portable R runtime.");
      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Genome Browser mapping",
        showConsole: false,
        captureOutput: false,
        onStdout: (line) => {
          const message = normalizeGenomeBrowserEngineLine(line);
          if (message) addLog("info", message);
        },
        onStderr: (line) => {
          const message = normalizeGenomeBrowserEngineLine(line);
          if (message) addLog("info", message);
        }
      });
      const result = JSON.parse(await readTextFile(responsePath));
      if (result.status !== "ok") throw new Error(result.message || "Genome Browser mapping failed.");
      setRows(result.rows || []);
      setMappingCachePath(String(result.workspaceCachePath || workspaceCachePath));
      setMappingGffPath(String(result.workspaceGffPath || stagedGffPath));
      addLog("success", `[Genome Browser] Mapping completed: ${result.total || 0} transcript overlap rows.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setRows([]);
      setError(message);
      addLog("error", `[Genome Browser] ${message}`);
    } finally {
      setIsMapping(false);
    }
  }
  async function openInIgv(row: BedRow) {
    setSelectedRow(row);
    setWorkspace(null);
    setError("");
    try {
      if (!reference || reference.missing.length) throw new Error("Reference files are not ready.");
      const workspaceKey = [
        reference.files.gff3,
        reference.files.fasta,
        row.transcript_id,
        row.transcript_interval
      ].join("::");
      const cachedWorkspace = workspaceCacheRef.current.get(workspaceKey);
      if (cachedWorkspace) {
        setWorkspace(cachedWorkspace);
        return;
      }
      const runId = `genome-browser-selected-${Date.now()}`;
      const requestPath = await resolveSessionCachePath(await join("genome-browser", `${runId}.workspace.request.json`));
      const responsePath = await resolveSessionCachePath(await join("genome-browser", `${runId}.workspace.response.json`));
      const outputBase = await resolveSessionCachePath(await join("genome-browser", "selected-transcripts", runId));
      const runnerPath = await invoke<string>("resolve_resource_path", { relativePath: "scripts/genome_browser_workspace_runner.R" });
      await writeTextFile(requestPath, JSON.stringify({
        gffPath: mappingGffPath || reference.files.gff3,
        fastaPath: reference?.files.fasta,
        transcriptId: String(row.transcript_id),
        interval: String(row.transcript_interval),
        outputBase,
        workspaceCachePath: mappingCachePath
      }));
      addLog("info", `[Genome Browser] Building transcript workspace for ${String(row.transcript_id)}.`);
      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Genome Browser transcript workspace",
        showConsole: false,
        captureOutput: false,
        onStdout: (line) => {
          const message = normalizeGenomeBrowserEngineLine(line);
          if (message) addLog("info", message);
        },
        onStderr: (line) => {
          const message = normalizeGenomeBrowserEngineLine(line);
          if (message) addLog("info", message);
        }
      });
      const result = JSON.parse(await readTextFile(responsePath));
      if (result.status !== "ok") throw new Error(result.message || "Transcript workspace creation failed.");
      const nextWorkspace = result as TranscriptWorkspace;
      workspaceCacheRef.current.set(workspaceKey, nextWorkspace);
      setWorkspace(nextWorkspace);
      addLog("success", `[Genome Browser] Transcript workspace ready: ${String(row.transcript_id)}.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setWorkspace(null);
      setError(message);
      addLog("error", `[Genome Browser] ${message}`);
    }
  }
  return <section className="module-page genome-browser-page">
    <div className="module-page__hero module-page__hero--with-action genome-browser-hero">
      <div className="module-page__hero-copy">
        <span className="genome-browser-hero__context">Transcript coordinate workspace</span>
        <h1>Genome Browser</h1>
        <p>View BED regions on transcripts and explore their sequences, structures, and overlaps in the IGV browser.</p>
      </div>
      <button className="action-button action-button--primary genome-browser-hero__run" type="button" disabled={!isReadyToRun || isRunning || isMapping} onClick={() => void runMapping()}><Play size={14} />Run Genome Browser</button>
    </div>
    {!isReadyToRun ? <div className="inline-alert inline-alert--warning genome-browser-readiness">Complete Project Status validation and upload at least one BED file in Upload / Run to enable analysis.</div> : null}
    <BedFileSelector
      files={bedFiles}
      value={bedPath}
      disabled={isRunning || isMapping}
      onChange={setBedPath}
    />
    {!hasRun ? <GenomeBrowserResultCard /> : null}
    {hasRun && (isMapping || rows.length === 0) ? <GenomeBrowserResultCard /> : null}
    {error ? <div className="inline-alert inline-alert--warning">{error}</div> : null}
    {hasRun && bedPath && rows.length > 0 ? <div className="browser-main">
      <GenomeBrowserTable rows={rows} selectedRow={selectedRow} onSelect={(row) => void openInIgv(row)} />
       {selectedRow && reference && !reference.missing.length ? <section className={`browser-panel browser-panel--canvas${workspace ? "" : " browser-panel--canvas-pending"}`}><div className="browser-panel__eyebrow browser-panel__eyebrow--content">Transcript IGV output</div>{workspace ? <GenomeBrowserViewport key={workspace.bedPath} workspace={workspace} /> : null}</section> : null}
    </div> : null}
  </section>;
}
