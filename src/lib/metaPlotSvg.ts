import type { MetaPlotPayload, MetaPlotSeries } from "@/types/native";
import {
  buildMetaPlotCiAreaPath,
  buildMetaPlotCiPath,
  buildMetaPlotSeriesAreaPath,
  buildMetaPlotSeriesLinePath,
  buildMetaPlotUnitTicks,
  META_PLOT_MARGIN,
  scaleMetaPlotX,
  scaleMetaPlotY
} from "@/lib/metaPlotSvgGeometry";

export const META_PLOT_WIDTH = 1180;
export const META_PLOT_HEIGHT = 470;
export const META_PLOT_PANEL_FILL = "#EBEBEB";
export const META_PLOT_GRID_COLOR = "rgba(255,255,255,0.95)";
export const META_PLOT_AXIS_COLOR = "#4c4c4c";
export const META_PLOT_FONT_FAMILY = "sans-serif";

export {
  buildMetaPlotCiAreaPath,
  buildMetaPlotCiPath,
  buildMetaPlotSeriesAreaPath,
  buildMetaPlotSeriesLinePath,
  buildMetaPlotUnitTicks,
  META_PLOT_MARGIN,
  scaleMetaPlotX,
  scaleMetaPlotY
};

export function escapeMetaPlotXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function metaPlotMinimumComponentHeight(component: string) {
  return (
    {
      promoter: 2,
      tail: 2,
      utr5: 4,
      utr3: 4,
      cds: 6,
      ncrna: 6,
      rna: 6
    }[component] ?? 3
  );
}

export function computeMetaPlotLegendLayouts(series: MetaPlotSeries[], totalWidth: number) {
  const itemGap = 24;
  const rowGap = 28;
  const rectSize = 20;
  const rows: Array<Array<{ series: MetaPlotSeries; itemWidth: number }>> = [];
  let currentRow: Array<{ series: MetaPlotSeries; itemWidth: number }> = [];
  let currentWidth = 0;

  series.forEach((entry) => {
    const label = String(entry?.name || "");
    const itemWidth = Math.max(110, label.length * 8.6 + 46);
    const projectedWidth = currentRow.length ? currentWidth + itemGap + itemWidth : itemWidth;

    if (currentRow.length && projectedWidth > totalWidth) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }

    currentRow.push({ series: entry, itemWidth });
    currentWidth = currentRow.length === 1 ? itemWidth : currentWidth + itemGap + itemWidth;
  });

  if (currentRow.length) {
    rows.push(currentRow);
  }

  return rows.flatMap((row, rowIndex) => {
    const rowWidth = row.reduce(
      (sum, item, index) => sum + item.itemWidth + (index > 0 ? itemGap : 0),
      0
    );
    let cursorX = (totalWidth - rowWidth) / 2;

    return row.map((item, itemIndex) => {
      const layout = {
        series: item.series,
        x: cursorX,
        y: rowIndex * rowGap,
        rectSize,
        rectY: -10,
        textX: 34,
        textY: 0
      };

      cursorX += item.itemWidth + (itemIndex < row.length - 1 ? itemGap : 0);
      return layout;
    });
  });
}

