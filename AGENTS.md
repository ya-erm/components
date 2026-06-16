# Repository Agent Notes

- If a development server is already running on port `3000`, use that process instead of starting another `pnpm dev` instance.
- Do not run `pnpm build` while a development server is running. It writes build artifacts into `.next` and can break or conflict with the active dev build.
