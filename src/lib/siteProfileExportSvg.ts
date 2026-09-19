import { resolveSvgDrawBox } from "@/lib/siteProfileExportLayout";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

export const HEATMAP_Y_AXIS_EXPORT_PADDING = {
  top: 8,
  right: 0,
  bottom: 8,
  left: 0
};

export function fitExportSize(
  contentWidth: number,
  contentHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  const scale = Math.min(
    targetWidth / Math.max(1, contentWidth),
    targetHeight / Math.max(1, contentHeight)
  );

  return {
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    widthPx: Math.max(1, Math.round(targetWidth)),
    heightPx: Math.max(1, Math.round(targetHeight))
  };
}

function normalizeExportPadding(
  padding:
    | {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
      }
    | null
) {
  return {
    top: Math.max(0, Number(padding?.top) || 0),
    right: Math.max(0, Number(padding?.right) || 0),
    bottom: Math.max(0, Number(padding?.bottom) || 0),
    left: Math.max(0, Number(padding?.left) || 0)
  };
}

function getSvgIntrinsicSize(svgElement: SVGSVGElement) {
  const viewBox = svgElement.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const widthAttr = Number(svgElement.getAttribute("width"));
  const heightAttr = Number(svgElement.getAttribute("height"));
  if (widthAttr > 0 && heightAttr > 0) {
    return { width: widthAttr, height: heightAttr };
  }

  const bounds = svgElement.getBoundingClientRect();
  return {
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height)
  };
}

export function appendTextNode(input: {
  root: SVGSVGElement;
  text: string;
  rect: DOMRect;
  rootRect: DOMRect;
  scale: number;
  style: CSSStyleDeclaration;
  anchor?: "start" | "end" | "middle";
}) {
  if (!input.text || !input.rect.width || !input.rect.height) {
    return;
  }

  const fontSize = Number.parseFloat(input.style.fontSize || "15") || 15;
  const anchor =
    input.anchor ||
    (input.style.textAlign === "right" ? "end" : "start");
  const x =
    anchor === "end"
      ? (input.rect.right - input.rootRect.left) * input.scale
      : anchor === "middle"
        ? ((input.rect.left + input.rect.right) / 2 - input.rootRect.left) *
          input.scale
        : (input.rect.left - input.rootRect.left) * input.scale;
  const y =
    (input.rect.top - input.rootRect.top) * input.scale +
    fontSize * input.scale * 0.85;

  const node = document.createElementNS(SVG_NS, "text");
  node.setAttribute("x", `${x}`);
  node.setAttribute("y", `${y}`);
  node.setAttribute("fill", input.style.color || "#22301f");
  node.setAttribute("font-size", `${fontSize * input.scale}`);
  node.setAttribute("font-weight", input.style.fontWeight || "700");
  node.setAttribute(
    "font-family",
    input.style.fontFamily || "sans-serif"
  );
  node.setAttribute("text-anchor", anchor);
  node.textContent = input.text;
  input.root.appendChild(node);
}

export function createPositionedExportSvgNode(input: {
  svgElement: SVGSVGElement;
  rect: DOMRect;
  rootRect: DOMRect;
  scale: number;
  exportPadding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  } | null;
  preserveAspectRatio?: string | null;
}) {
  const intrinsic = getSvgIntrinsicSize(input.svgElement);
  const padding = normalizeExportPadding(input.exportPadding ?? null);
  const sourceWidth = intrinsic.width + padding.left + padding.right;
  const sourceHeight = intrinsic.height + padding.top + padding.bottom;
  const drawBox = resolveSvgDrawBox({
    targetLeft: (input.rect.left - input.rootRect.left) * input.scale,
    targetTop: (input.rect.top - input.rootRect.top) * input.scale,
    targetWidth: input.rect.width * input.scale,
    targetHeight: input.rect.height * input.scale,
    sourceWidth,
    sourceHeight,
    sourceContentLeft: padding.left,
    sourceContentTop: padding.top,
    sourceContentWidth: intrinsic.width,
    sourceContentHeight: intrinsic.height,
    preserveAspectRatio: input.preserveAspectRatio
  });

  if (!drawBox) {
    return null;
  }

  const clone = input.svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", XLINK_NS);
  clone.setAttribute(
    "viewBox",
    `${-padding.left} ${-padding.top} ${sourceWidth} ${sourceHeight}`
  );
  clone.setAttribute("x", `${drawBox.left}`);
  clone.setAttribute("y", `${drawBox.top}`);
  clone.setAttribute("width", `${drawBox.width}`);
  clone.setAttribute("height", `${drawBox.height}`);
  clone.setAttribute("preserveAspectRatio", input.preserveAspectRatio || "none");
  return clone;
}

