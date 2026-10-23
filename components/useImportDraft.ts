"use client";

import { useEffect, useRef, useState } from "react";

/** Черновик аккаунта в этом браузере; запись в каталог выполняется отдельно. */
export function useImportDraft<T>(
  storageKey: string,
  value: T | null,
  restore: (value: T) => void,
) {
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const lastStored = useRef<string | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const entry = JSON.parse(saved) as { value: T; savedAt: string };
        restoreRef.current(entry.value);
        lastStored.current = JSON.stringify(entry.value);
        setSavedAt(entry.savedAt);
      }
    } catch {
      setStorageError(true);
      // Не перезаписываем исходный черновик, если восстановление/миграция не удались.
      return;
    }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      const serialized = value === null ? null : JSON.stringify(value);
      if (serialized === lastStored.current) return;
      if (value === null) {
        localStorage.removeItem(storageKey);
        setSavedAt(null);
      } else {
        const timestamp = new Date().toISOString();
        localStorage.setItem(
          storageKey, JSON.stringify({ value, savedAt: timestamp }),
        );
        setSavedAt(timestamp);
      }
      lastStored.current = serialized;
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [ready, storageKey, value]);

  return { ready, storageError, savedAt };
}
