/**
 * Reusable ECharts formatting, tooltip, and data utilities.
 */

/** Format a YYYY-MM-DD date string to "Jan 5" */
export function formatDateShort(dateStr: string): string {
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/** Create a linear gradient definition for ECharts area fill */
export function areaGradient(color: string, fromOpacity = 0.35, toOpacity = 0.0) {
  return {
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: hexToRgba(color, fromOpacity) },
      { offset: 1, color: hexToRgba(color, toOpacity) },
    ],
  };
}

/** Convert hex color to rgba string */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** ECharts tooltip formatter for a dark-themed tooltip */
export function darkTooltipFormatter(
  params: { name?: string; seriesName?: string; value?: number | string; color?: string }[]
): string {
  if (!params.length) return "";
  const title = params[0].name ?? "";
  const rows = params
    .map(
      (p) =>
        `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:4px">
           <span style="display:flex;align-items:center;gap:6px">
             <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
             <span style="color:rgba(255,255,255,0.75)">${p.seriesName ?? ""}</span>
           </span>
           <span style="font-weight:600;font-variant-numeric:tabular-nums">${p.value}</span>
         </div>`
    )
    .join("");
  return `<div style="font-weight:700;font-size:12px;margin-bottom:2px">${title}</div>${rows}`;
}

/** Default axis label style */
export function axisLabelStyle(textColor: string) {
  return {
    color: textColor,
    fontSize: 11,
    fontFamily: "Inter, sans-serif",
  };
}

