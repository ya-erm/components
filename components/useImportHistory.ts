"use client";

import { useEffect } from "react";

const STEP_KEY = "aliImportStep";

export type ImportStep = "preview" | { rowId: string; mode: "choose" | "new" };

export function pushImportStep(step: ImportStep) {
  const url = new URL(window.location.href);
  url.hash = step === "preview" ? "ali-preview" : `ali-${step.mode}`;
  window.history.pushState({ ...window.history.state, [STEP_KEY]: step }, "", url);
}

export function backImportStep() {
  if (!window.history.state?.[STEP_KEY]) return false;
  window.history.back();
  return true;
}

export function restoreImportStep(step: ImportStep | null) {
  if (window.history.state?.[STEP_KEY]) return;
  finishImportStep();
  if (step) pushImportStep(step);
}

/** После записи результата текущий шаг больше не должен предлагать запись снова. */
export function finishImportStep() {
  const state = { ...window.history.state };
  delete state[STEP_KEY];
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(state, "", url);
}

export function useImportHistory(onStep: (step: ImportStep | null) => void) {
  useEffect(() => {
    const handlePop = (event: PopStateEvent) => {
      onStep(event.state?.[STEP_KEY] ?? null);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [onStep]);
}
