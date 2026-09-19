import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import igv from "igv";
import type { TranscriptWorkspace } from "./genomeBrowserTypes";
import { toIgvUrl } from "./genomeBrowserReference";
import { setupGenomeBrowserTheme } from "./genomeBrowserTheme";
import { buildGenomeBrowserImageBytes, normalizeGenomeBrowserFilename, type GenomeBrowserImageFormat } from "./genomeBrowserExport";
import { installTranscriptRegionOverlay } from "./genomeBrowserTranscriptOverlay";

export function GenomeBrowserViewport({ workspace }: { workspace: TranscriptWorkspace }) {
  const ref = useRef<HTMLDivElement>(null);
  const browserRef = useRef<any>(null);
  const mountIdRef = useRef(0);
  const [error, setError] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveFormat, setSaveFormat] = useState<GenomeBrowserImageFormat>("png");
  const [saveFilename, setSaveFilename] = useState("igv-browser.png");
  const [saveScale, setSaveScale] = useState("2");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saveOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setSaveOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [saveOpen, saving]);

  useEffect(() => {
    const mountId = ++mountIdRef.current;
    let cancelled = false;
    let mountStarted = false;
    let themeCleanup: (() => void) | undefined;
    let transcriptOverlayCleanup: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;

    async function mount() {
      if (!ref.current || mountStarted) return;
      mountStarted = true;
      try {
        if (browserRef.current) {
          igv.removeBrowser(browserRef.current);
          browserRef.current = null;
        }
        ref.current.replaceChildren();
        const transcriptId = workspace.transcriptId;
        const reference = {
          id: transcriptId,
          name: transcriptId,
          fastaURL: toIgvUrl(workspace.fastaPath),
          indexURL: toIgvUrl(workspace.faiPath),
          cytobandURL: toIgvUrl(workspace.cytobandPath),
          chromosomeOrder: [transcriptId]
        };
        const browser = await igv.createBrowser(ref.current, {
          reference,
          locus: `${transcriptId}:1-${workspace.transcriptLength}`,
          loadDefaultGenomes: false,
          showNavigation: true,
          showRuler: true,
          showSequence: true,
          showCytobandNames: false,
          doubleClickDelay: 150,
          tracks: [{
            name: "BED interval",
            url: toIgvUrl(workspace.bedPath),
            format: "bed",
            type: "annotation",
            displayMode: "EXPANDED",
            margin: 30,
            height: Math.max(80, Math.min(180, 46 + workspace.segments.length * 18)),
            color: "#5d7f6b"
          }]
        } as any);
        if (cancelled || mountId !== mountIdRef.current) {
          igv.removeBrowser(browser);
          return;
        }
        browserRef.current = browser;
        themeCleanup = setupGenomeBrowserTheme(ref.current, browser, () => {
          setSaveError("");
          setSaveOpen(true);
        });
        transcriptOverlayCleanup = installTranscriptRegionOverlay(
          ref.current,
          browser,
          workspace.segments,
          workspace.transcriptLength
        );
        (browser as any).resize?.();
        resizeObserver = new ResizeObserver(() => {
          if (!cancelled) (browser as any).resize?.();
        });
        resizeObserver.observe(ref.current);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    void mount();
    return () => {
      cancelled = true;
      themeCleanup?.();
      transcriptOverlayCleanup?.();
      resizeObserver?.disconnect();
      if (mountId === mountIdRef.current && browserRef.current) {
        igv.removeBrowser(browserRef.current);
        browserRef.current = null;
      }
    };
  }, [workspace]);

  async function saveImage() {
    const browser = browserRef.current;
    if (!browser || saving) return;
    const filename = normalizeGenomeBrowserFilename(saveFilename, saveFormat);
    setSaving(true);
    setSaveError("");
    try {
      const selectedPath = await save({
        title: `Save IGV ${saveFormat.toUpperCase()}`,
        defaultPath: filename,
        filters: [{ name: saveFormat.toUpperCase(), extensions: [saveFormat] }]
      });
      if (!selectedPath) return;
      const bytes = await buildGenomeBrowserImageBytes(browser, workspace, saveFormat, Number(saveScale));
      const outputTarget = selectedPath.startsWith("file://") ? new URL(selectedPath) : selectedPath;
      await writeFile(outputTarget, bytes);
      setSaveOpen(false);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  function updateFormat(format: GenomeBrowserImageFormat) {
    setSaveFormat(format);
    setSaveFilename((current) => normalizeGenomeBrowserFilename(current, format));
  }

  return <div className="genome-browser__viewport">
    {error ? <div className="genome-browser__mount-error">{error}</div> : <div ref={ref} className="genome-browser__igv" />}
    {saveOpen ? <div className="genome-browser__dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSaveOpen(false); }}>
      <section className="genome-browser__dialog" role="dialog" aria-modal="true" aria-labelledby="genome-browser-save-title">
        <header className="genome-browser__dialog-header"><h2 id="genome-browser-save-title">Save Image</h2></header>
        <div className="genome-browser__dialog-body">
          <label className="genome-browser__field"><span>Filename</span><input value={saveFilename} onChange={(event) => setSaveFilename(event.target.value)} disabled={saving} /></label>
          <fieldset className="genome-browser__format-group" disabled={saving}><legend>Image format</legend><label><input type="radio" checked={saveFormat === "png"} onChange={() => updateFormat("png")} /> PNG</label><label><input type="radio" checked={saveFormat === "pdf"} onChange={() => updateFormat("pdf")} /> PDF</label></fieldset>
          {saveFormat === "png" ? <label className="genome-browser__field"><span>PNG resolution</span><select value={saveScale} onChange={(event) => setSaveScale(event.target.value)} disabled={saving}><option value="1">1x</option><option value="2">2x</option><option value="3">3x</option><option value="4">4x</option></select></label> : null}
          {saveError ? <div className="genome-browser__dialog-error" role="alert">{saveError}</div> : null}
        </div>
        <footer className="genome-browser__dialog-footer"><button type="button" className="genome-browser__dialog-button" onClick={() => setSaveOpen(false)} disabled={saving}>Cancel</button><button type="button" className="genome-browser__dialog-button genome-browser__dialog-button--primary" onClick={() => void saveImage()} disabled={saving}>{saving ? "Saving…" : "Save"}</button></footer>
      </section>
    </div> : null}
  </div>;
}
