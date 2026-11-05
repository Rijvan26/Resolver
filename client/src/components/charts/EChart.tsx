/**
 * EChart.tsx — shared ReactECharts wrapper with:
 * - Theme awareness (light / dark)
 * - Automatic responsive resizing
 * - Correct cleanup on unmount
 * - Safe option merging (never generates ghost legends that overlap charts)
 */
import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { getChartTheme } from "./chartTheme";

export interface EChartProps {
  option: EChartsOption;
  isDark?: boolean;
  height?: number | string;
  className?: string;
  loading?: boolean;
  notMerge?: boolean;
}

export const EChart: React.FC<EChartProps> = ({
  option,
  isDark = false,
  height = 280,
  className,
  loading = false,
  notMerge = false,
}) => {
  const theme = useMemo(() => getChartTheme(isDark), [isDark]);

  const mergedOption = useMemo<EChartsOption>(() => {
    const result: EChartsOption = {
      backgroundColor: "transparent",
      textStyle: theme.textStyle,
      tooltip: theme.tooltip,
      grid: theme.grid,
      ...option,
    };

    // Only attach legend if the consumer explicitly configured one
    // (prevents ECharts from creating default floating legend items that overlap chart data)
    if (option.legend) {
      result.legend = {
        ...theme.legend,
        ...(typeof option.legend === "object" && !Array.isArray(option.legend)
          ? option.legend
          : {}),
      };
    } else {
      result.legend = { show: false };
    }

    // Merge grid config safely if provided
    if (option.grid) {
      result.grid = {
        ...theme.grid,
        ...(typeof option.grid === "object" && !Array.isArray(option.grid)
          ? option.grid
          : {}),
      };
    }

    return result;
  }, [option, theme]);

  return (
    <ReactECharts
      option={mergedOption}
      notMerge={notMerge}
      lazyUpdate={false}
      className={className}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: "100%",
      }}
      showLoading={loading}
      loadingOption={{
        text: "",
        color: "#6A4CFF",
        maskColor: "rgba(255,255,255,0)",
        zlevel: 0,
      }}
      opts={{ renderer: "canvas" }}
    />
  );
};

export default EChart;
