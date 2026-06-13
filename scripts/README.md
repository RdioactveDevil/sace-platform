# Scripts

Operational scripts for the SACE platform. Run them with the workspace's pnpm
filter, e.g. `pnpm --filter @workspace/scripts exec tsx ./src/<script>.ts`.

Most scripts that write to Supabase need `SUPABASE_SERVICE_KEY` (or
`SUPABASE_SERVICE_ROLE_KEY`). Generation scripts additionally need the API
server running (it calls Claude), which reads `SUPABASE_SERVICE_KEY` and an
Anthropic key.

## Seeding hard + graph questions

`seed-hard-graph-questions.ts` tops up the live question bank with difficulty
4–5 and graph/diagram questions for managed subjects, so adaptive sessions have
exam-level material to surface immediately instead of waiting for the on-demand
top-up to generate it.

It reads the managed curricula straight from the DB and rebuilds the generator's
`T{n}.{m}` topic codes (topics and subtopics ordered by `order_index`), requests
difficulty 4 with graphs/diagrams enabled, auto-approves verified questions into
the live `questions` table, and is idempotent (skips subtopics that already have
enough hard questions).

> ⚠️ This writes to the **live production** `questions` table and bypasses the
> admin review queue (auto-approve). Always dry-run first, then seed one subject
> before widening.

### Prerequisites

- `SUPABASE_SERVICE_KEY` set in the environment.
- The API server running and reachable (default `http://localhost:8080`), with
  its Anthropic key configured.
- On Claude Code on the web: the environment's **Network access** must allow
  `*.supabase.co` (Anthropic's API is already in the default Trusted allowlist).
  Network-allowlist changes only take effect in a **newly started** session.

### Run

```bash
# 1) Start the API server (reads SUPABASE_SERVICE_KEY + Anthropic key)
pnpm --filter @workspace/api-server dev
# wait until http://localhost:8080 responds

# 2) Dry run — confirms it can enumerate your curricula (no writes)
DRY_RUN=1 pnpm --filter @workspace/scripts exec tsx ./src/seed-hard-graph-questions.ts

# 3) Seed one subject first, then check the results before widening
SUBJECTS="Year 10 Mathematics" pnpm --filter @workspace/scripts exec tsx ./src/seed-hard-graph-questions.ts

# 4) Widen to all managed subjects once you're happy
pnpm --filter @workspace/scripts exec tsx ./src/seed-hard-graph-questions.ts
```

### Knobs (env vars)

| Var            | Default                  | Meaning                                                        |
| :------------- | :----------------------- | :------------------------------------------------------------- |
| `SUBJECTS`     | all managed curricula    | Comma-separated curriculum names to seed                       |
| `DIFFICULTY`   | `4`                      | Target difficulty 1–5 (`4` → "difficulty 4–5")                 |
| `PER_SUBTOPIC` | `3`                      | Questions requested per subtopic                               |
| `MIN_EXISTING` | `3`                      | Skip a subtopic that already has this many hard (diff ≥4) qs   |
| `API_BASE`     | `http://localhost:8080`  | API server base URL                                            |
| `DRY_RUN`      | unset                    | If set, list what would be generated without calling the API   |

After seeding, the existing **Backfill — verify & repair** Action fact-checks
answer keys in bulk if you want an extra safety net.

## Other scripts

- `seed-vic-y10-questions.ts` / `seed-y7-questions.ts` — earlier per-subject
  seeders (use hardcoded topic codes; prefer `seed-hard-graph-questions.ts` for
  new seeding).
- `ingest-past-paper.ts` — turn a real exam PDF into bank questions with figures.
- `backfill-verify-repair.ts` — fact-check and repair answer keys in bulk.
- `apply-migrations.ts` — apply SQL migrations.
