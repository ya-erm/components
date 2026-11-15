// Requires tests/s3-fixture.mjs and dev server configured for that fixture only.
// Run: node tests/agent-api-fixture.mjs. Never uses production credentials/data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const base = "http://localhost:3000";
const cookies = new Map();
async function session(path, options = {}) {
  const response = await fetch(base + path, {
    ...options, redirect: "manual",
    headers: { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), Origin: base, ...options.headers },
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}
const csrf = await (await session("/api/auth/csrf")).json();
await session("/api/auth/callback/credentials", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken: csrf.csrfToken, login: "demo", password: "demo12345", callbackUrl: base + "/settings" }),
});
assert.equal((await (await session("/api/auth/session")).json()).user.id, "fixture-demo");
assert.equal((await session("/api/components/export")).status, 200);

const json = (body) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const issue = async (name) => {
  const response = await session("/api/settings/tokens", { method: "POST", ...json({ name, expiresInDays: 30 }) });
  assert.equal(response.status, 201);
  return response.json();
};
const token = await issue("Agent API QA");
const datedRename = await session("/api/settings/tokens", { method: "PATCH", ...json({ id: token.id, name: "Renamed dated QA" }) });
assert.equal(datedRename.status, 200);
assert.equal((await datedRename.json()).expiresAt, token.expiresAt);
const permanentResponse = await session("/api/settings/tokens", { method: "POST", ...json({ name: "Permanent QA", expiresInDays: null }) });
assert.equal(permanentResponse.status, 201);
const permanent = await permanentResponse.json();
assert.equal(permanent.expiresAt, null);
assert.equal((await session("/api/settings/tokens", { method: "POST", ...json({ name: "Invalid expiry", expiresInDays: 0 }) })).status, 400);
const renamed = await session("/api/settings/tokens", { method: "PATCH", ...json({ id: permanent.id, name: "Renamed permanent QA" }) });
assert.equal(renamed.status, 200);
const renamedInfo = await renamed.json();
assert.equal(renamedInfo.name, "Renamed permanent QA");
assert.equal(renamedInfo.expiresAt, null);
assert.equal(renamedInfo.id, permanent.id);
assert.equal(renamedInfo.prefix, permanent.prefix);
assert.equal(renamedInfo.createdAt, permanent.createdAt);
assert.ok(!("token" in renamedInfo) && !("hash" in renamedInfo));
assert.equal((await session("/api/settings/tokens", { method: "PATCH", ...json({ id: permanent.id, name: " " }) })).status, 400);
assert.equal((await session("/api/settings/tokens", { method: "PATCH", ...json({ id: permanent.id, name: "Keep expiry", expiresAt: "2000-01-01" }) })).status, 400);
assert.equal((await session("/api/settings/tokens", { method: "PATCH", ...json({ id: permanent.id, name: "CSRF" }), headers: { Origin: "https://attacker.example", "Content-Type": "application/json" } })).status, 401);
const api = (path, options = {}, bearer = token.token) => fetch(base + path, {
  ...options, redirect: "manual", headers: { Authorization: `Bearer ${bearer}`, ...options.headers },
});
const read = async (path) => {
  const response = await api(path);
  assert.equal(response.status, 200, path);
  return response.json();
};
assert.equal((await api("/api/components", {}, permanent.token)).status, 200);
assert.equal((await api("/api/settings/tokens", { method: "PATCH", ...json({ id: permanent.id, name: "Agent rename" }) })).status, 401);
const write = (path, body, method = "PATCH", headers = {}) => api(path, { method, ...json(body), headers: { "Content-Type": "application/json", ...headers } });

