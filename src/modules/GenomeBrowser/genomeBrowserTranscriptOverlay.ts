import type { TranscriptWorkspace } from "./genomeBrowserTypes";

const REGION_COLORS: Record<string, string> = {
  "5'UTR": "#0072B2",
  CDS: "#009E73",
  "3'UTR": "#D55E00"
};

type TranscriptSegment = TranscriptWorkspace["segments"][number];
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function setSvgAttributes(element: SVGElement, attributes: Record<string, string | number>) {
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
}

function drawTranscriptRegions(
  canvas: HTMLCanvasElement,
  segments: TranscriptSegment[],
  transcriptLength: number
) {
  const validSegments = segments.filter((segment) => Number(segment.end) > Number(segment.start));
  if (!validSegments.length || !(transcriptLength > 0)) return;

  const context = canvas.getContext("2d");
  const pixelRatio = window.devicePixelRatio || 1;
  const width = canvas.width / pixelRatio;
  const height = canvas.height / pixelRatio;
  if (!context || !(width > 0) || !(height > 0)) return;

  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.beginPath();
  context.roundRect(0.5, 0.5, width - 1, height - 1, Math.max(3, (height - 1) / 2));
  context.clip();
  validSegments.forEach((segment) => {
    const start = Math.max(0, Math.min(transcriptLength, Number(segment.start)));
    const end = Math.max(start, Math.min(transcriptLength, Number(segment.end)));
    const x = (start / transcriptLength) * width;
    const segmentWidth = ((end - start) / transcriptLength) * width;
    const label = String(segment.label || "Transcript");
    context.fillStyle = REGION_COLORS[label] || "#7d8974";
    context.fillRect(x, 1, segmentWidth, height - 2);
    if (segmentWidth >= 42) {
      context.fillStyle = "#ffffff";
      context.font = "700 10px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, x + segmentWidth / 2, height / 2);
    }
  });
  context.restore();
}

function drawViewportIndicator(canvas: HTMLCanvasElement, transcriptLength: number, referenceFrame: any) {
  const viewport = canvas.parentElement;
  if (!viewport || !(transcriptLength > 0)) return;
  let indicator = viewport.querySelector<HTMLElement>(".rna-transcript-viewport-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "rna-transcript-viewport-indicator";
    Object.assign(indicator.style, {
      pointerEvents: "none",
      position: "absolute",
      zIndex: "2",
      boxSizing: "border-box",
      border: "2px solid #e53935"
    });
    viewport.appendChild(indicator);
  }

  const viewportStart = Number(referenceFrame?.start);
  const basesPerPixel = Number(referenceFrame?.bpPerPixel);
  const width = canvas.getBoundingClientRect().width;
  const viewportLength = Math.round(basesPerPixel * width);
  if (!Number.isFinite(viewportStart) || !(viewportLength > 0) || viewportLength >= transcriptLength) {
    indicator.style.display = "none";
    return;
  }

  const x = Math.max(0, Math.min(width - 1, Math.floor((viewportStart / transcriptLength) * width)));
  const indicatorWidth = Math.max(1, Math.floor((viewportLength / transcriptLength) * width));
  Object.assign(indicator.style, {
    display: "block",
    left: `${x}px`,
    top: "0",
    width: `${Math.min(indicatorWidth, width - x)}px`,
    height: `${canvas.getBoundingClientRect().height}px`
  });
}

