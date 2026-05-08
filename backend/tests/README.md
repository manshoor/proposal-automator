# Backend tests

Run via Vitest inside the backend container (npm runs inside Docker per project convention):

```sh
docker compose exec backend npm test           # one-shot run
docker compose exec backend npm run test:watch # watch mode
```

## Conventions

- Test files live alongside this directory: `tests/<service-or-module>.test.js`.
- Cover **pure functions and deterministic logic first** — services that depend on the DB or LLMs are harder to test without mocks; skip them until a fixture/mock setup exists.
- Each test file imports the module under test directly (no test runner globals — `import { describe, it, expect } from 'vitest'`).
- Vitest config: `backend/vitest.config.js`.

## Current coverage

| File | What it tests |
|---|---|
| `bid-recommend.service.test.js` | Hourly + fixed-price recommendation heuristics |
| `client-history.service.test.js` | Deterministic SHA256 client identity hashing + spend bucketing |
| `message.prompt.test.js` | Rate-negotiation keyword detection |

When adding new pure-logic services, add a test here.
