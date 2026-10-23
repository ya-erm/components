import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesAliKinds, parseAliKinds } from "../lib/aliexpress-filter";

test("several import categories match any chosen kind", () => {
  const kinds = parseAliKinds(["new", "changed"]);
  assert.equal(matchesAliKinds({ kind: "new", ignored: false }, kinds), true);
  assert.equal(matchesAliKinds({ kind: "changed", ignored: false }, kinds), true);
  assert.equal(matchesAliKinds({ kind: "unchanged", ignored: false }, kinds), false);
  assert.equal(matchesAliKinds({ kind: "review", ignored: false }, kinds), false);
});

test("hidden goods are excluded by default and can be combined with visible categories", () => {
  const hidden = { kind: "new" as const, ignored: true };
  assert.equal(matchesAliKinds(hidden, []), false);
  assert.equal(matchesAliKinds(hidden, ["new"]), false);
  assert.equal(matchesAliKinds(hidden, ["hidden", "new"]), true);
  assert.equal(matchesAliKinds({ ...hidden, ignored: false }, ["hidden", "new"]), true);
  assert.equal(matchesAliKinds({ kind: "changed", ignored: false }, ["hidden", "new"]), false);
  assert.equal(matchesAliKinds({ kind: "changed", ignored: false }, []), true);
});

test("old drafts retain their single filter; unknown values and duplicates are ignored", () => {
  assert.deepEqual(parseAliKinds("changed"), ["changed"]);
  assert.deepEqual(parseAliKinds("hidden"), ["hidden"]);
  assert.deepEqual(parseAliKinds(["new", "changed", "new", "invalid", null]), ["new", "changed"]);
  assert.deepEqual(parseAliKinds(""), []);
  assert.deepEqual(parseAliKinds(undefined), []);
  assert.deepEqual(parseAliKinds(["toString", "__proto__"]), []);
});
