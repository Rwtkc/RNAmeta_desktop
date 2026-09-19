import { useEffect, useRef, type MutableRefObject } from "react";
import * as d3 from "d3";
import {
  hideSiteProfileTooltip,
  resolveSiteProfileHoverDatum,
  showSiteProfileTooltip
} from "@/components/site_profile/siteProfileTooltip";
import {
  normalizeDensityValues,
  normalizeDomain
} from "@/components/site_profile/siteProfileChartData";
import {
  HEATMAP_AXIS_LINE_STROKE_WIDTH,
  HEATMAP_AXIS_TICK_FONT_WEIGHT,
  HEATMAP_AXIS_TICK_STROKE_WIDTH,
  SITE_PROFILE_AXIS_TICK_FONT_SIZE_PX,
  STACKED_DENSITY_MARGIN,
  STACKED_SITE_PROFILE_WIDTH,
  getStackedSiteProfileTitleStyle
} from "@/components/site_profile/siteProfileLayout";

const COMPACT_WIDTH = 540;
const STACKED_WIDTH = STACKED_SITE_PROFILE_WIDTH;
const HEIGHT = 320;
const COMPACT_MARGIN = { top: 18, right: 18, bottom: 50, left: 64 };
const GRID_COLOR = "rgba(133, 155, 122, 0.16)";
const AXIS_COLOR = "#41503c";
const FONT_FAMILY = "sans-serif";
const X_AXIS_EDGE_BUFFER = 28;
let clipPathCounter = 0;

type DensityPanelData = {
  title: string;
  xLabel: string;
  yLabel: string;
  xDomain: [number, number];
  yDomain: [number, number];
  yTicks?: number[];
  guideLines?: number[];
  series: Array<{
    name: string;
    originalName: string;
    color: string;
    values: Array<{ x: number; density: number }>;
  }>;
  layoutMode?: "compact" | "stacked";
};