assert.equal((await fetch(base + "/api/components", { redirect: "manual" })).status, 401);
assert.equal((await api("/api/components", {}, "invalid")).status, 401);
assert.equal((await session("/api/components", { headers: { Authorization: "Bearer invalid" } })).status, 401);
assert.equal((await fetch(base + "/settings", { redirect: "manual" })).status, 307);
assert.equal((await api("/api/settings/tokens")).status, 401);
assert.equal((await session("/api/settings/tokens", { method: "POST", ...json({ name: "CSRF" }), headers: { Origin: "https://attacker.example", "Content-Type": "application/json" } })).status, 401);
const listed = await (await session("/api/settings/tokens")).json();
assert.ok(listed.some((entry) => entry.id === permanent.id && entry.expiresAt === null && entry.name === "Renamed permanent QA"));
assert.ok(listed.some((entry) => entry.id === token.id));
assert.ok(!JSON.stringify(listed).includes(token.token));
assert.ok(!JSON.stringify(listed).includes('"hash"'));
const storageKey = "http://127.0.0.1:19000/components-test/api-tokens/" + createHash("sha256").update("fixture-demo").digest("hex") + ".json";
const stored = await (await fetch(storageKey)).json();
assert.ok(!JSON.stringify(stored).includes(token.token));
assert.match(stored.tokens.find((entry) => entry.id === token.id).hash, /^[a-f0-9]{64}$/);
assert.ok((await (await fetch(base + "/api/agent")).json()).models.Purchase);
const docs = await fetch(base + "/docs/api");
assert.equal(docs.status, 200);
assert.match(docs.headers.get("content-type"), /text\/html/);
const html = await docs.text();
assert.ok(html.includes("Быстрый старт"));
assert.ok(html.includes("/api/projects/{id}/components"));
assert.ok(html.includes("20971520"));
const markdown = await fetch(base + "/docs/api/markdown");
assert.equal(markdown.status, 200);
assert.match(markdown.headers.get("content-type"), /text\/markdown/);
assert.ok((await markdown.text()).includes("### Attachment"));
assert.ok((await (await session("/settings")).text()).includes("Доступ для агентов"));

const orderId = crypto.randomUUID(), projectId = crypto.randomUUID();
assert.equal((await write("/api/logistics", { orders: [{ id: orderId, number: orderId, comments: [{ id: "note", text: "Order note", createdAt: new Date().toISOString() }] }], projects: [{ id: projectId, name: projectId }] })).status, 200);
const created = await write("/api/components", { data: { name: "Agent test", note: "preserve", tags: ["QA"], purchases: [{ id: "purchase", orderId, status: "delivered", quantity: 5 }], usages: [] } }, "POST");
assert.equal(created.status, 201);
const component = await created.json();
const path = `/api/components/${component.id}`;
const before = await api(path), etag = before.headers.get("etag");
assert.ok(etag);
assert.equal((await write(path, { data: { usages: [{ id: "usage", projectId, quantity: 2 }] } }, "PATCH", { "If-Match": `W/${etag}` })).status, 200);
assert.equal((await write(path, { data: { note: "stale" } }, "PATCH", { "If-Match": etag })).status, 409);
const changed = await read(path);
assert.equal(changed.data.note, "preserve");
assert.equal(changed.data.purchases[0].quantity, 5);
assert.deepEqual(changed.data.tags, ["QA"]);
assert.equal((await write(path, { data: { usages: [{ id: "usage", projectId, quantity: 6 }] } })).status, 400);
assert.equal((await write(path, { data: { nonexistent: true } })).status, 400);
assert.equal((await write(path, { data: { name: "" } })).status, 400);
const attachments = [];
const fileBytes = Buffer.from([0, 255, 128, 65, 10]);
for (const name of ["Чертёж.pdf", "part.step", "model.stl", "project.webcad.json", "sources.zip"]) {
  const body = new FormData();
  body.append("file", new Blob([fileBytes], { type: "application/octet-stream" }), name);
  const uploaded = await api("/api/files", { method: "POST", body });
  assert.equal(uploaded.status, 201);
  const file = await uploaded.json();
  attachments.push(file);
  const redirect = await api(`/api/files/${file.id}`);
  assert.equal(redirect.status, 307);
  const download = await fetch(redirect.headers.get("location"));
  assert.equal(download.status, 200);
  assert.ok(download.headers.get("content-disposition").includes("attachment;"));
  assert.ok(download.headers.get("content-disposition").includes(encodeURIComponent(name)));
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), fileBytes);
}
// Direct upload bypasses the application body limit and enforces the signed exact size.
const bigBytes = Buffer.alloc(20 * 1024 * 1024, 137);
const direct = await write("/api/files", { name: "20MB-model.stl", size: bigBytes.length }, "POST");
assert.equal(direct.status, 201);
const permit = await direct.json();
const signed = new URL(permit.upload.url);
assert.ok(signed.searchParams.get("X-Amz-SignedHeaders").split(";").includes("content-length"));
assert.ok(signed.pathname.endsWith(`/users/fixture-demo/files/${permit.attachment.id}`));
const uploadDirect = (bytes, url = permit.upload.url) => fetch(url, { method: "PUT", headers: permit.upload.headers, body: bytes });
assert.equal((await uploadDirect(bigBytes.subarray(1))).status, 403);
const tampered = new URL(permit.upload.url);
tampered.pathname = "/components-test/users/victim/files/attack";
assert.equal((await uploadDirect(bigBytes, tampered)).status, 403);
assert.equal((await uploadDirect(bigBytes)).status, 200);
const bigRedirect = await api(`/api/files/${permit.attachment.id}`);
assert.equal(bigRedirect.status, 307);
const bigDownload = await fetch(bigRedirect.headers.get("location"));
assert.deepEqual(Buffer.from(await bigDownload.arrayBuffer()), bigBytes);
attachments.push(permit.attachment);
assert.equal((await write("/api/files", { name: "oversized.stl", size: bigBytes.length + 1 }, "POST")).status, 400);
assert.equal((await write(path, { data: { attachments } })).status, 200);
assert.deepEqual((await read(path)).data.attachments, attachments);
const componentHtml = await (await session(`/components/${component.id}`)).text();
assert.ok(componentHtml.includes("Прикрепить файлы"));
for (const name of ["part.step", "model.stl", "project.webcad.json", "20MB-model.stl"])
  assert.ok(componentHtml.includes(`Посмотреть: ${name}`));
