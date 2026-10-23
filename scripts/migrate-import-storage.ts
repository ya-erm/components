/** По умолчанию только проверяет. Запись: pnpm exec tsx scripts/migrate-import-storage.ts --apply */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { getJsonVersioned, putJsonConditional } from "../lib/s3";
import { migrateCatalogImport } from "../lib/import-migration";
import { parseCatalog } from "../lib/catalog";

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  const run = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`;
  let continuation: string | undefined;
  let scanned = 0, changed = 0, orders = 0, purchases = 0, ignoredOrders = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET ?? "components", Prefix: "users/",
      ContinuationToken: continuation,
    }));
    for (const object of page.Contents ?? []) {
      if (!object.Key || !/^users\/[^/]+\/catalog\.json$/.test(object.Key)) continue;
      scanned++;
      const stored = await getJsonVersioned<unknown>(object.Key);
      if (!stored.value || !stored.etag) throw new Error("Не удалось прочитать каталог с версией");
      const catalog = parseCatalog(migrateCatalogImport(stored.value));
      orders += catalog.orders.length;
      purchases += catalog.items.reduce((sum, item) => sum + (item.data.purchases?.length ?? 0), 0);
      ignoredOrders += catalog.legacyIgnoredOrders?.length ?? 0;
      if (JSON.stringify(stored.value) === JSON.stringify(catalog)) continue;
      changed++;
      if (apply) {
        const backupKey = `migrations/import-storage/${run}/${object.Key}`;
        await putJsonConditional(backupKey, stored.value);
        assert.deepEqual((await getJsonVersioned(backupKey)).value, stored.value);
        // Конкурентная правка вызывает 412; резервная копия остаётся, данные не затираются.
        await putJsonConditional(object.Key, catalog, stored.etag);
        assert.deepEqual((await getJsonVersioned(object.Key)).value, JSON.parse(JSON.stringify(catalog)));
      }
    }
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuation);
  console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", scanned, changed, orders, purchases, ignoredOrders,
    ...(apply && changed ? { backupPrefix: `migrations/import-storage/${run}/` } : {}),
  }, null, 2));
}

main().catch((error) => {
  // SDK-ошибки могут содержать приватные ключи объектов. Печатаем только имя/HTTP-код.
  console.error("Миграция остановлена", error.name, error.$metadata?.httpStatusCode ?? "");
  process.exitCode = 1;
});
