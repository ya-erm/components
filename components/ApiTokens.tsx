"use client";

import { useState } from "react";
import type { ApiTokenInfo } from "@/lib/api-tokens";
import { isTokenActive } from "@/lib/token-expiry";
import { Button } from "./ui/Button";
import { Field, Input, Select } from "./ui/Field";

export function ApiTokens({ initialTokens }: { initialTokens: ApiTokenInfo[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setSecret("");
    try {
      const response = await fetch("/api/settings/tokens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresInDays: days === "never" ? null : Number(days) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось создать токен");
      const { token, ...info } = result as ApiTokenInfo & { token: string };
      setTokens((current) => [...current.filter((entry) => isTokenActive(entry.expiresAt)), info]);
      setSecret(token);
      setName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сети");
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/settings/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Не удалось отозвать токен");
      setTokens((current) => current.filter((entry) => entry.id !== id));
      setSecret("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сети");
    } finally { setBusy(false); }
  }

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/tokens", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editingName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось переименовать токен");
      setTokens((current) => current.map((token) => token.id === result.id ? result : token));
      setEditingId(null);
      setMessage("Название токена сохранено");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сети");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-muted)]">
        Токен даёт агенту полный доступ к вашему каталогу. Его можно отозвать в любой момент.
      </p>
      <a href="/docs/api" target="_blank" rel="noreferrer" className="text-sm text-[var(--color-accent)]">Документация API ↗</a>
      <form onSubmit={create} className="flex flex-col gap-3">
        <Field label="Название токена" htmlFor="token-name">
          <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Codex" required maxLength={100} disabled={busy} />
        </Field>
        <Field label="Срок действия" htmlFor="token-days">
          <Select id="token-days" value={days} onChange={(event) => setDays(event.target.value)} disabled={busy}>
            <option value="30">30 дней</option><option value="90">90 дней</option><option value="365">1 год</option>
            <option value="never">Бессрочно</option>
          </Select>
        </Field>
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Сохраняем…" : "Выпустить токен"}</Button>
      </form>
      {secret ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] p-3">
          <p className="text-sm">Сохраните токен сейчас: повторно показать его нельзя.</p>
          <Input aria-label="Новый API-токен" readOnly value={secret} onFocus={(event) => event.currentTarget.select()} className="font-mono text-sm" />
          <Button variant="secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(secret); setMessage("Токен скопирован"); }
            catch { setMessage("Не удалось скопировать. Выделите токен и скопируйте вручную."); }
          }}>Скопировать</Button>
          <Button variant="ghost" onClick={() => setSecret("")}>Скрыть токен</Button>
        </div>
      ) : null}
      <p className="text-sm" role="status" aria-live="polite">{message}</p>
      <ul className="flex flex-col gap-3">
        {tokens.map((token) => (
          <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
            {editingId === token.id ? <form onSubmit={rename} className="flex w-full flex-wrap items-center gap-2">
              <Input aria-label="Новое название токена" className="min-w-0 flex-1 basis-40" value={editingName} onChange={(event) => setEditingName(event.target.value)} required maxLength={100} disabled={busy} autoFocus />
              <Button type="submit" variant="secondary" disabled={busy || !editingName.trim()}>Сохранить</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>Отмена</Button>
            </form> : <>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{token.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{token.prefix} · {token.expiresAt === null ? "Бессрочно" : `до ${token.expiresAt.slice(0, 10)}`}</p>
            </div>
            <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditingId(token.id); setEditingName(token.name); }} aria-label={`Переименовать токен ${token.name}`}>Переименовать</Button>
            <Button variant="danger-outline" disabled={busy} onClick={() => revoke(token.id)} aria-label={`Отозвать токен ${token.name}`}>Отозвать</Button>
            </div>
            </>}
          </li>
        ))}
      </ul>
      {!tokens.length ? <p className="text-sm text-[var(--color-muted)]">Токенов пока нет.</p> : null}
    </div>
  );
}
