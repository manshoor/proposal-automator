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
- When the module under test is a **TypeScript** file, import it with the `.ts` extension explicitly: `from '../services/foo.service.ts'`. Production code keeps `.js` extensions in imports (resolved at runtime by tsx).
- Vitest config: `backend/vitest.config.js`.

## Current coverage

| File | What it tests |
|---|---|
| `bid-recommend.service.test.js` | Hourly + fixed-price recommendation heuristics (TypeScript module) |
| `client-history.service.test.js` | Deterministic SHA256 client identity hashing + spend bucketing |
| `message.prompt.test.js` | Rate-negotiation keyword detection |
| `persona.service.test.js` | Client persona classifier + niche bucketing |
| `banned-phrases.lib.test.js` | Banned-phrase regex matching + word boundaries |

When adding new pure-logic services, add a test here.

## TypeScript

The backend uses incremental TS adoption — both `.js` and `.ts` files coexist. tsx loads either at runtime; tsc (`npm run typecheck`) only checks `.ts` files (per `tsconfig.json`'s `checkJs: false`). When converting a service:

1. Rename the file (`git mv foo.service.js foo.service.ts`).
2. Add types where they're useful (function signatures, exported interfaces).
3. Update any test file's import to use the `.ts` extension.
4. Run `npm run typecheck` and `npm test` — both should pass.
