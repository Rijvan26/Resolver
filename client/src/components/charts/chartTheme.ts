/**
 * Centralized ECharts theme configuration that mirrors the Resolver design system.
 * Uses CSS variable reads at call-time so it always reflects the current theme.
 */

/** Read a CSS variable value from :root at call-time */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

export const CHART_COLORS = {
  accent: "#6A4CFF",
  success: "#1F9D6B",
  muted: "#6B6B72",
  ink: "#111113",
  page: "#ECECE8",
  border: "#EEEEE9",
  // Severity
  p1: "#D92D3A",
  p2: "#E8590C",
  p3: "#C98A00",
  p4: "#3E63DD",
  // Status
  open: "#D92D3A",
  inProgress: "#6A4CFF",
  resolved: "#1F9D6B",
  closed: "#6B6B72",
} as const;

export const PRIORITY_PALETTE = [
  CHART_COLORS.p4,
  CHART_COLORS.p3,
  CHART_COLORS.p2,
  CHART_COLORS.p1,
] as const;

export const STATUS_PALETTE = [
  CHART_COLORS.open,
  CHART_COLORS.inProgress,
  CHART_COLORS.resolved,
  CHART_COLORS.closed,
] as const;

/** Returns the ECharts base theme object for the current color mode */
export function getChartTheme(isDark: boolean) {
  const textColor = isDark ? "rgba(255,255,255,0.75)" : cssVar("--color-muted", "#6B6B72");
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : cssVar("--color-border", "#EEEEE9");
  const bgColor = isDark ? "#1A1A1F" : cssVar("--color-card", "#FFFFFF");
  const tooltipBg = isDark ? "#1A1A1F" : cssVar("--color-sidebar", "#111113");
  const tooltipText = "#FFFFFF";

  return {
    backgroundColor: "transparent",
    textStyle: {
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: 12,
      color: textColor,
    },
    grid: {
      containLabel: true,
      left: 8,
      right: 16,
      top: 12,
      bottom: 8,
    },
    tooltip: {
      backgroundColor: tooltipBg,
      borderColor: "transparent",
      borderWidth: 0,
      textStyle: {
        color: tooltipText,
        fontSize: 12,
        fontFamily: "Inter, sans-serif",
      },
      extraCssText: "border-radius:12px;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,0.18);",
    },
    legend: {
      textStyle: {
        color: textColor,
        fontSize: 12,
      },
      itemGap: 16,
    },
    categoryAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: textColor, fontSize: 11 },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: gridColor, type: "dashed" as const } },
      axisLabel: { color: textColor, fontSize: 11 },
    },
    // used in area/line charts
    _computed: {
      textColor,
      gridColor,
      bgColor,
      tooltipBg,
    },
  };
}