for (const name of ["Чертёж.pdf", "sources.zip"])
  assert.ok(!componentHtml.includes(`Посмотреть: ${name}`));
assert.equal((await api("/api/files/not-a-uuid")).status, 404);
assert.equal((await fetch(base + `/api/files/${attachments[0].id}`, { redirect: "manual" })).status, 401);
const oversized = new FormData();
oversized.append("file", new Blob([Buffer.alloc(4 * 1024 * 1024 + 1)]), "large.stl");
assert.equal((await api("/api/files", { method: "POST", body: oversized })).status, 400);
const projectDetails = await read(`/api/projects/${projectId}`);
assert.equal(projectDetails.project.id, projectId);
assert.ok(projectDetails.version);
assert.ok((await read("/api/projects")).some((project) => project.id === projectId));
assert.equal((await write(`/api/projects/${projectId}/components`, { components: [{ id: component.id, quantity: 2 }], expected: projectDetails.version }, "PUT")).status, 200);
assert.equal((await write("/api/logistics", { projects: [{ id: projectId, name: `Renamed project ${projectId}` }] })).status, 200);
assert.ok((await read("/api/logistics")).orders.some((entry) => entry.id === orderId));
assert.ok((await read(`/api/components?q=${encodeURIComponent(`Renamed project ${projectId}`)}&all=1`)).items.some((entry) => entry.id === component.id));
await read("/api/components/facets");
const exported = await read("/api/components/export");
assert.ok(exported.orders.find((entry) => entry.id === orderId).comments.length);
assert.deepEqual(exported.components.find((entry) => entry.id === component.id).data.attachments, attachments);
assert.equal((await write("/api/components/import", exported, "POST")).status, 200);

