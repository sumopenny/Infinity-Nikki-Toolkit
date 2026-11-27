# Branch and deployment conventions

- Unless explicitly instructed otherwise, make changes on `main`, deployed to Cloudflare Pages.
- `pages` preserves the Cloudflare Pages version. Do not modify, merge into, or push that branch without an explicit request.
- Production Pages project: `nikkicube`, https://nikkicube.pages.dev.
- Do not reintroduce the separate Workers entrypoint or deployment configuration.
- Keep the separate official website https://nikki3.pages.dev unchanged.
- Never run tests against production D1. Use isolated local databases.
- Local development and preview use the remote Pages API by default; do not add local D1 startup or migration steps. Isolated test databases remain allowed.
