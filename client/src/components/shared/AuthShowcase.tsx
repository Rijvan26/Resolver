import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * 33 vertical bars forming the bell curve pyramid arch:
 * - Bars 1 to 11 (Red to Amber blend): Heights 20% to 83%, delays 0.00s to 0.40s
 * - Bars 12 to 22 (Center Peak Region / Amber harmonic apex): Heights 89% to 100% to 89%, delays 0.44s to 0.84s
 * - Bars 23 to 33 (Amber to Green blend): Heights 83% down to 20%, delays 0.88s to 1.28s
 */
const PYRAMID_BARS = [
  // Bars 1 to 11: Ascending Left Wing (Red to Amber blend)
  { height: 20, delay: "0.00s", anim: "pyramid-red-anim" },
  { height: 23, delay: "0.04s", anim: "pyramid-red-anim" },
  { height: 27, delay: "0.08s", anim: "pyramid-red-anim" },
  { height: 32, delay: "0.12s", anim: "pyramid-red-anim" },
  { height: 38, delay: "0.16s", anim: "pyramid-red-anim" },
  { height: 45, delay: "0.20s", anim: "pyramid-red-anim" },
  { height: 53, delay: "0.24s", anim: "pyramid-red-anim" },
  { height: 61, delay: "0.28s", anim: "pyramid-red-anim" },
  { height: 69, delay: "0.32s", anim: "pyramid-red-anim" },
  { height: 76, delay: "0.36s", anim: "pyramid-red-anim" },
  { height: 83, delay: "0.40s", anim: "pyramid-red-anim" },

  // Bars 12 to 22: Center Peak Region (Amber & Tri-color harmony apex)
  { height: 89, delay: "0.44s", anim: "pyramid-amber-anim" },
  { height: 93, delay: "0.48s", anim: "pyramid-amber-anim" },
  { height: 96, delay: "0.52s", anim: "pyramid-amber-anim" },
  { height: 98, delay: "0.56s", anim: "pyramid-amber-anim" },
  { height: 99, delay: "0.60s", anim: "pyramid-amber-anim" },
  { height: 100, delay: "0.64s", anim: "pyramid-amber-anim" },
  { height: 99, delay: "0.68s", anim: "pyramid-amber-anim" },
  { height: 98, delay: "0.72s", anim: "pyramid-amber-anim" },
  { height: 96, delay: "0.76s", anim: "pyramid-amber-anim" },
  { height: 93, delay: "0.80s", anim: "pyramid-amber-anim" },
  { height: 89, delay: "0.84s", anim: "pyramid-amber-anim" },

  // Bars 23 to 33: Descending Right Wing (Amber to Green blend)
  { height: 83, delay: "0.88s", anim: "pyramid-green-anim" },
  { height: 76, delay: "0.92s", anim: "pyramid-green-anim" },
  { height: 69, delay: "0.96s", anim: "pyramid-green-anim" },
  { height: 61, delay: "1.00s", anim: "pyramid-green-anim" },
  { height: 53, delay: "1.04s", anim: "pyramid-green-anim" },
  { height: 45, delay: "1.08s", anim: "pyramid-green-anim" },
  { height: 38, delay: "1.12s", anim: "pyramid-green-anim" },
  { height: 32, delay: "1.16s", anim: "pyramid-green-anim" },
  { height: 27, delay: "1.20s", anim: "pyramid-green-anim" },
  { height: 23, delay: "1.24s", anim: "pyramid-green-anim" },
  { height: 20, delay: "1.28s", anim: "pyramid-green-anim" },
];

export interface AuthShowcaseProps {
  className?: string;
}

/**
 * AuthShowcase
 * Left showcase panel styled with the dashboard background color (bg-page),
 * housing the 33-pillar bell curve arch with pure CSS 10-second unified pyramid wave animation:
 * P1 Critical (Red) -> Investigating (Amber) -> Resolved (Green)
 *
 * Fully respects prefers-reduced-motion and pauses on tab backgrounding.
 */
