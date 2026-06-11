"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { clsx } from "clsx";

const TRIGGER_DISTANCE = 96;
const REFRESH_HOLD_DISTANCE = 84;
const MAX_PULL_DISTANCE = 142;
const INDICATOR_RELOAD_DELAY = 420;
const SPINNER_SEGMENTS = 8;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"idle" | "pulling" | "refreshing">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const isPulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const pendingDistanceRef = useRef(0);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const setPullDistance = (distance: number, immediate = false) => {
      pullDistanceRef.current = distance;
      pendingDistanceRef.current = distance;

      if (immediate) {
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        applyPullDistance(rootRef.current, distance);
        return;
      }

      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        applyPullDistance(rootRef.current, pendingDistanceRef.current);
      });
    };

    const resetPull = () => {
      isPulling.current = false;
      startY.current = null;
      setPhase("idle");
      setPullDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || isFormControl(event.target)) {
        startY.current = null;
        return;
      }

      startY.current = getScrollTop() <= 0 ? event.touches[0].clientY : null;
      isPulling.current = false;
      setPhase("idle");
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (refreshingRef.current || startY.current === null || event.touches.length !== 1) return;

      const deltaY = event.touches[0].clientY - startY.current;
      if (deltaY <= 0) {
        if (isPulling.current) event.preventDefault();
        setPhase("idle");
        setPullDistance(0);
        return;
      }

      if (getScrollTop() > 0 && !isPulling.current) {
        startY.current = null;
        return;
      }

      if (!isPulling.current) {
        isPulling.current = true;
        setPhase("pulling");
      }
      event.preventDefault();

      const dampedDistance = getElasticPullDistance(deltaY);
      pullDistanceRef.current = dampedDistance;
      setPullDistance(dampedDistance);
    };

    const handleTouchEnd = () => {
      if (refreshingRef.current) return;

      if (isPulling.current && pullDistanceRef.current >= TRIGGER_DISTANCE) {
        refreshingRef.current = true;
        setPhase("refreshing");
        triggerHapticFeedback();
        setPullDistance(REFRESH_HOLD_DISTANCE, true);
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

  const visible = phase !== "idle";
  const refreshing = phase === "refreshing";

  return (
    <div
      ref={rootRef}
      className="relative"
      style={
        {
          "--ptr-content-y": "0px",
          "--ptr-indicator-y": "0px",
          "--ptr-opacity": "0",
          "--ptr-progress": "0",
        } as CSSProperties
      }
    >
      <div
        aria-hidden={!visible}
        className={clsx(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center",
          phase === "pulling"
            ? "transition-opacity duration-100 ease-out"
            : "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
        style={{
          opacity: "var(--ptr-opacity)",
          transform: "translate3d(0, var(--ptr-indicator-y), 0)",
        }}
      >
        <IosActivityIndicator active={refreshing} />
      </div>
      <div
        className={clsx(
          "will-change-transform",
          phase === "pulling"
            ? ""
            : "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
        style={{ transform: "translate3d(0, var(--ptr-content-y), 0)" }}
      >
        {children}
      </div>
    </div>
  );
}

function IosActivityIndicator({ active }: { active: boolean }) {
  return (
    <div className="relative size-8 text-neutral-500 dark:text-neutral-400">
      {Array.from({ length: SPINNER_SEGMENTS }).map((_, index) => {
        return (
          <span
            key={index}
            className={clsx(
              "ptr-ios-spinner-segment absolute left-1/2 top-1/2 h-[11px] w-1 rounded-full bg-current",
              active && "ptr-ios-spinner-segment-active",
            )}
            style={{
              animationDelay: `${(index - SPINNER_SEGMENTS) * 0.1}s`,
              opacity: active ? undefined : `var(--ptr-segment-${index}, 0.1)`,
              transform: `translate(-50%, -50%) rotate(${index * 45}deg) translateY(-10.5px)`,
            }}
          />
        );
      })}
    </div>
  );
}

function applyPullDistance(root: HTMLDivElement | null, distance: number) {
  if (!root) return;

  const progress = Math.min(distance / TRIGGER_DISTANCE, 1);
  root.style.setProperty("--ptr-content-y", `${distance}px`);
  root.style.setProperty("--ptr-indicator-y", `${Math.min(54, distance * 0.54)}px`);
  root.style.setProperty("--ptr-opacity", String(distance > 4 ? Math.min(1, distance / 28) : 0));
  root.style.setProperty("--ptr-progress", String(progress));

  for (let index = 0; index < SPINNER_SEGMENTS; index += 1) {
    const segmentProgress = clamp(progress * SPINNER_SEGMENTS - index, 0, 1);
    root.style.setProperty(`--ptr-segment-${index}`, String(0.08 + segmentProgress * 0.58));
  }
}

function getElasticPullDistance(deltaY: number) {
  const rawDistance = deltaY * 0.62;
  if (rawDistance <= TRIGGER_DISTANCE) return rawDistance;

  const extraDistance = rawDistance - TRIGGER_DISTANCE;
  const easedExtra = (1 - Math.exp(-extraDistance / 72)) * (MAX_PULL_DISTANCE - TRIGGER_DISTANCE);
  return Math.min(MAX_PULL_DISTANCE, TRIGGER_DISTANCE + easedExtra);
}

function getScrollTop() {
  return document.scrollingElement?.scrollTop ?? window.scrollY;
}

function isFormControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select"));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function triggerHapticFeedback() {
  const telegramHaptics = (window as HapticWindow).Telegram?.WebApp?.HapticFeedback;
  if (telegramHaptics?.impactOccurred) {
    telegramHaptics.impactOccurred("light");
    return;
  }

  if ("vibrate" in navigator) navigator.vibrate(10);
}

type HapticWindow = Window & {
  Telegram?: {
    WebApp?: {
      HapticFeedback?: {
        impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
      };
    };
  };
};
