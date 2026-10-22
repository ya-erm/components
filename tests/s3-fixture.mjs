// Локальное S3-хранилище в памяти для ручной проверки. Данные исчезают при остановке.
// Запуск: node tests/s3-fixture.mjs (порт 19000, бакет components-test).
// Dev: S3_ENDPOINT=http://127.0.0.1:19000 S3_BUCKET=components-test
//      S3_ACCESS_KEY_ID=test S3_SECRET_ACCESS_KEY=test S3_FORCE_PATH_STYLE=true
//      S3_PUBLIC_URL=http://127.0.0.1:19000/components-test AUTH_URL=http://localhost:3000 pnpm dev
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
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
createServer(async (req, res) => {
  const key = decodeURIComponent(
    new URL(req.url, "http://127.0.0.1:19000").pathname,
  );
  if (key === "/__fixture/catalog") {
    res.setHeader("Content-Type", "application/json");
    res.end(objects.get("/components-test/users/fixture-demo/catalog.json"));
    return;
  }
  if (req.method === "PUT") {
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
    contentTypes.set(key, req.headers["content-type"] ?? "application/octet-stream");
    res.setHeader("ETag", etag(objects.get(key)));
    res.end();
  } else if (req.method === "GET" && objects.has(key)) {
    res.setHeader("Content-Type", contentTypes.get(key) ?? "application/json");
    res.setHeader("ETag", etag(objects.get(key)));
    res.end(objects.get(key));
  } else {
    res.writeHead(404, { "Content-Type": "application/xml" });
    res.end(
      "<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>",
    );
  }
}).listen(19000, "127.0.0.1", () =>
  console.log("S3 fixture: http://127.0.0.1:19000 (demo / demo12345)"),
);
