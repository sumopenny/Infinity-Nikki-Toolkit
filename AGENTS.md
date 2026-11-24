# Branch and deployment conventions

- Unless explicitly instructed otherwise, make changes on `main`, deployed to Cloudflare Workers.
- `pages` preserves the Cloudflare Pages version. Do not modify, merge into, or push that branch without an explicit request.
- Production Worker: `nikkicube`, https://nikkicube.cc.cd.
- Keep the separate official website https://nikki3.pages.dev unchanged.
- Never run tests against production D1. Use isolated local databases.