// Force overlapping S3 reads/writes to exercise conditional writes and retries.
await fetch("http://127.0.0.1:19000/__fixture/write-behavior", { method: "POST", body: JSON.stringify({ delayMs: 100 }) });
try {
  const parallel = await Promise.all([
    write(path, { data: { note: "Concurrent note" } }),
    write(path, { data: { type: "Concurrent type" } }),
  ]);
  assert.deepEqual(parallel.map((response) => response.status), [200, 200]);
  const merged = await read(path);
  assert.equal(merged.data.note, "Concurrent note");
  assert.equal(merged.data.type, "Concurrent type");
  const version = (await api(path)).headers.get("etag");
  const conditional = await Promise.all([
    write(path, { data: { note: "Winner A" } }, "PATCH", { "If-Match": version }),
    write(path, { data: { note: "Winner B" } }, "PATCH", { "If-Match": version }),
  ]);
  assert.deepEqual(conditional.map((response) => response.status).sort(), [200, 409]);
  const issued = await Promise.all([issue("Concurrent A"), issue("Concurrent B")]);
  const all = await (await session("/api/settings/tokens")).json();
  assert.ok(all.some((entry) => entry.id === permanent.id));
  for (const entry of issued) {
    assert.ok(all.some((item) => item.id === entry.id));
    assert.equal((await api("/api/components", {}, entry.token)).status, 200);
  }
} finally {
  await fetch("http://127.0.0.1:19000/__fixture/write-behavior", { method: "POST", body: JSON.stringify({}) });
}

const form = new FormData();
form.append("files", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2u0AAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "test.png");
const upload = await api("/api/upload", { method: "POST", body: form });
assert.equal(upload.status, 200);
const imageUrl = (await upload.json()).urls[0];
assert.equal((await api(`/api/images/download?url=${encodeURIComponent(imageUrl)}`)).status, 200);
const aliData = { schema_version: 1, exported_at: new Date().toISOString(), orders: [{ order_id: "AGENT-ALI", items: [{ title: "Agent imported component", quantity: 1 }] }] };
const analyzed = await write("/api/components/aliexpress", { action: "analyze", data: aliData }, "POST");
assert.equal(analyzed.status, 200);
const row = (await analyzed.json()).rows[0];
const selections = [{ rowId: row.id }];
const preview = await write("/api/components/aliexpress", { action: "preview", data: aliData, selections }, "POST");
assert.equal(preview.status, 200);
const previewToken = (await preview.json()).token;
assert.equal((await write("/api/components/aliexpress", { action: "apply", data: aliData, selections, token: previewToken }, "POST")).status, 200);

// A second independent owner cannot read or modify the first owner's component.
const login = `agent-${Date.now()}`;
assert.equal((await fetch(base + "/api/register", { method: "POST", ...json({ login, password: "test-password-123" }) })).status, 201);
const otherCsrf = await (await session("/api/auth/csrf")).json();
await session("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: otherCsrf.csrfToken, login, password: "test-password-123" }) });
const other = await issue("Other owner");
assert.equal((await session("/api/settings/tokens", { method: "PATCH", ...json({ id: permanent.id, name: "Wrong owner" }) })).status, 404);
assert.equal((await api(path, {}, other.token)).status, 404);
assert.equal((await api(path, { method: "PATCH", ...json({ data: { note: "attack" } }) }, other.token)).status, 404);
assert.equal((await api(path, { method: "DELETE" }, other.token)).status, 404);
assert.equal((await api(`/api/files/${attachments[0].id}`, {}, other.token)).status, 404);
assert.equal((await api(`/api/projects/${projectId}`, {}, other.token)).status, 404);

// Restore fixture session and revoke the original token.
const restoreCsrf = await (await session("/api/auth/csrf")).json();
await session("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: restoreCsrf.csrfToken, login: "demo", password: "demo12345" }) });
const expiring = await issue("Expiry QA");
const latest = await (await fetch(storageKey)).json();
latest.tokens.find((entry) => entry.id === expiring.id).expiresAt = "2000-01-01T00:00:00.000Z";
await fetch(storageKey, { method: "PUT", body: JSON.stringify(latest) });
assert.equal((await api("/api/components", {}, expiring.token)).status, 401);
assert.equal((await api(path, { method: "DELETE" })).status, 200);
assert.equal((await session(`/api/settings/tokens?id=${permanent.id}`, { method: "DELETE" })).status, 200);
assert.equal((await api("/api/components", {}, permanent.token)).status, 401);
assert.equal((await session(`/api/settings/tokens?id=${token.id}`, { method: "DELETE" })).status, 200);
assert.equal((await api("/api/components")).status, 401);
console.log("Agent API passed: token lifecycle/hash/CSRF, owner isolation, CRUD/ETag/concurrent writes, projects, private PDF/STEP/STL/ZIP round trip, file limits, images, AliExpress, import/export and settings rendering.");
