"use client";

export { AnimatePresence, motion, useReducedMotion } from "motion/react";

export const motionDuration = {
  fast: 0.12,
  normal: 0.18,
  overlay: 0.24,
} as const;

export const motionEase = [0.2, 0, 0, 1] as const;

export const subtleOverlayTransition = {
  duration: motionDuration.overlay,
  ease: motionEase,
} as const;