export function buildMetaPlotSvg(
  payload: MetaPlotPayload,
  width = META_PLOT_WIDTH,
  height = META_PLOT_HEIGHT
) {
  const fontFamilyAttr = escapeMetaPlotXml(META_PLOT_FONT_FAMILY);
  const plotWidth = width - META_PLOT_MARGIN.left - META_PLOT_MARGIN.right;
  const plotHeight = height - META_PLOT_MARGIN.top - META_PLOT_MARGIN.bottom;
  const yTicks = buildMetaPlotUnitTicks(payload.yDomain[0], payload.yDomain[1]);
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const componentBase = payload.components?.trackBase ?? -0.03;
  const labelY = payload.components?.labelY ?? -0.08;
  const baselineY = scaleMetaPlotY(componentBase, plotHeight, payload.yDomain);
  const legendY = height - 48;

  const gridXMarkup = xTicks
    .map((tick) => {
      const x = scaleMetaPlotX(tick, plotWidth, payload.xDomain);
      return `<line x1="${x.toFixed(2)}" x2="${x.toFixed(
        2
      )}" y1="${META_PLOT_MARGIN.top}" y2="${(
        META_PLOT_MARGIN.top + plotHeight
      ).toFixed(2)}" stroke="${META_PLOT_GRID_COLOR}" stroke-width="1.1" />`;
    })
    .join("");

  const gridYMarkup = yTicks
    .map((tick) => {
      const y = scaleMetaPlotY(tick, plotHeight, payload.yDomain);
      return `<line x1="${META_PLOT_MARGIN.left}" x2="${(
        width - META_PLOT_MARGIN.right
      ).toFixed(2)}" y1="${y.toFixed(2)}" y2="${y.toFixed(
        2
      )}" stroke="${META_PLOT_GRID_COLOR}" stroke-width="1.1" />`;
    })
    .join("");

  const axisLabels = yTicks
    .map((tick) => {
      const y = scaleMetaPlotY(tick, plotHeight, payload.yDomain);
      return `
        <line x1="${(META_PLOT_MARGIN.left - 6).toFixed(2)}" x2="${META_PLOT_MARGIN.left}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${META_PLOT_AXIS_COLOR}" stroke-width="1.2" />
        <text x="${(META_PLOT_MARGIN.left - 18).toFixed(2)}" y="${(y + 5).toFixed(2)}" fill="${META_PLOT_AXIS_COLOR}" font-size="14" font-family="${fontFamilyAttr}" text-anchor="end">${tick.toFixed(1)}</text>
      `;
    })
    .join("");

  const separatorsMarkup = (payload.components?.separators || [])
    .map((separator) => {
      const x = scaleMetaPlotX(separator.x, plotWidth, payload.xDomain);
      const y1 = scaleMetaPlotY(separator.y1, plotHeight, payload.yDomain);
      const y2 = scaleMetaPlotY(separator.y2, plotHeight, payload.yDomain);
      return `<line x1="${x.toFixed(2)}" x2="${x.toFixed(
        2
      )}" y1="${y1.toFixed(2)}" y2="${y2.toFixed(
        2
      )}" stroke="#111111" stroke-width="1.6" stroke-dasharray="2,6" />`;
    })
    .join("");

  const componentMarkup = (payload.components?.segments || [])
    .map((segment) => {
      const fill =
        segment.component === "promoter" || segment.component === "tail" ? "#111111" : "#ffffff";
      const fillOpacity =
        segment.component === "promoter" || segment.component === "tail"
          ? 1
          : segment.alpha;
      const segmentCenterY = baselineY;
      const segmentHeight = Math.max(
        metaPlotMinimumComponentHeight(segment.component),
        Math.abs(
          scaleMetaPlotY(componentBase - segment.height, plotHeight, payload.yDomain) -
            scaleMetaPlotY(componentBase + segment.height, plotHeight, payload.yDomain)
        )
      );
      const segmentY = Math.round(segmentCenterY - segmentHeight / 2) + 0.5;
      const x1 = scaleMetaPlotX(segment.start, plotWidth, payload.xDomain);
      const x2 = scaleMetaPlotX(segment.end, plotWidth, payload.xDomain);
      const labelX = scaleMetaPlotX(segment.mid, plotWidth, payload.xDomain);
      const labelYPos = scaleMetaPlotY(labelY, plotHeight, payload.yDomain) + 12;

      return `
        <rect
          x="${x1.toFixed(2)}"
          y="${segmentY.toFixed(2)}"
          width="${Math.max(1, x2 - x1).toFixed(2)}"
          height="${Math.max(1, Math.round(segmentHeight)).toFixed(2)}"
          fill="${fill}"
          fill-opacity="${fillOpacity}"
          stroke="#111111"
          stroke-width="1.1"
        />
        <text
          x="${labelX.toFixed(2)}"
          y="${labelYPos.toFixed(2)}"
          text-anchor="middle"
          fill="#222222"
          font-size="14"
          font-weight="700"
          font-family="${fontFamilyAttr}"
        >${escapeMetaPlotXml(segment.label)}</text>
      `;
    })
    .join("");

  const seriesMarkup = payload.series
    .map((series) => {
      const areaPath = buildMetaPlotSeriesAreaPath(series.values, plotWidth, plotHeight, payload);
      const linePath = buildMetaPlotSeriesLinePath(series.values, plotWidth, plotHeight, payload);
      const ciAreaPath = payload.showCI
        ? buildMetaPlotCiAreaPath(series.values, plotWidth, plotHeight, payload)
        : "";
      const ciLowerPath = payload.showCI
        ? buildMetaPlotCiPath(
            series.values,
            "confidenceDown",
            plotWidth,
            plotHeight,
            payload
          )
        : "";
      const ciUpperPath = payload.showCI
        ? buildMetaPlotCiPath(series.values, "confidenceUp", plotWidth, plotHeight, payload)
        : "";

      return `
        ${areaPath ? `<path d="${areaPath}" fill="${series.color}" opacity="0.18" />` : ""}
        ${
          payload.showCI && ciAreaPath
            ? `<path d="${ciAreaPath}" fill="${series.color}" opacity="0.12" />`
            : ""
        }
        ${
          payload.showCI && ciLowerPath
            ? `<path d="${ciLowerPath}" fill="none" stroke="#4f6db8" stroke-width="1" opacity="0.45" />`
            : ""
        }
        ${
          payload.showCI && ciUpperPath
            ? `<path d="${ciUpperPath}" fill="none" stroke="#111111" stroke-width="1" opacity="0.45" />`
            : ""
        }
        <path
          d="${linePath}"
          fill="none"
          stroke="${series.color}"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      `;
    })
    .join("");

  const legendMarkup = computeMetaPlotLegendLayouts(
    payload.series,
    width - META_PLOT_MARGIN.left - META_PLOT_MARGIN.right
  )
    .map((entry) => {
      const x = META_PLOT_MARGIN.left + entry.x;
      const y = legendY + entry.y;
      return `
        <g transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})">
          <rect
            x="0"
            y="${entry.rectY}"
            width="${entry.rectSize}"
            height="${entry.rectSize}"
            fill="${entry.series.color}"
            fill-opacity="0.18"
            stroke="${entry.series.color}"
            stroke-width="2"
          />
          <text
            x="${entry.textX}"
            y="${entry.textY}"
            fill="#222222"
            dominant-baseline="middle"
            font-size="15"
            font-weight="700"
            font-family="${fontFamilyAttr}"
          >${escapeMetaPlotXml(entry.series.name)}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <g>
        <rect
          x="${META_PLOT_MARGIN.left}"
          y="${META_PLOT_MARGIN.top}"
          width="${plotWidth}"
          height="${plotHeight}"
          fill="${META_PLOT_PANEL_FILL}"
          stroke="none"
        />
        ${gridXMarkup}
        ${gridYMarkup}
        ${seriesMarkup}
        ${separatorsMarkup}
        <line
          x1="${META_PLOT_MARGIN.left}"
          x2="${META_PLOT_MARGIN.left}"
          y1="${META_PLOT_MARGIN.top}"
          y2="${(META_PLOT_MARGIN.top + plotHeight).toFixed(2)}"
          stroke="${META_PLOT_AXIS_COLOR}"
          stroke-width="1.5"
        />
        ${axisLabels}
        ${componentMarkup}
      </g>
      <text
        x="${META_PLOT_MARGIN.left}"
        y="50"
        fill="#111111"
        font-size="15"
        font-weight="700"
        font-family="${fontFamilyAttr}"
      >${escapeMetaPlotXml(payload.title || "")}</text>
      <text
        transform="translate(30, 250) rotate(-90)"
        fill="#111111"
        font-size="15"
        font-weight="700"
        font-family="${fontFamilyAttr}"
      >${escapeMetaPlotXml(payload.yLabel || "")}</text>
      <g>${legendMarkup}</g>
    </svg>
  `.trim();
}
