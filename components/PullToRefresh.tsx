"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { clsx } from "clsx";
import { Spinner } from "@/components/ui/states";

const TRIGGER_DISTANCE = 82;
const MAX_PULL_DISTANCE = 118;
const INDICATOR_RELOAD_DELAY = 120;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const isPulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const resetPull = () => {
      isPulling.current = false;
      startY.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || isFormControl(event.target)) {
        startY.current = null;
        return;
      }

      startY.current = getScrollTop() <= 0 ? event.touches[0].clientY : null;
      isPulling.current = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (refreshingRef.current || startY.current === null || event.touches.length !== 1) return;

      const deltaY = event.touches[0].clientY - startY.current;
      if (deltaY <= 0) {
        if (isPulling.current) event.preventDefault();
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      if (getScrollTop() > 0 && !isPulling.current) {
        startY.current = null;
        return;
      }

      isPulling.current = true;
      event.preventDefault();

      const dampedDistance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.58);
      pullDistanceRef.current = dampedDistance;
      setPullDistance(dampedDistance);
    };

    const handleTouchEnd = () => {
      if (refreshingRef.current) return;

      if (isPulling.current && pullDistanceRef.current >= TRIGGER_DISTANCE) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullDistance(TRIGGER_DISTANCE);
        window.setTimeout(() => window.location.reload(), INDICATOR_RELOAD_DELAY);
        return;
      }

      resetPull();
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", resetPull);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
    };
  }, []);

  const progress = Math.min(pullDistance / TRIGGER_DISTANCE, 1);
  const visible = refreshing || pullDistance > 4;
  const arrowRotation = -70 + progress * 340;

  return (
    <>
      <div
        aria-hidden={!visible}
        className={clsx(
          "pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.25rem)] z-30 -translate-x-1/2 transition-[opacity,transform] duration-150",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{
          transform: `translateX(-50%) translateY(${Math.min(pullDistance * 0.34, 34)}px) scale(${
            0.82 + progress * 0.18
          })`,
        }}
      >
        <div className="flex size-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)] shadow-lg shadow-black/10">
          {refreshing ? (
            <Spinner className="size-5" />
          ) : (
            <RefreshArrowIcon
              className="size-6"
              style={{ transform: `rotate(${arrowRotation}deg)` }}
            />
          )}
        </div>
      </div>
      {children}
    </>
  );
}

function RefreshArrowIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M19.1 11.4a7.1 7.1 0 1 0-2 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20.6 6.4v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getScrollTop() {
  return document.scrollingElement?.scrollTop ?? window.scrollY;
}

function isFormControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select"));
}
