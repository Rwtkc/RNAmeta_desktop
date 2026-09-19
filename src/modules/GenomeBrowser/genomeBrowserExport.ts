import { buildMetaPlotPdfBytes, buildMetaPlotPngBytes } from "@/lib/metaPlotExport";
import type { TranscriptWorkspace } from "./genomeBrowserTypes";
import { decorateTranscriptRegionSvg } from "./genomeBrowserTranscriptOverlay";

export type GenomeBrowserImageFormat = "png" | "pdf";

export function normalizeGenomeBrowserFilename(value: string, format: GenomeBrowserImageFormat) {
  const stripped = String(value || "igv-browser").trim().replace(/\.(png|pdf)$/i, "");
  return `${stripped || "igv-browser"}.${format}`;
}

function browserSvgMarkup(browser: any, workspace: TranscriptWorkspace) {
  const raw = browser?.toSVG?.();
  if (!raw) throw new Error("The IGV view is not ready to export.");
  const documentNode = new DOMParser().parseFromString(raw, "image/svg+xml");
  const root = documentNode.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") throw new Error("IGV export did not produce an SVG view.");
  const svg = root as unknown as SVGSVGElement;
  const viewBox = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
  const boxWidth = viewBox.length === 4 ? viewBox[2] : 0;
  const boxHeight = viewBox.length === 4 ? viewBox[3] : 0;
  const column = browser?.columnContainer?.getBoundingClientRect?.() || {};
  const width = Number(svg.getAttribute("width")) || boxWidth || Number(column.width) || 1;
  const height = Number(svg.getAttribute("height")) || boxHeight || Number(column.height) || 1;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${boxWidth || width} ${boxHeight || height}`);
  decorateTranscriptRegionSvg(svg, browser, workspace.segments, workspace.transcriptLength);
  return { markup: new XMLSerializer().serializeToString(svg), width, height };
}

export async function buildGenomeBrowserImageBytes(
  browser: any,
  workspace: TranscriptWorkspace,
  format: GenomeBrowserImageFormat,
  scale = 2
) {
  const source = browserSvgMarkup(browser, workspace);
  const safeScale = Math.max(1, Math.min(Number(scale) || 1, 4));
  if (format === "pdf") {
    return buildMetaPlotPdfBytes(source.markup, source.width, source.height, 96);
  }
  return buildMetaPlotPngBytes(
    source.markup,
    Math.round(source.width * safeScale),
    Math.round(source.height * safeScale),
    300
  );
}
