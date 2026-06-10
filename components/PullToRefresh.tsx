"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Spinner } from "@/components/ui/states";

const REFRESH_THRESHOLD = 92;
const MAX_PULL_DISTANCE = 132;
const PULL_RESISTANCE = 0.55;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    const canPullFromTop = () => window.scrollY <= 0 && document.documentElement.scrollTop <= 0;

    const setPull = (value: number) => {
      pullDistanceRef.current = value;
      setPullDistance(value);
    };

    const resetPull = () => {
      activeRef.current = false;
      setIsDragging(false);
      setPull(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (isRefreshingRef.current || event.touches.length !== 1 || !canPullFromTop()) return;

      activeRef.current = true;
      startYRef.current = event.touches[0].clientY;
      setIsDragging(true);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (isRefreshingRef.current || event.touches.length !== 1) return;

      const touchY = event.touches[0].clientY;
      const rawDistance = touchY - startYRef.current;

      if (!activeRef.current) {
        if (rawDistance > 0 && canPullFromTop()) {
          activeRef.current = true;
          setIsDragging(true);
        } else {
          return;
        }
      }

      if (rawDistance <= 0) {
        resetPull();
        return;
      }

      // The custom pull indicator replaces native rubber-band overscroll while it is visible.
      event.preventDefault();

      const resistedDistance = Math.min(rawDistance * PULL_RESISTANCE, MAX_PULL_DISTANCE);
      setPull(resistedDistance);
    };

    const onTouchEnd = () => {
      if (!activeRef.current) return;

      if (pullDistanceRef.current >= REFRESH_THRESHOLD) {
        activeRef.current = false;
        setIsDragging(false);
        setIsRefreshing(true);
        setPull(REFRESH_THRESHOLD);
        window.location.reload();
        return;
      }

      resetPull();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", resetPull);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
    };
  }, []);

  const progress = Math.min(pullDistance / REFRESH_THRESHOLD, 1);
  const isVisible = pullDistance > 0 || isRefreshing;
  const indicatorOffset = Math.max(0, pullDistance - 44);
  const arrowRotation = progress * 270;

  return (
    <div className="relative">
      <div
        aria-hidden={!isVisible}
        role="status"
        aria-label={isRefreshing ? "Обновляем страницу" : "Потяните вниз, чтобы обновить"}
        className={clsx(
          "pointer-events-none fixed left-1/2 top-16 z-50 flex size-11 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)] shadow-lg shadow-black/10",
          isVisible ? "opacity-100" : "opacity-0",
          isDragging ? "transition-opacity" : "transition-[opacity,transform] duration-200 ease-out",
        )}
        style={{ transform: `translate3d(-50%, ${indicatorOffset}px, 0) scale(${0.72 + progress * 0.28})` }}
      >
        {isRefreshing ? (
          <Spinner />
        ) : (
          <RefreshArrowIcon
            className="size-6"
            style={{ transform: `rotate(${arrowRotation}deg)` }}
          />
        )}
      </div>
      {children}
    </div>
  );
}

function RefreshArrowIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
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
        d="M19 12a7 7 0 1 1-2.05-4.95"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M19 5v5h-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
