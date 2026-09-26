"use client";

import { useState } from "react";
import { motion } from "motion/react";

// Both icons are built from two 4-point shapes (M, L, L, L, Z) so the path
// command structure stays identical and motion can interpolate `d` smoothly.
// The play triangle is split down its vertical midline into two quadrilaterals,
// so each pause bar morphs into one half of the triangle.
const PAUSE = {
  left: "M5 5L9 5L9 19L5 19Z",
  right: "M15 5L19 5L19 19L15 19Z",
} as const;

const PLAY = {
  // top-left, top-mid, bottom-mid, bottom-left
  left: "M7 5L13 8.5L13 15.5L7 19Z",
  // top-mid, apex, apex, bottom-mid (two corners collapse to the apex)
  right: "M13 8.5L19 12L19 12L13 15.5Z",
} as const;

type SpringConfig = {
  type: "spring";
  stiffness?: number;
  damping?: number;
  mass?: number;
  bounce?: number;
  visualDuration?: number;
};

export type SvgPathMorphingProps = {
  size?: number;
  strokeWidth?: number;
  startPlaying?: boolean;
  spring?: SpringConfig;
  className?: string;
};

const DEFAULT_SPRING: SpringConfig = {
  type: "spring",
  stiffness: 260,
  damping: 26,
  mass: 0.9,
};

export function SvgPathMorphing({
  size = 100,
  strokeWidth = 1.5,
  startPlaying = false,
  spring = DEFAULT_SPRING,
  className,
  isPlaying: controlledPlaying,
  onToggle,
}: SvgPathMorphingProps & { isPlaying?: boolean; onToggle?: () => void }) {
  const isControlled = controlledPlaying !== undefined;
  const [internalPlaying, setInternalPlaying] = useState(startPlaying);
  const isPlaying = isControlled ? controlledPlaying : internalPlaying;
  const target = isPlaying ? PLAY : PAUSE;

  return (
    <button
      type="button"
      onClick={() => {
        if (isControlled) onToggle?.();
        else setInternalPlaying((prev) => !prev);
      }}
      aria-label={isPlaying ? "Pause" : "Play"}
      className={`group text-black dark:text-white ${className ?? ""}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <motion.path
          animate={{ d: target.left }}
          transition={spring}
          initial={false}
        />
        <motion.path
          animate={{ d: target.right }}
          transition={spring}
          initial={false}
        />
      </svg>
    </button>
  );
}

export const controls = {
  size: [100, 16, 120, 2],
  strokeWidth: [1.5, 0, 4, 0.5],
  startPlaying: false,
  spring: { type: "spring", stiffness: 260, damping: 26, mass: 0.9 },
};

export default function SvgPathMorphingDemo(props: SvgPathMorphingProps) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-white dark:bg-black">
      <SvgPathMorphing {...props} />
    </div>
  );
}
