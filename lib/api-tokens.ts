import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getJson, getJsonVersioned, putJsonConditional } from "./s3";
import { isTokenActive } from "./token-expiry";

export const tokenInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(90),
}).strict();

export const tokenRenameSchema = z.object({ id: z.string().uuid(), name: tokenInputSchema.shape.name }).strict();

export type ApiTokenInfo = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
};
type TokenRecord = ApiTokenInfo & { hash: string };
type TokenIndex = { ownerId: string; tokens: TokenRecord[] };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const key = (ownerHash: string) => `api-tokens/${ownerHash}.json`;

export class TokenConflictError extends Error {}

async function mutateTokens<T>(ownerId: string, change: (index: TokenIndex) => T): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = await getJsonVersioned<TokenIndex>(key(digest(ownerId)));
    if (stored.value && !stored.etag) throw new TokenConflictError("Хранилище не вернуло версию токенов");
    const index = stored.value ?? { ownerId, tokens: [] };
    const result = change(index);
    try {
      await putJsonConditional(key(digest(ownerId)), index, stored.etag);
      return result;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 409 && status !== 412) throw error;
    }
  }
  throw new TokenConflictError("Список токенов изменился. Повторите действие.");
}

function publicInfo({ hash: _hash, ...info }: TokenRecord): ApiTokenInfo {
  return info;
}

export async function listApiTokens(ownerId: string): Promise<ApiTokenInfo[]> {
  const index = await getJson<TokenIndex>(key(digest(ownerId)));
  return (index?.tokens ?? []).map(publicInfo);
}

export async function createApiToken(ownerId: string, input: z.input<typeof tokenInputSchema>) {
  const { name, expiresInDays } = tokenInputSchema.parse(input);
  const secret = randomBytes(32).toString("base64url");
  const token = `cwa_${digest(ownerId)}.${secret}`;
  const record: TokenRecord = {
    id: randomUUID(), name, prefix: `cwa_…${secret.slice(-6)}`,
    createdAt: new Date().toISOString(),
    expiresAt: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 86400000).toISOString(),
    hash: digest(token),
  };
  await mutateTokens(ownerId, (index) => {
    index.tokens = index.tokens.filter((entry) => isTokenActive(entry.expiresAt));
    if (index.tokens.length >= 50) throw new TokenConflictError("Можно выпустить не более 50 активных токенов");
    index.tokens.push(record);
  });
  return { token, ...publicInfo(record) };
}

export async function revokeApiToken(ownerId: string, id: string): Promise<boolean> {
  return mutateTokens(ownerId, (index) => {
    const exists = index.tokens.some((entry) => entry.id === id);
    index.tokens = index.tokens.filter((entry) => entry.id !== id);
    return exists;
  });
}

export async function renameApiToken(ownerId: string, input: z.input<typeof tokenRenameSchema>): Promise<ApiTokenInfo | null> {
  const { id, name } = tokenRenameSchema.parse(input);
  return mutateTokens(ownerId, (index) => {
    const record = index.tokens.find((entry) => entry.id === id);
    if (!record) return null;
    record.name = name;
    return publicInfo(record);
  });
}

/** Неверный Bearer никогда не подменяется браузерной сессией. */
export async function apiTokenOwner(authorization: string): Promise<string | null> {
  const match = /^Bearer (cwa_([a-f0-9]{64})\.[A-Za-z0-9_-]{43})$/i.exec(authorization);
  if (!match) return null;
  const index = await getJson<TokenIndex>(key(match[2]));
  if (!index || digest(index.ownerId) !== match[2]) return null;
  const hash = Buffer.from(digest(match[1]), "hex");
  const record = index.tokens.find((entry) => {
    const expected = Buffer.from(entry.hash, "hex");
    return expected.length === hash.length && timingSafeEqual(expected, hash);
  });
  return record && isTokenActive(record.expiresAt) ? index.ownerId : null;
}