export function decorateTranscriptRegionSvg(
  svg: SVGSVGElement,
  browser: any,
  segments: TranscriptSegment[],
  transcriptLength: number
) {
  const canvas = browser?.columnContainer?.querySelector?.(".igv-ideogram-canvas") as HTMLCanvasElement | null;
  const rootGroup = svg.querySelector<SVGGElement>("#root-group");
  const validSegments = segments.filter((segment) => Number(segment.end) > Number(segment.start));
  if (!canvas || !rootGroup || !validSegments.length || !(transcriptLength > 0)) return;

  const columnBounds = browser.columnContainer.getBoundingClientRect();
  const canvasBounds = canvas.getBoundingClientRect();
  const x = canvasBounds.left - columnBounds.left;
  const y = canvasBounds.top - columnBounds.top;
  const width = canvasBounds.width;
  const height = canvasBounds.height;
  if (!(width > 0) || !(height > 0)) return;

  const suffix = `-${Date.now()}`;
  const clipId = `rnameta-transcript-regions${suffix}`;
  const defs = svg.querySelector("defs") || svg.insertBefore(document.createElementNS(SVG_NAMESPACE, "defs"), svg.firstChild);
  const clipPath = document.createElementNS(SVG_NAMESPACE, "clipPath");
  const clipRect = document.createElementNS(SVG_NAMESPACE, "rect");
  setSvgAttributes(clipPath, { id: clipId });
  setSvgAttributes(clipRect, { x: x + 0.5, y: y + 0.5, width: width - 1, height: height - 1, rx: Math.max(3, (height - 1) / 2) });
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  const overlay = document.createElementNS(SVG_NAMESPACE, "g");
  overlay.setAttribute("clip-path", `url(#${clipId})`);
  validSegments.forEach((segment) => {
    const start = Math.max(0, Math.min(transcriptLength, Number(segment.start)));
    const end = Math.max(start, Math.min(transcriptLength, Number(segment.end)));
    const segmentX = x + (start / transcriptLength) * width;
    const segmentWidth = ((end - start) / transcriptLength) * width;
    const label = String(segment.label || "Transcript");
    const rect = document.createElementNS(SVG_NAMESPACE, "rect");
    setSvgAttributes(rect, { x: segmentX, y: y + 1, width: segmentWidth, height: height - 2, fill: REGION_COLORS[label] || "#7d8974" });
    overlay.appendChild(rect);
    if (segmentWidth >= 42) {
      const text = document.createElementNS(SVG_NAMESPACE, "text");
      setSvgAttributes(text, {
        x: segmentX + segmentWidth / 2,
        y: y + height / 2,
        fill: "#ffffff",
        "font-family": "sans-serif",
        "font-size": 10,
        "font-weight": 700,
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      });
      text.textContent = label;
      overlay.appendChild(text);
    }
  });
  rootGroup.appendChild(overlay);

  const border = document.createElementNS(SVG_NAMESPACE, "rect");
  setSvgAttributes(border, {
    x: x + 0.5,
    y: y + 0.5,
    width: width - 1,
    height: height - 1,
    rx: Math.max(3, (height - 1) / 2),
    fill: "none",
    stroke: "#2f3930",
    "stroke-opacity": 0.55
  });
  rootGroup.appendChild(border);
}

export function installTranscriptRegionOverlay(
  container: HTMLElement,
  browser: any,
  segments: TranscriptSegment[],
  transcriptLength: number
) {
  const root = container.shadowRoot;
  if (!root) return () => {};
  let frameId: number | null = null;
  const paint = () => {
    frameId = null;
    root.querySelectorAll<HTMLCanvasElement>(".igv-ideogram-canvas").forEach((canvas, index) => {
      drawTranscriptRegions(canvas, segments, transcriptLength);
      drawViewportIndicator(canvas, transcriptLength, browser.referenceFrameList?.[index] || browser.referenceFrameList?.[0]);
    });
  };
  const schedulePaint = () => {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => { frameId = window.requestAnimationFrame(paint); });
  };
  const observer = new MutationObserver(schedulePaint);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height"] });
  const resizeObserver = new ResizeObserver(schedulePaint);
  resizeObserver.observe(container);
  browser.on?.("locuschange", schedulePaint);
  schedulePaint();
  window.setTimeout(schedulePaint, 120);
  window.setTimeout(schedulePaint, 500);
  return () => {
    observer.disconnect();
    resizeObserver.disconnect();
    browser.off?.("locuschange", schedulePaint);
    if (frameId !== null) window.cancelAnimationFrame(frameId);
  };
}
