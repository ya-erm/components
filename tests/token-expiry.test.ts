import assert from "node:assert/strict";
import test from "node:test";
import { isTokenActive } from "../lib/token-expiry";

test("explicit permanent tokens remain active; missing or malformed expiration fails closed", () => {
  const now = Date.parse("2026-11-15T12:00:00.000Z");
  assert.equal(isTokenActive(null, now), true);
  assert.equal(isTokenActive("2026-11-16T12:00:00.000Z", now), true);
  for (const value of ["2026-11-15T12:00:00.000Z", "2026-11-14T12:00:00.000Z", "invalid", ""])
    assert.equal(isTokenActive(value, now), false);
  assert.equal(isTokenActive(undefined as unknown as string, now), false);
});
