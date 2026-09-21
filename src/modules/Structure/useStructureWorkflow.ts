import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { readFile, readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { SPECIES_OPTIONS } from "@/data/species";
import { useRAnalysis } from "@/hooks/useRAnalysis";
import { resolveSessionCachePath } from "@/lib/sessionCache";
import { inspectGenomeReference } from "@/modules/GenomeBrowser/genomeBrowserReference";
import { normalizeGenomeBrowserEngineLine } from "@/modules/GenomeBrowser/genomeBrowserRuntime";
import type { BedRow, GenomeReferenceState } from "@/modules/GenomeBrowser/genomeBrowserTypes";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";
import { fileName, normalizeStructureEngineLine } from "./structureRuntime";
import type { StructureMappingResult, StructureResult, StructureWorkspace } from "./structureTypes";

interface StructureBedCache {
  rows: BedRow[];
  selectedRow: BedRow | null;
  result: StructureResult | null;
  mappingCachePath: string;
  mappingGffPath: string;
  hasMapped: boolean;
}

export function useStructureWorkflow() {
  const { annotationDir, annotationValidation, selectedFiles, savedFiles, species } = useAppStore();
  const analysisFiles = useMemo(
    () => (savedFiles.length ? savedFiles : selectedFiles).filter((path) => /\.bed$/i.test(path)),
    [savedFiles, selectedFiles]
  );
  const [bedPath, setBedPath] = useState("");
  const [reference, setReference] = useState<GenomeReferenceState | null>(null);
  const [rows, setRows] = useState<BedRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<BedRow | null>(null);
  const [result, setResult] = useState<StructureResult | null>(null);
  const [mappingCachePath, setMappingCachePath] = useState("");
  const [mappingGffPath, setMappingGffPath] = useState("");
  const [hasMapped, setHasMapped] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [isFolding, setIsFolding] = useState(false);
  const [error, setError] = useState("");
  const bedCacheRef = useRef(new Map<string, StructureBedCache>());
  const activeBedPathRef = useRef("");
  const { isRunning, runShellCommand } = useRAnalysis();
  const { addLog } = useLogStore();
  const selectedSpecies = useMemo(
    () => SPECIES_OPTIONS.find((option) => option.label === species) ?? null,
    [species]
  );
  const selectedSpeciesId = selectedSpecies?.id ?? "";

  useEffect(() => {
    if (!bedPath || !analysisFiles.includes(bedPath)) setBedPath(analysisFiles[0] || "");
  }, [analysisFiles, bedPath]);

  useEffect(() => {
    const previousBedPath = activeBedPathRef.current;
    if (previousBedPath && previousBedPath !== bedPath) {
      bedCacheRef.current.set(previousBedPath, {
        rows,
        selectedRow,
        result,
        mappingCachePath,
        mappingGffPath,
        hasMapped
      });
    }
    activeBedPathRef.current = bedPath;
    const cached = bedPath ? bedCacheRef.current.get(bedPath) : null;
    setRows(cached?.rows ?? []);
    setSelectedRow(cached?.selectedRow ?? null);
    setResult(cached?.result ?? null);
    setHasMapped(cached?.hasMapped ?? false);
    setMappingCachePath(cached?.mappingCachePath ?? "");
    setMappingGffPath(cached?.mappingGffPath ?? "");
    setError("");
  }, [bedPath]);

  useEffect(() => {
    let cancelled = false;
    bedCacheRef.current.clear();
    setRows([]);
    setSelectedRow(null);
    setResult(null);
    setHasMapped(false);
    setMappingCachePath("");
    setMappingGffPath("");
    setError("");
    if (!annotationDir || !selectedSpeciesId) {
      setReference(null);
      return () => { cancelled = true; };
    }
    void inspectGenomeReference(annotationDir, selectedSpeciesId).then((state) => {
      if (!cancelled) setReference(state);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { cancelled = true; };
  }, [annotationDir, selectedSpeciesId]);

  async function runMapping() {
    if (isRunning || isMapping || !bedPath) return;
    setHasMapped(true);
    setIsMapping(true);
    setRows([]);
    setSelectedRow(null);
    setResult(null);
    setError("");
    try {
      if (!selectedSpeciesId) throw new Error("Please select a supported species before running Structure.");
      if (!annotationValidation?.isValid || !annotationDir) {
        throw new Error("Complete Project Configuration validation before running Structure.");
      }
      const state = await inspectGenomeReference(annotationDir, selectedSpeciesId);
      setReference(state);
      if (state.missing.length) throw new Error(`Reference files are missing: ${state.missing.join(", ")}`);
      const runId = `structure-map-${Date.now()}`;
      const requestPath = await resolveSessionCachePath(await join("structure", `${runId}.request.json`));
      const responsePath = await resolveSessionCachePath(await join("structure", `${runId}.response.json`));
      const stagedBedPath = await resolveSessionCachePath(await join("structure", `${runId}.bed`));
      const annotationSuffix = state.files.gff3.toLowerCase().endsWith(".gz") ? ".annotation.gz" : ".annotation.gtf";
      const stagedGffPath = await resolveSessionCachePath(await join("structure", `${runId}${annotationSuffix}`));
      const cachePath = await resolveSessionCachePath(await join("structure", `${runId}.transcript-cache.rds`));
      const runnerPath = await invoke<string>("resolve_resource_path", { relativePath: "scripts/genome_browser_mapping_runner.R" });
      await writeFile(stagedBedPath, await readFile(bedPath));
      await writeFile(stagedGffPath, await readFile(state.files.gff3));
      await writeTextFile(requestPath, JSON.stringify({ bedPath: stagedBedPath, gffPath: stagedGffPath, workspaceCachePath: cachePath }));
      addLog("command", `[Structure] Mapping ${fileName(bedPath)} to transcript coordinates.`);
      await runShellCommand("r-engine", [runnerPath, requestPath, responsePath], {
        label: "Structure transcript mapping",
        showConsole: false,
        captureOutput: false,
        onStdout: (line) => { const message = normalizeGenomeBrowserEngineLine(line); if (message) addLog("info", message.replace("[Genome Browser]", "[Structure]")); },
        onStderr: (line) => { const message = normalizeGenomeBrowserEngineLine(line); if (message) addLog("info", message.replace("[Genome Browser]", "[Structure]")); }
      });
      const mapping = JSON.parse(await readTextFile(responsePath)) as StructureMappingResult;
      if (mapping.status !== "ok") throw new Error(mapping.message || "Structure mapping failed.");
      setRows(mapping.rows || []);
      setMappingCachePath(mapping.workspaceCachePath || cachePath);
      setMappingGffPath(mapping.workspaceGffPath || stagedGffPath);
      addLog("success", `[Structure] Mapping completed: ${mapping.total || 0} transcript overlap rows.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      addLog("error", `[Structure] ${message}`);
    } finally {
      setIsMapping(false);
    }
  }

  async function runStructure(row: BedRow) {
    if (isRunning || isFolding) return;
    setSelectedRow(row);
    setResult(null);
    setError("");
    setIsFolding(true);
    try {
      if (!reference || reference.missing.length) throw new Error("Reference files are not ready.");
      const runId = `structure-fold-${Date.now()}`;
      const workspaceRequest = await resolveSessionCachePath(await join("structure", `${runId}.workspace.request.json`));
      const workspaceResponse = await resolveSessionCachePath(await join("structure", `${runId}.workspace.response.json`));
      const outputBase = await resolveSessionCachePath(await join("structure", "transcripts", runId));
      const workspaceRunner = await invoke<string>("resolve_resource_path", {
        relativePath: "scripts/genome_browser_workspace_runner.R"
      });
      await writeTextFile(workspaceRequest, JSON.stringify({
        gffPath: mappingGffPath || reference.files.gff3,
        fastaPath: reference.files.fasta,
        transcriptId: String(row.transcript_id),
        interval: String(row.transcript_interval),
        outputBase,
        workspaceCachePath: mappingCachePath
      }));
      addLog("info", `[Structure] Extracting transcript sequence for ${String(row.transcript_id)}.`);
      await runShellCommand("r-engine", [workspaceRunner, workspaceRequest, workspaceResponse], {
        label: "Structure transcript sequence",
        showConsole: false,
        captureOutput: false,
        onStdout: (line) => { const message = normalizeGenomeBrowserEngineLine(line); if (message) addLog("info", message.replace("[Genome Browser]", "[Structure]")); },
        onStderr: (line) => { const message = normalizeGenomeBrowserEngineLine(line); if (message) addLog("info", message.replace("[Genome Browser]", "[Structure]")); }
      });
      const workspace = JSON.parse(await readTextFile(workspaceResponse)) as StructureWorkspace & { status: string; message?: string };
      if (workspace.status !== "ok") throw new Error(workspace.message || "Transcript sequence extraction failed.");

      const foldRequest = await resolveSessionCachePath(await join("structure", `${runId}.fold.request.json`));
      const foldResponse = await resolveSessionCachePath(await join("structure", `${runId}.fold.response.json`));
      const foldRunner = await invoke<string>("resolve_resource_path", { relativePath: "scripts/structure_fold_runner.R" });
      const rnafoldPath = await invoke<string>("resolve_resource_path", { relativePath: "external/viennarna/RNAfold.exe" });
      await writeTextFile(foldRequest, JSON.stringify({
        fastaPath: workspace.fastaPath,
        rnafoldPath,
        transcriptId: String(row.transcript_id),
        interval: String(row.transcript_interval)
      }));
      addLog("command", `[Structure] Running bundled RNAfold for ${String(row.transcript_id)}.`);
      await runShellCommand("r-engine", [foldRunner, foldRequest, foldResponse], {
        label: "Structure RNAfold",
        showConsole: false,
        captureOutput: false,
        onStdout: (line) => { const message = normalizeStructureEngineLine(line); if (message) addLog("info", message); },
        onStderr: (line) => { const message = normalizeStructureEngineLine(line); if (message) addLog("info", message); }
      });
      const nextResult = JSON.parse(await readTextFile(foldResponse)) as StructureResult;
      if (nextResult.status !== "ok") throw new Error(nextResult.message || "RNAfold failed.");
      setResult(nextResult);
      addLog("success", `[Structure] RNAfold completed for ${nextResult.transcriptId} (${nextResult.transcriptLength} nt).`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      addLog("error", `[Structure] ${message}`);
    } finally {
      setIsFolding(false);
    }
  }

  return {
    analysisFiles, bedPath, setBedPath, reference, rows, selectedRow, setSelectedRow,
    result, setResult, mappingCachePath, mappingGffPath, hasMapped, isMapping,
    isFolding, setIsFolding, error, setError, isRunning, runShellCommand, addLog,
    selectedSpeciesId, annotationDir, annotationValidation, runMapping, runStructure
  };
}
