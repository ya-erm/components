export function isTokenActive(expiresAt: string | null, now = Date.now()) {
  return expiresAt === null || Date.parse(expiresAt) > now;
}
