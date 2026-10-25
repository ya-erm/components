import { fileURLToPath } from "node:url";

// Next.js preserves JSX for its compiler; Node render tests need the automatic runtime.
process.env.TSX_TSCONFIG_PATH = fileURLToPath(
  new URL("./tsconfig.json", import.meta.url),
);
await import("tsx");
