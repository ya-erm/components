"use client";

import { type ReactNode, type TouchEvent, useRef, useState } from "react";
import { Spinner } from "@/components/ui/states";

const REFRESH_THRESHOLD = 72;
const MAX_PULL_DISTANCE = 96;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const startY = useRef<number | null>(null);
  const startedAtTop = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1 || isInteractiveElement(event.target)) return;

    startY.current = event.touches[0].clientY;
    startedAtTop.current = window.scrollY <= 0;
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (startY.current === null || !startedAtTop.current || refreshing) return;

    const deltaY = event.touches[0].clientY - startY.current;
    if (deltaY <= 0 || window.scrollY > 0) {
      setPullDistance(0);
      return;
    }

    const nextDistance = Math.min(MAX_PULL_DISTANCE, Math.round(deltaY * 0.45));
    setPullDistance(nextDistance);

    if (nextDistance > 8) event.preventDefault();
  };

  const handleTouchEnd = () => {
    const shouldRefresh = pullDistance >= REFRESH_THRESHOLD;
    startY.current = null;
    startedAtTop.current = false;

    if (!shouldRefresh) {
      setPullDistance(0);
      return;
    }

    setRefreshing(true);
    window.location.reload();
  };

  return (
    <div
      className="overscroll-y-contain"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchEnd}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="pointer-events-none sticky top-14 z-20 -mt-2 flex items-center justify-center overflow-hidden transition-[height,opacity] duration-150"
        aria-hidden={!refreshing && pullDistance === 0}
        style={{
          height: refreshing ? 40 : Math.min(40, pullDistance),
          opacity: refreshing || pullDistance > 8 ? 1 : 0,
        }}
      >
        <div className="inline-flex min-h-8 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-muted)] shadow-sm">
          {refreshing ? <Spinner /> : pullDistance >= REFRESH_THRESHOLD ? "Отпустите, чтобы обновить" : "Потяните, чтобы обновить"}
        </div>
      </div>

      {children}
    </div>
  );
}

function isInteractiveElement(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea"));
}