function drawDensityChart(
  svgNode: SVGSVGElement,
  panel: DensityPanelData,
  tooltipRef: MutableRefObject<HTMLDivElement | null>,
  containerRef: MutableRefObject<HTMLDivElement | null>,
  layoutMode: "compact" | "stacked" = "compact",
  marginOverride: typeof COMPACT_MARGIN | null = null,
  pass = 0
) {
  const svg = d3.select(svgNode);
  svg.selectAll("*").remove();
  hideSiteProfileTooltip(tooltipRef.current);

  const series = (panel.series ?? [])
    .map((item) => ({
      ...item,
      values: normalizeDensityValues(item.values)
    }))
    .filter((item) => item.values.length > 0);

  const chartWidth = layoutMode === "stacked" ? STACKED_WIDTH : COMPACT_WIDTH;
  const margin =
    marginOverride ??
    (layoutMode === "stacked" ? STACKED_DENSITY_MARGIN : COMPACT_MARGIN);
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = HEIGHT - margin.top - margin.bottom;
  const x = d3
    .scaleLinear()
    .domain(normalizeDomain(panel.xDomain, [0, 1]))
    .range([0, plotWidth]);
  const xTicks = x.ticks(6);
  const xTickFormat = x.tickFormat(6);
  const yTicks = panel.yTicks?.length ? panel.yTicks : null;
  const yDomain = normalizeDomain(panel.yDomain, [0, 1]);
  const yMax = Math.max(yDomain[1] || 0, d3.max(yTicks ?? []) || 0, 1e-6);
  const y = d3
    .scaleLinear()
    .domain([Math.min(0, yDomain[0] || 0), yMax])
    .nice()
    .range([plotHeight, 0]);
  const layer = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  const clipId = `site-profile-density-clip-${clipPathCounter++}`;

  svg
    .append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", plotWidth)
    .attr("height", plotHeight);

  layer
    .selectAll(".grid-y")
    .data(yTicks ?? y.ticks(5))
    .join("line")
    .attr("x1", 0)
    .attr("x2", plotWidth)
    .attr("y1", (tick) => y(tick))
    .attr("y2", (tick) => y(tick))
    .attr("stroke", GRID_COLOR)
    .attr("stroke-width", 1);

  const yAxisGroup = layer
    .append("g")
    .call(
      d3
        .axisLeft(y)
        .tickValues(yTicks ?? y.ticks(5))
        .tickSize(6)
        .tickPadding(10)
    )
    .call((group) => group.select(".domain").remove())
    .call((group) =>
      group
        .selectAll(".tick line")
        .attr("stroke", AXIS_COLOR)
        .attr("stroke-width", HEATMAP_AXIS_TICK_STROKE_WIDTH)
    )
    .call((group) =>
      group
        .selectAll("text")
        .attr("fill", AXIS_COLOR)
        .style("font-size", `${SITE_PROFILE_AXIS_TICK_FONT_SIZE_PX}px`)
        .style("font-weight", HEATMAP_AXIS_TICK_FONT_WEIGHT)
    );

  yAxisGroup
    .append("line")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", 0)
    .attr("y2", plotHeight)
    .attr("stroke", AXIS_COLOR)
    .attr("stroke-width", HEATMAP_AXIS_LINE_STROKE_WIDTH);

  const xAxisGroup = layer
    .append("g")
    .attr("transform", `translate(0, ${plotHeight})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(xTicks)
        .tickFormat(xTickFormat)
        .tickSize(0)
        .tickPadding(12)
    )
    .call((group) =>
      group
        .select(".domain")
        .attr("stroke", AXIS_COLOR)
        .attr("stroke-width", 1.2)
    )
    .call((group) =>
      group
        .selectAll("text")
        .attr("fill", AXIS_COLOR)
        .style("font-size", `${SITE_PROFILE_AXIS_TICK_FONT_SIZE_PX}px`)
        .style("font-weight", HEATMAP_AXIS_TICK_FONT_WEIGHT)
    );

  layer
    .append("text")
    .attr("x", plotWidth / 2)
    .attr("y", plotHeight + 40)
    .attr("text-anchor", "middle")
    .attr("fill", AXIS_COLOR)
    .style("font-size", "13px")
    .style("font-weight", 700)
    .style("font-family", FONT_FAMILY)
    .text(panel.xLabel || "");

  layer
    .append("text")
    .attr("transform", `translate(${-72}, ${plotHeight / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("fill", AXIS_COLOR)
    .style("font-size", layoutMode === "stacked" ? "15px" : "13px")
    .style("font-weight", 700)
    .style("font-family", FONT_FAMILY)
    .text(panel.yLabel || "");

  (panel.guideLines ?? []).forEach((value) => {
    layer
      .append("line")
      .attr("x1", x(value))
      .attr("x2", x(value))
      .attr("y1", 0)
      .attr("y2", plotHeight)
      .attr("stroke", AXIS_COLOR)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "3,6");
  });

  const line = d3
    .line<{ x: number; density: number }>()
    .x((point) => x(point.x))
    .y((point) => y(point.density))
    .curve(d3.curveMonotoneX);

  const seriesLayer = layer.append("g").attr("clip-path", `url(#${clipId})`);

  series.forEach((item) => {
    seriesLayer
      .append("path")
      .datum(item.values)
      .attr("fill", "none")
      .attr("stroke", item.color)
      .attr("stroke-width", 3.6)
      .attr("d", line);

    seriesLayer
      .append("path")
      .datum(item.values)
      .attr("data-export-ignore", "true")
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 18)
      .attr("stroke-linecap", "round")
      .attr("d", line)
      .style("cursor", "pointer")
      .on("mouseenter", function onMouseEnter(event: MouseEvent) {
        const [pointerX] = d3.pointer(event, layer.node());
        const datum = resolveSiteProfileHoverDatum(item.values, pointerX, x);
        showSiteProfileTooltip(
          tooltipRef.current,
          containerRef.current,
          event,
          panel.title,
          item,
          datum,
          panel.yLabel
        );
        d3.select(this.previousSibling as SVGPathElement).attr("stroke-width", 4.8);
      })
      .on("mousemove", function onMouseMove(event: MouseEvent) {
        const [pointerX] = d3.pointer(event, layer.node());
        const datum = resolveSiteProfileHoverDatum(item.values, pointerX, x);
        showSiteProfileTooltip(
          tooltipRef.current,
          containerRef.current,
          event,
          panel.title,
          item,
          datum,
          panel.yLabel
        );
      })
      .on("mouseleave", function onMouseLeave() {
        hideSiteProfileTooltip(tooltipRef.current);
        d3.select(this.previousSibling as SVGPathElement).attr("stroke-width", 3.6);
      });
  });

  if (layoutMode !== "stacked" && pass < 1) {
    const svgRect = svgNode.getBoundingClientRect();
    let extraLeft = 0;
    let extraRight = 0;

    xAxisGroup.selectAll<SVGTextElement, number>(".tick text").each(function eachTick() {
      const tickRect = this.getBoundingClientRect();
      extraLeft = Math.max(extraLeft, X_AXIS_EDGE_BUFFER - (tickRect.left - svgRect.left));
      extraRight = Math.max(
        extraRight,
        X_AXIS_EDGE_BUFFER - (svgRect.right - tickRect.right)
      );
    });

    if (extraLeft > 0.5 || extraRight > 0.5) {
      drawDensityChart(
        svgNode,
        panel,
        tooltipRef,
        containerRef,
        layoutMode,
        {
          ...margin,
          left: margin.left + Math.max(0, Math.ceil(extraLeft)),
          right: margin.right + Math.max(0, Math.ceil(extraRight))
        },
        pass + 1
      );
    }
  }
}

export function SiteProfileDensityPanel(props: {
  panel: DensityPanelData;
  tooltipRef: MutableRefObject<HTMLDivElement | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const layoutMode =
    props.panel.layoutMode === "stacked" ? "stacked" : "compact";
  const chartWidth = layoutMode === "stacked" ? STACKED_WIDTH : COMPACT_WIDTH;
  const titleStyle =
    layoutMode === "stacked" ? getStackedSiteProfileTitleStyle() : undefined;

  useEffect(() => {
    if (svgRef.current) {
      drawDensityChart(
        svgRef.current,
        props.panel,
        props.tooltipRef,
        props.containerRef,
        layoutMode
      );
    }
  }, [props.containerRef, props.panel, props.tooltipRef, layoutMode]);

  return (
    <section className="site-profile-chart-panel">
      <h3 className="site-profile-chart-panel__title" style={titleStyle}>
        {props.panel.title}
      </h3>
      <svg
        ref={svgRef}
        className="site-profile-chart-panel__svg"
        viewBox={`0 0 ${chartWidth} ${HEIGHT}`}
        preserveAspectRatio="xMinYMin meet"
        role="img"
        aria-label={props.panel.title || "Site profile density chart"}
      />
    </section>
  );
}