export function createPositionedExportContentGroup(input: {
  svgElement: SVGSVGElement;
  rect: DOMRect;
  rootRect: DOMRect;
  scale: number;
  exportPadding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  } | null;
  preserveAspectRatio?: string | null;
}) {
  const intrinsic = getSvgIntrinsicSize(input.svgElement);
  const padding = normalizeExportPadding(input.exportPadding ?? null);
  const sourceWidth = intrinsic.width + padding.left + padding.right;
  const sourceHeight = intrinsic.height + padding.top + padding.bottom;
  const drawBox = resolveSvgDrawBox({
    targetLeft: (input.rect.left - input.rootRect.left) * input.scale,
    targetTop: (input.rect.top - input.rootRect.top) * input.scale,
    targetWidth: input.rect.width * input.scale,
    targetHeight: input.rect.height * input.scale,
    sourceWidth,
    sourceHeight,
    sourceContentLeft: padding.left,
    sourceContentTop: padding.top,
    sourceContentWidth: intrinsic.width,
    sourceContentHeight: intrinsic.height,
    preserveAspectRatio: input.preserveAspectRatio
  });

  if (!drawBox) {
    return null;
  }

  const clone = input.svgElement.cloneNode(true) as SVGSVGElement;
  const outerGroup = document.createElementNS(SVG_NS, "g");
  const scaleX = drawBox.width / sourceWidth;
  const scaleY = drawBox.height / sourceHeight;
  outerGroup.setAttribute(
    "transform",
    `translate(${drawBox.left} ${drawBox.top})`
  );

  const scaleGroup = document.createElementNS(SVG_NS, "g");
  scaleGroup.setAttribute("transform", `scale(${scaleX} ${scaleY})`);
  outerGroup.appendChild(scaleGroup);

  const contentGroup = document.createElementNS(SVG_NS, "g");
  contentGroup.setAttribute(
    "transform",
    `translate(${padding.left} ${padding.top})`
  );
  scaleGroup.appendChild(contentGroup);

  Array.from(clone.childNodes).forEach((child) => {
    if (
      child.nodeType === 1 &&
      child instanceof SVGElement &&
      child.tagName.toLowerCase() === "defs"
    ) {
      return;
    }

    contentGroup.appendChild(child.cloneNode(true));
  });

  return outerGroup;
}

export function appendLegend(
  root: SVGSVGElement,
  exportElement: HTMLElement,
  rootRect: DOMRect,
  scale: number
) {
  const legendItems = Array.from(
    exportElement.querySelectorAll(".site-profile-d3-chart__legend-item")
  );

  legendItems.forEach((item) => {
    const itemElement = item as HTMLDivElement;
    const itemRect = itemElement.getBoundingClientRect();
    const swatch = itemElement.querySelector(
      ".site-profile-d3-chart__legend-swatch"
    ) as HTMLSpanElement | null;
    const label = itemElement.querySelector(
      ".site-profile-d3-chart__legend-label"
    ) as HTMLSpanElement | null;

    if (swatch) {
      const swatchRect = swatch.getBoundingClientRect();
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", `${(swatchRect.left - rootRect.left) * scale}`);
      rect.setAttribute("y", `${(swatchRect.top - rootRect.top) * scale}`);
      rect.setAttribute("width", `${swatchRect.width * scale}`);
      rect.setAttribute("height", `${swatchRect.height * scale}`);
      rect.setAttribute(
        "rx",
        `${(Math.min(swatchRect.width, swatchRect.height) * scale) / 2}`
      );
      rect.setAttribute(
        "fill",
        window.getComputedStyle(swatch).backgroundColor || "#859b7a"
      );
      root.appendChild(rect);
    }

    if (label) {
      appendTextNode({
        root,
        text: label.textContent?.trim() || "",
        rect: itemRect,
        rootRect,
        scale,
        style: window.getComputedStyle(label)
      });
    }
  });
}
