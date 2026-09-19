import { useMemo, useRef, useState } from "react";
import {
  createGeneMatrixBandScale,
  formatGeneMatrixCount,
  normalizeIntersections,
  type UpsetRow
} from "@/components/gene_matrix/geneMatrixChartUtils";
import type { GeneMatrixPayload } from "@/types/native";

const WIDTH = 1120;
const HEIGHT = 700;
const FONT_FAMILY = "sans-serif";
const SAMPLE_COLORS = ["#d94841", "#2563eb", "#f59e0b", "#0f9d78", "#7c3aed"];
const MARGIN = { top: 52, right: 40, bottom: 54, left: 40 };
const TOP_BAR_HEIGHT = 250;
const ROW_HEIGHT = 40;
const DOT_RADIUS = 7.5;
const COLUMN_WIDTH = 132;
const MAX_BLOCK_COLUMNS = 8;
const BLOCK_GAP = 68;
const LEGEND_ITEM_WIDTH = 320;
const LEGEND_SWATCH_WIDTH = 58;
const LEGEND_OFFSET_X = 72;

interface HoverState {
  x: number;
  y: number;
  title: string;
  files: string;
  metric: string;
  count: number;
}

export function GeneMatrixChart({ payload }: { payload: GeneMatrixPayload }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const upsetData = useMemo(() => normalizeIntersections(payload), [payload]);

  const blocks = useMemo(() => {
    const result: UpsetRow[][] = [];
    for (let i = 0; i < upsetData.rows.length; i += MAX_BLOCK_COLUMNS) {
      result.push(upsetData.rows.slice(i, i + MAX_BLOCK_COLUMNS));
    }
    return result;
  }, [upsetData.rows]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    upsetData.sampleLabels.forEach((label, index) => {
      map[label] = SAMPLE_COLORS[index % SAMPLE_COLORS.length];
    });
    return map;
  }, [upsetData.sampleLabels]);

  const globalMaxSize = useMemo(
    () => Math.max(...upsetData.rows.map((r) => r.size), 1),
    [upsetData.rows]
  );

  const legendColumns =
    upsetData.sampleLabels.length >= 4
      ? 2
      : Math.min(3, upsetData.sampleLabels.length);
  const legendTotalWidth = legendColumns * LEGEND_ITEM_WIDTH;
  const maxBlockColumns = Math.max(...blocks.map((b) => b.length), 1);
  const maxBlockWidth = Math.max(420, maxBlockColumns * COLUMN_WIDTH);
  const viewportWidth = Math.max(
    WIDTH,
    maxBlockWidth + MARGIN.left + MARGIN.right,
    legendTotalWidth + MARGIN.left + MARGIN.right
  );
  const matrixHeight = upsetData.sampleLabels.length * ROW_HEIGHT;
  const legendRows = Math.ceil(upsetData.sampleLabels.length / legendColumns);
  const legendHeight = legendRows * 68;
  const blockHeight = TOP_BAR_HEIGHT + 52 + matrixHeight;
  const legendTop =
    MARGIN.top +
    blocks.length * blockHeight +
    Math.max(0, blocks.length - 1) * BLOCK_GAP +
    52;
  const chartHeight = legendTop + legendHeight + MARGIN.bottom;

  function resolveTooltipPosition(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { left: 0, top: 0 };
    }
    return {
      left: clientX - rect.left + 22,
      top: clientY - rect.top - 18
    };
  }

  function handleHover(
    event: React.MouseEvent,
    row: UpsetRow
  ) {
    const pos = resolveTooltipPosition(event.clientX, event.clientY);
    setHover({
      x: pos.left,
      y: pos.top,
      title: row.sets.join(" / "),
      files: row.originalSets?.join(" / ") || "",
      metric: row.sets.length === 1 ? "Genes" : "Shared Genes",
      count: row.size
    });
  }

  if (!upsetData.rows.length || !upsetData.sampleLabels.length) {
    return null;
  }

  function yScaleBar(value: number, blockTop: number, barChartBottom: number) {
    const ratio = value / globalMaxSize;
    return barChartBottom - ratio * TOP_BAR_HEIGHT;
  }

  function niceBarTicks() {
    const ticks: number[] = [];
    const step = globalMaxSize / 5;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(step, 1)));
    const normalized = step / magnitude;
    let niceStep = magnitude;
    if (normalized > 5) niceStep = 10 * magnitude;
    else if (normalized > 2) niceStep = 5 * magnitude;
    else if (normalized > 1) niceStep = 2 * magnitude;

    for (let t = 0; t <= globalMaxSize + niceStep * 0.01; t += niceStep) {
      ticks.push(Math.round(t));
    }
    return ticks;
  }

  const barTicks = niceBarTicks();

  return (
    <div ref={containerRef} className="gene-matrix-venn-chart">
      <svg
        viewBox={`0 0 ${viewportWidth} ${Math.max(HEIGHT, chartHeight)}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Gene Matrix UpSet chart"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {blocks.map((blockRows, blockIndex) => {
          const blockTop = MARGIN.top + blockIndex * (blockHeight + BLOCK_GAP);
          const barChartBottom = blockTop + TOP_BAR_HEIGHT;
          const matrixTop = barChartBottom + 52;
          const blockChartWidth = Math.max(420, blockRows.length * COLUMN_WIDTH);
          const chartBaseLeft = (viewportWidth - blockChartWidth) / 2;
          const x = createGeneMatrixBandScale(
            blockRows.length,
            chartBaseLeft,
            chartBaseLeft + blockChartWidth
          );

          return (
            <g key={`block-${blockIndex}`}>
              {/* Y axis */}
              <line
                x1={chartBaseLeft}
                x2={chartBaseLeft}
                y1={blockTop}
                y2={barChartBottom}
                stroke="#74806f"
                strokeWidth="1.2"
              />
              {barTicks.map((tick) => {
                const ty = yScaleBar(tick, blockTop, barChartBottom);
                return (
                  <g key={`axis-${blockIndex}-${tick}`}>
                    <line
                      x1={chartBaseLeft - 6}
                      x2={chartBaseLeft}
                      y1={ty}
                      y2={ty}
                      stroke="#74806f"
                      strokeWidth="1.2"
                    />
                    <text
                      x={chartBaseLeft - 10}
                      y={ty}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontFamily={FONT_FAMILY}
                      fontSize="14"
                      fontWeight="700"
                      fill="#4f5b4a"
                    >
                      {formatGeneMatrixCount(tick)}
                    </text>
                  </g>
                );
              })}

              {blockIndex === 0 ? (
                <text
                  x={chartBaseLeft + 6}
                  y={blockTop - 30}
                  fontFamily={FONT_FAMILY}
                  fontSize="15"
                  fontWeight="800"
                  fill="#253320"
                >
                  Intersection Size
                </text>
              ) : null}

              {/* X axis baseline */}
              <line
                x1={chartBaseLeft}
                x2={chartBaseLeft + blockChartWidth}
                y1={barChartBottom}
                y2={barChartBottom}
                stroke="#74806f"
                strokeWidth="1.2"
              />

              {/* bars + labels */}
              {blockRows.map((row, rowIndex) => {
                const xPos = x.position(rowIndex);
                const barY = yScaleBar(row.size, blockTop, barChartBottom);
                const barHeight = barChartBottom - barY;
                return (
                  <g key={`bar-${row.id}`}>
                    <rect
                      x={xPos}
                      y={barY}
                      width={x.bandwidth}
                      height={barHeight}
                      fill="#859b7a"
                      opacity="0.88"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => handleHover(e, row)}
                      onMouseMove={(e) => handleHover(e, row)}
                      onMouseLeave={() => setHover(null)}
                    />
                    <text
                      x={xPos + x.bandwidth / 2}
                      y={barY - 10}
                      textAnchor="middle"
                      fontFamily={FONT_FAMILY}
                      fontSize={x.bandwidth >= 22 ? "13" : "11"}
                      fontWeight="800"
                      fill="#5b4a38"
                    >
                      {formatGeneMatrixCount(row.size)}
                    </text>
                  </g>
                );
              })}

              {/* matrix dots + lines */}
              {blockRows.map((row, rowIndex) => {
                const xCenter = x.position(rowIndex) + x.bandwidth / 2;
                const activeYs = upsetData.sampleLabels
                  .filter((label) => row.sets.includes(label))
                  .map(
                    (label) =>
                      matrixTop +
                      upsetData.sampleLabels.indexOf(label) * ROW_HEIGHT +
                      ROW_HEIGHT / 2
                  );
                return (
                  <g key={`matrix-${row.id}`}>
                    {activeYs.length > 1 ? (
                      <line
                        x1={xCenter}
                        x2={xCenter}
                        y1={Math.min(...activeYs)}
                        y2={Math.max(...activeYs)}
                        stroke="#7a6655"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    ) : null}
                    {upsetData.sampleLabels.map((label) => {
                      const cy =
                        matrixTop +
                        upsetData.sampleLabels.indexOf(label) * ROW_HEIGHT +
                        ROW_HEIGHT / 2;
                      const isActive = row.sets.includes(label);
                      return (
                        <circle
                          key={`dot-${row.id}-${label}`}
                          cx={xCenter}
                          cy={cy}
                          r={DOT_RADIUS}
                          fill={
                            isActive
                              ? colorMap[label] || "#859b7a"
                              : "#d9ded3"
                          }
                          stroke={isActive ? "#ffffff" : "#b8c2b1"}
                          strokeWidth={isActive ? 2.2 : 1.1}
                        />
                      );
                    })}
                    <rect
                      x={x.position(rowIndex)}
                      y={matrixTop - 14}
                      width={x.bandwidth}
                      height={matrixHeight + 28}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => handleHover(e, row)}
                      onMouseMove={(e) => handleHover(e, row)}
                      onMouseLeave={() => setHover(null)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Legend */}
        {upsetData.sampleLabels.map((label, index) => {
          const size = upsetData.sampleSizes[label] || 0;
          const column = index % legendColumns;
          const row = Math.floor(index / legendColumns);
          const legendLeft =
            (viewportWidth - legendTotalWidth) / 2 + LEGEND_OFFSET_X;
          const itemLeft = legendLeft + column * LEGEND_ITEM_WIDTH;
          const itemTop = legendTop + row * 68;
          return (
            <g key={`legend-${label}`}>
              <rect
                x={itemLeft}
                y={itemTop + 2}
                width={LEGEND_SWATCH_WIDTH}
                height={16}
                rx={5}
                fill={colorMap[label] || "#859b7a"}
                opacity={0.9}
              />
              <text
                x={itemLeft + LEGEND_SWATCH_WIDTH + 12}
                y={itemTop + 4}
                dominantBaseline="hanging"
                fontFamily={FONT_FAMILY}
                fontSize="13"
                fontWeight="700"
                fill="#253320"
              >
                {label}
              </text>
              <text
                x={itemLeft + LEGEND_SWATCH_WIDTH + 12}
                y={itemTop + 30}
                dominantBaseline="hanging"
                fontFamily={FONT_FAMILY}
                fontSize="13"
                fontWeight="800"
                fill="#5b4a38"
              >
                {formatGeneMatrixCount(size)}
              </text>
            </g>
          );
        })}
      </svg>

      <div
        className="gene-matrix-tooltip"
        data-visible={hover ? "true" : "false"}
        style={
          hover
            ? { left: `${hover.x}px`, top: `${hover.y}px` }
            : undefined
        }
      >
        {hover ? (
          <>
            <div className="gene-matrix-tooltip__label">{hover.title}</div>
            {hover.files && hover.files !== hover.title ? (
              <div className="gene-matrix-tooltip__row gene-matrix-tooltip__row--file">
                <span>Files</span>
                <strong>{hover.files}</strong>
              </div>
            ) : null}
            <div className="gene-matrix-tooltip__row">
              <span>{hover.metric}</span>
              <strong>{formatGeneMatrixCount(hover.count)}</strong>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
