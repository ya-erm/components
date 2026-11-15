// Локальное S3-хранилище в памяти для ручной проверки. Данные исчезают при остановке.
// Запуск: node tests/s3-fixture.mjs (порт 19000, бакет components-test).
// Dev: S3_ENDPOINT=http://127.0.0.1:19000 S3_BUCKET=components-test
//      S3_ACCESS_KEY_ID=test S3_SECRET_ACCESS_KEY=test S3_FORCE_PATH_STYLE=true
//      S3_PUBLIC_URL=http://127.0.0.1:19000/components-test AUTH_URL=http://localhost:3000 pnpm dev
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import { createHash, createHmac } from "node:crypto";
const etag = (value) =>
  value === undefined
    ? undefined
    : `"${createHash("md5").update(value).digest("hex")}"`;

const user = {
  id: "fixture-demo",
  login: "demo",
  passwordHash: await bcrypt.hash("demo12345", 10),
  createdAt: new Date().toISOString(),
};
const objects = new Map([
  [
    "/components-test/users/index.json",
    JSON.stringify({ byLogin: { demo: user }, byId: { [user.id]: user } }),
  ],
  [
    "/components-test/users/fixture-demo/catalog.json",
    JSON.stringify([
      {
        id: "legacy-led",
        data: {
          name: "Светодиод — старая запись",
          quantity: 10,
          status: "in_stock",
          note: "Ящик 1",
        },
        createdAt: "2026-10-13T12:00:00.000Z",
        updatedAt: "2026-10-13T12:00:00.000Z",
      },
    ]),
  ],
]);
const contentTypes = new Map();
let writeBehavior = { delayMs: 0, failWrites: 0, readDelayMs: 0 };
const metadata = new Map();
createServer(async (req, res) => {
  // Mirror production storage CORS for browser integration against local fixtures.
  if (["http://localhost:3000", "http://127.0.0.1:3000"].includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "ETag,Content-Disposition");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  }
  const key = decodeURIComponent(
    new URL(req.url, "http://127.0.0.1:19000").pathname,
  );
  if (key === "/__fixture/write-behavior" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    writeBehavior = {
      delayMs: Math.max(0, Math.min(5000, Number(value.delayMs) || 0)),
      failWrites: Math.max(0, Math.min(10, Number(value.failWrites) || 0)),
      readDelayMs: Math.max(0, Math.min(1000, Number(value.readDelayMs) || 0)),
    };
    res.end("ok");
    return;
  }
  if (key === "/__fixture/catalog") {
    res.setHeader("Content-Type", "application/json");
    res.end(objects.get("/components-test/users/fixture-demo/catalog.json"));
    return;
  }
  if (req.method === "PUT") {
    const url = new URL(req.url, "http://127.0.0.1:19000");
    const query = url.searchParams;
    if (query.has("X-Amz-Signature")) {
      const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      const canonicalQuery = [...query].filter(([name]) => name !== "X-Amz-Signature")
        .map(([name, value]) => [encode(name), encode(value)]).sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
        .map(([name, value]) => `${name}=${value}`).join("&");
      const signedHeaders = query.get("X-Amz-SignedHeaders");
      const canonicalHeaders = signedHeaders.split(";").map((name) => `${name}:${String(req.headers[name] ?? "").trim()}\n`).join("");
      const canonical = ["PUT", url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
      const [access, date, region, service] = query.get("X-Amz-Credential").split("/");
      const scope = `${date}/${region}/${service}/aws4_request`;
      const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
      const signingKey = hmac(hmac(hmac(hmac("AWS4test", date), region), service), "aws4_request");
      const toSign = ["AWS4-HMAC-SHA256", query.get("X-Amz-Date"), scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
      if (access !== "test" || createHmac("sha256", signingKey).update(toSign).digest("hex") !== query.get("X-Amz-Signature")) {
        res.writeHead(403); res.end("Invalid signature"); return;
      }
    }
    if (writeBehavior.delayMs)
      await new Promise((resolve) => setTimeout(resolve, writeBehavior.delayMs));
    if (writeBehavior.failWrites > 0) {
      writeBehavior.failWrites -= 1;
      res.writeHead(403, { "Content-Type": "application/xml" });
      res.end("<Error><Code>AccessDenied</Code></Error>");
      return;
    }
    if (
      (req.headers["if-match"] &&
        req.headers["if-match"] !== etag(objects.get(key))) ||
      (req.headers["if-none-match"] === "*" && objects.has(key))
    ) {
      res.writeHead(412, { "Content-Type": "application/xml" });
      res.end("<Error><Code>PreconditionFailed</Code></Error>");
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    objects.set(key, Buffer.concat(chunks));
    metadata.set(key, req.headers["x-amz-meta-filename"] ?? query.get("x-amz-meta-filename"));
    contentTypes.set(key, req.headers["content-type"] ?? "application/octet-stream");
    res.setHeader("ETag", etag(objects.get(key)));
    res.end();
  } else if (["GET", "HEAD"].includes(req.method) && objects.has(key)) {
    const query = new URL(req.url, "http://127.0.0.1:19000").searchParams;
    res.setHeader("Content-Type", query.get("response-content-type") ?? contentTypes.get(key) ?? "application/json");
    if (query.has("response-content-disposition")) res.setHeader("Content-Disposition", query.get("response-content-disposition"));
    res.setHeader("Content-Length", Buffer.byteLength(objects.get(key)));
    res.setHeader("ETag", etag(objects.get(key)));
    if (metadata.get(key)) res.setHeader("x-amz-meta-filename", metadata.get(key));
    if (req.method === "GET" && key.includes("/files/") && writeBehavior.readDelayMs) {
      const body = Buffer.from(objects.get(key));
      for (let offset = 0; offset < body.length && !res.destroyed; offset += 64 * 1024) {
        res.write(body.subarray(offset, offset + 64 * 1024));
        await new Promise((resolve) => setTimeout(resolve, writeBehavior.readDelayMs));
      }
      res.end();
    } else res.end(req.method === "HEAD" ? undefined : objects.get(key));
  } else {
    res.writeHead(404, { "Content-Type": "application/xml" });
    res.end(
      "<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>",
    );
  }
}).listen(19000, "127.0.0.1", () =>
  console.log("S3 fixture: http://127.0.0.1:19000 (demo / demo12345)"),
);
