# Agent Brief - AI Search Readiness Analyzer

Read this in full before writing any code. It applies to every module.

## What this product is

Read `AI_Search_Readiness_Analyzer.md` in the repo root - it is the full
product spec. The single most important rule in it:

> Do not create a meaningless score such as "Your website is 73/100."
> Every score must have: Category, Individual checks, Evidence, Severity,
> Impact, Recommendation, Suggested fix.

And: **"Do not create mock data and pretend it is real analysis."** Every
number your code produces must be computed from real crawled page data
already persisted in Postgres via Prisma. If you don't have enough signal
to make a determination, return `NOT_APPLICABLE` / lower confidence - never
invent a plausible-looking value.

No LLM API keys are configured in this environment (see `.env` -
OPENAI_API_KEY etc. are blank). Every analyzer must be deterministic
(rule-based / heuristic), not dependent on calling an LLM. Where the spec
says "use AI", implement the best deterministic heuristic you can and leave
a short comment noting where an LLM call could enhance it later.

## Stack

- Backend: `apps/api` - NestJS 10 (CommonJS, not the newer ESM/Nest12
  style), Prisma 5 -> PostgreSQL, Jest for tests.
- Frontend: `apps/web` - React (Vite), MUI, Chart.js.
- The Prisma schema (`apps/api/prisma/schema.prisma`) is FIXED - it already
  models every entity you need (Page, PageLink, SEOCheck, ContentAnalysis,
  Entity, SchemaAnalysis, AEOAnalysis, GEOAnalysis, Query, Recommendation,
  GeneratedFix, Score, ScoreVersion, ...). **Do not edit schema.prisma or
  run `prisma migrate`.** If you find you're genuinely missing a field,
  stop and report it in your final summary instead of migrating - schema
  changes from multiple parallel agents would conflict.
- A dedicated local Postgres 18 instance is already running on port 5433
  (separate from any other Postgres on this machine) with the schema
  already migrated. `apps/api/.env` has `DATABASE_URL` pointing at it. Just
  `npm run test` / import `PrismaService` - don't start/stop Postgres
  yourself.

## Conventions

- CommonJS NestJS module pattern: `@Module({...})` classes, constructor
  injection, one service class per file, `*.service.ts` / `*.controller.ts`
  / `*.module.ts` / `*.spec.ts` naming.
- Every exported service method signature given to you below is a fixed
  contract - other modules and the orchestrator (`AuditsService`, see
  `apps/api/src/modules/audits/audits.service.ts`) already call these
  methods by that exact name and signature. Do not rename them or change
  their parameter order - implement the body only. You may add private
  helper methods/files freely within your module's folder.
- Money-shot rule for every check/finding you write to the DB: `evidence`
  must quote something concrete from the actual page (a title string, a
  count, a snippet) - never a generic sentence.
- Write Jest unit tests (`*.spec.ts`) alongside the services you implement,
  covering both the happy path and edge cases named in spec section 21
  ("Testing Requirements"). Use an in-memory fixture (plain objects), not a
  live Prisma connection, for pure logic (e.g. text heuristics); for
  anything that must hit Postgres, use the real `PrismaService` against the
  dev DB (already migrated) inside a `describe` block that creates and
  cleans up its own rows.
- Run `npx tsc --noEmit -p tsconfig.json` from `apps/api` before finishing
  and fix all type errors - the whole repo must type-check clean.
- Run `npx jest <your-files>` before finishing and make sure your new
  tests pass.
- Do not touch files outside your assigned module folders (listed in your
  task) plus test files you add there. If integration requires a shared
  file change, note it in your summary instead of editing it.

## Important: other agents are working in parallel right now

Several other agents are implementing sibling modules against this same
Prisma schema and this same shared dev Postgres database at the same time.
You do not need their source code to do your job - the Prisma schema
fields ARE the contract between modules (e.g. you can query
`prisma.entity.findMany({ where: { auditId } })` for real rows regardless
of whether the Entity-writing module has finished yet; just write your
queries against the schema).

Because the database is shared and other agents' tests may be running
concurrently against it:
- Never delete/truncate broadly (no `deleteMany({})`, no clearing an entire
  table). In tests, create your own fixture rows with unique data (e.g. a
  `nanoid()`-suffixed email/domain) and delete only the specific rows you
  created, by id, in an `afterAll`/`afterEach`.
- Don't assume you're the only data in any table when asserting counts -
  query and assert on the specific rows you created, not "table has N rows
  total".

## Security rules (non-negotiable)

- Any code that fetches a URL (crawler, competitor analysis) MUST call
  `assertUrlIsSafeToFetch` from
  `apps/api/src/common/security/ssrf-guard.ts` before every request,
  including after following each redirect hop - re-check the final
  destination, not just the original URL. This blocks localhost, private/
  link-local IP ranges, and cloud metadata endpoints. Never bypass it.
- Respect `robots.txt` for crawling.
- Never fabricate a "citation" or "mention" result for the AI Query Testing
  feature - see `apps/api/src/modules/queries/providers/` for the existing
  NullQueryTestingProvider pattern.

## When you're done

In your final report, list: files created/modified, what you implemented
vs. what's still a TODO/limitation, and the exact test command you ran with
its result (pass/fail counts).