export const AuthShowcase: React.FC<AuthShowcaseProps> = ({ className }) => {
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Pause animation when browser tab is inactive to save CPU/battery
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <aside
      className={cn(
        "relative w-full md:w-[48%] lg:w-[46%] h-full bg-page rounded-[16px] p-5 md:p-6 lg:p-7 flex flex-col justify-between overflow-hidden text-main-fg border border-border-color shrink-0 select-none",
        !isTabVisible && "auth-anim-paused",
        className
      )}
      aria-hidden="true"
    >
      {/* Ambient multi-color blended floor glow synchronized with stages */}
      <div className="pointer-events-none absolute -bottom-12 inset-x-0 h-52 blur-[60px] glow-pyramid-ambient" />

      {/* ==================================================================
          TOP SECTION: Single Resolver Logo + Headline + Subtext
          ================================================================== */}
      <div className="relative z-10">
        <div className="flex items-center gap-2.5 mb-6 md:mb-7">
          <img
            src="/logo-tight.png"
            alt="Resolver Logo"
            className="h-8 md:h-9 w-auto object-contain shrink-0"
          />
          <span className="font-semibold text-lg md:text-xl tracking-tight text-main-fg">Resolver</span>
        </div>

        <div className="space-y-2.5 max-w-[400px]">
          <h1 className="text-[26px] md:text-[28px] lg:text-[32px] font-bold tracking-tight text-main-fg leading-[1.2]">
            Detect. Respond. Resolve.
          </h1>
          <p className="text-[13px] md:text-sm leading-relaxed text-muted-fg">
            Triage incidents faster, with AI that only suggests and humans who decide.
          </p>
        </div>
      </div>

      {/* ==================================================================
          BOTTOM SECTION: Unified 33-Bar Pyramid / Bell Curve Arch
          ================================================================== */}
      <div className="relative z-10 w-full mt-auto pt-6 flex flex-col justify-end">
        {/* 33 vertical bars smoothly peaking at center #17 (100%) and tapering to sides (20%) */}
        <div className="relative h-[160px] md:h-[190px] lg:h-[230px] w-full flex items-end justify-between gap-[2px] lg:gap-[3px] px-0.5 overflow-visible">
          {/* Baseline subtle glow line */}
          <div
            className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-[#D92D3A]/40 via-[#F59E0B]/50 to-[#10B981]/40 z-10"
            aria-hidden="true"
          />

          {PYRAMID_BARS.map((bar, idx) => (
            <div
              key={idx}
              className={cn("pillar-bar", bar.anim)}
              style={{
                height: `${bar.height}%`,
                animationDelay: bar.delay,
              }}
            />
          ))}
        </div>

        {/* Aligned Status Badges: Synchronized with the 3 incident resolution phases */}
        <div className="grid grid-cols-3 gap-2 md:gap-3 pt-3.5 border-t border-border-color mt-3.5 text-center">
          {/* Group 1 Status: P1 Critical */}
          <div className="badge-p1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-full border transition-all duration-300">
            <span className="dot-p1 w-1.5 h-1.5 rounded-full transition-all duration-300" />
            <span className="text-[11px] font-semibold tracking-tight truncate">
              P1 Critical
            </span>
          </div>

          {/* Group 2 Status: Investigating */}
          <div className="badge-investigating flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-full border transition-all duration-300">
            <span className="dot-investigating w-1.5 h-1.5 rounded-full transition-all duration-300" />
            <span className="text-[11px] font-semibold tracking-tight truncate">
              Investigating
            </span>
          </div>

          {/* Group 3 Status: Resolved */}
          <div className="badge-resolved flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-full border transition-all duration-300">
            <span className="dot-resolved w-1.5 h-1.5 rounded-full transition-all duration-300" />
            <span className="text-[11px] font-semibold tracking-tight truncate">
              Resolved
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AuthShowcase;
