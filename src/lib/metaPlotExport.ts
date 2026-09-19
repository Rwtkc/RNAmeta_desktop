import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const EXPORT_BACKGROUND = "#fffdf8";
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function parseSvgMarkup(svgMarkup: string) {
  const documentNode = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const parserError = documentNode.querySelector("parsererror");

  if (parserError) {
    throw new Error("Meta Plot SVG markup could not be parsed for export.");
  }

  const svgNode = documentNode.documentElement;
  if (!svgNode || svgNode.tagName.toLowerCase() !== "svg") {
    throw new Error("Meta Plot export did not resolve to an SVG root.");
  }

  return svgNode as unknown as SVGSVGElement;
}

function getSvgIntrinsicSize(svgNode: SVGSVGElement) {
  const viewBox = svgNode.viewBox.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const width = Number(svgNode.getAttribute("width"));
  const height = Number(svgNode.getAttribute("height"));
  if (width > 0 && height > 0) {
    return { width, height };
  }

  throw new Error("Meta Plot export SVG does not expose a valid size.");
}

export function getSvgMarkupIntrinsicSize(svgMarkup: string) {
  return getSvgIntrinsicSize(parseSvgMarkup(svgMarkup));
}

function getSvgTargetSize(svgNode: SVGSVGElement) {
  const width = Number(svgNode.getAttribute("width"));
  const height = Number(svgNode.getAttribute("height"));
  if (width > 0 && height > 0) {
    return { width, height };
  }

  return getSvgIntrinsicSize(svgNode);
}

function cloneSvgNodeForExport(
  svgNode: SVGSVGElement,
  targetWidth?: number,
  targetHeight?: number
) {
  const clone = svgNode.cloneNode(true) as SVGSVGElement;
  const intrinsic = getSvgIntrinsicSize(svgNode);
  const width = Math.max(1, Math.round(targetWidth ?? intrinsic.width));
  const height = Math.max(1, Math.round(targetHeight ?? intrinsic.height));

  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", `${width}`);
  clone.setAttribute("height", `${height}`);
  clone.setAttribute("viewBox", `0 0 ${intrinsic.width} ${intrinsic.height}`);
  clone.setAttribute(
    "preserveAspectRatio",
    svgNode.getAttribute("preserveAspectRatio") || "none"
  );

  const background = clone.ownerDocument.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", `${intrinsic.width}`);
  background.setAttribute("height", `${intrinsic.height}`);
  background.setAttribute("fill", EXPORT_BACKGROUND);
  clone.insertBefore(background, clone.firstChild);

  return clone;
}

function serializeSvg(svgNode: SVGSVGElement) {
  return new XMLSerializer().serializeToString(svgNode);
}

async function svgMarkupToCanvas(
  svgMarkup: string,
  targetWidth?: number,
  targetHeight?: number
) {
  const svgNode = parseSvgMarkup(svgMarkup);
  const clonedSvg = cloneSvgNodeForExport(svgNode, targetWidth, targetHeight);
  const { width: exportWidth, height: exportHeight } = getSvgTargetSize(clonedSvg);
  const serialized = serializeSvg(clonedSvg);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Meta Plot export image load failed."));
      nextImage.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = exportHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Meta Plot export canvas context unavailable.");
    }

    context.fillStyle = EXPORT_BACKGROUND;
    context.fillRect(0, 0, exportWidth, exportHeight);
    context.drawImage(image, 0, 0, exportWidth, exportHeight);

    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function readUint32(source: Uint8Array, offset: number) {
  return (
    ((source[offset] << 24) >>> 0) |
    (source[offset + 1] << 16) |
    (source[offset + 2] << 8) |
    source[offset + 3]
  ) >>> 0;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildPngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32(chunk, 8 + data.length, crc32(crcInput));

  return chunk;
}

function addPngDpiMetadata(pngBytes: Uint8Array, dpi: number) {
  const hasPngSignature =
    pngBytes.length > PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => pngBytes[index] === value);

  if (!hasPngSignature) {
    throw new Error("Meta Plot export did not produce a valid PNG payload.");
  }

  const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
  const physData = new Uint8Array(9);
  writeUint32(physData, 0, pixelsPerMeter);
  writeUint32(physData, 4, pixelsPerMeter);
  physData[8] = 1;
  const physChunk = buildPngChunk("pHYs", physData);

  let offset = PNG_SIGNATURE.length;
  let insertOffset = -1;
  let existingPhysStart = -1;
  let existingPhysEnd = -1;

  while (offset + 12 <= pngBytes.length) {
    const chunkLength = readUint32(pngBytes, offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const chunkEnd = dataStart + chunkLength + 4;
    const type = new TextDecoder().decode(pngBytes.slice(typeStart, typeStart + 4));

    if (type === "pHYs") {
      existingPhysStart = offset;
      existingPhysEnd = chunkEnd;
    }

    if (insertOffset === -1 && type === "IHDR") {
      insertOffset = chunkEnd;
    }

    offset = chunkEnd;
    if (type === "IEND") {
      break;
    }
  }

  if (insertOffset === -1) {
    throw new Error("Meta Plot export PNG metadata insertion failed.");
  }

  const sourceBytes =
    existingPhysStart >= 0
      ? new Uint8Array([
          ...pngBytes.slice(0, existingPhysStart),
          ...pngBytes.slice(existingPhysEnd)
        ])
      : pngBytes;

  const finalInsertOffset =
    existingPhysStart >= 0 && existingPhysStart < insertOffset
      ? insertOffset - (existingPhysEnd - existingPhysStart)
      : insertOffset;

  return new Uint8Array([
    ...sourceBytes.slice(0, finalInsertOffset),
    ...physChunk,
    ...sourceBytes.slice(finalInsertOffset)
  ]);
}

async function canvasToPngBytes(canvas: HTMLCanvasElement, dpi = 300) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error("Meta Plot PNG export blob generation failed."));
      }
    }, "image/png");
  });

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return addPngDpiMetadata(bytes, dpi);
}

export async function buildMetaPlotPngBytes(
  svgMarkup: string,
  width?: number,
  height?: number,
  dpi = 300
) {
  const canvas = await svgMarkupToCanvas(svgMarkup, width, height);
  return canvasToPngBytes(canvas, dpi);
}

export async function buildMetaPlotPdfBytes(
  svgMarkup: string,
  targetWidth?: number,
  targetHeight?: number,
  dpi = 300
) {
  const svgNode = cloneSvgNodeForExport(parseSvgMarkup(svgMarkup), targetWidth, targetHeight);
  const { width: exportWidth, height: exportHeight } = getSvgTargetSize(svgNode);
  const pdfWidthPt = (exportWidth / dpi) * 72;
  const pdfHeightPt = (exportHeight / dpi) * 72;

  const pdf = new jsPDF({
    orientation: pdfWidthPt >= pdfHeightPt ? "landscape" : "portrait",
    unit: "pt",
    format: [pdfWidthPt, pdfHeightPt],
    compress: true
  });

  await svg2pdf(svgNode, pdf, {
    x: 0,
    y: 0,
    width: pdfWidthPt,
    height: pdfHeightPt
  });
  const arrayBuffer = pdf.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}
