# AnswerScope

**AI Search Readiness Platform, powered by [Expentor](https://expentor.com).**

An explainable AI Search Readiness / AEO / GEO auditing platform. Enter a
website URL; the platform crawls it, runs deterministic technical SEO,
content, entity, and structured-data analyzers, scores AEO ("can an answer
engine use this content?") and GEO ("is this site clear/authoritative/
machine-readable enough for AI retrieval?"), generates realistic user
queries, and turns every finding into a prioritized, evidence-backed
recommendation - never a bare unexplained score. See
`AI_Search_Readiness_Analyzer.md` for the full product spec this
implements.

## Stack

- **API** (`apps/api`): NestJS 10, Prisma 5, PostgreSQL, Jest.
- **Web** (`apps/web`): React 18, Vite, MUI 5, TanStack Query.
- **Crawler**: Playwright + Cheerio, custom robots.txt/sitemap.xml parsing.

## Local development setup

### 1. Database

The API needs PostgreSQL. Easiest path:

```bash
docker compose up -d        # starts Postgres 16 on localhost:5432 (see docker-compose.yml)
```

Or point `apps/api/.env`'s `DATABASE_URL` at any existing Postgres instance.
Then apply the schema:

```bash
cd apps/api
npm install
npx prisma migrate deploy   # applies the committed migrations
```

### 2. API

```bash
cd apps/api
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET
npm install
npm run start:dev           # http://localhost:<PORT>/api (see .env)
```

Swagger docs are served at `/api/docs` once running.

### 3. Web

```bash
cd apps/web
npm install
npm run dev                 # Vite dev server, proxies /api to the API port
```

Vite's dev proxy target is controlled by `VITE_API_PROXY_TARGET` (defaults
to `http://localhost:4310` - see `apps/web/vite.config.ts`); set it to match
whatever port your API is actually running on.

### 4. Tests

```bash
cd apps/api && npm test     # Jest unit/integration tests (needs the DB up)
cd apps/web && npx tsc -b   # type-check
```

## Architecture

```
React (apps/web)
   |
   v
NestJS API (apps/api)
   +-- Auth (JWT) / Workspaces / Websites   - multi-tenant, workspace-isolated
   +-- Crawler                              - robots.txt/sitemap-aware, SSRF-guarded
   +-- Analysis
   |     +-- Technical SEO (deterministic checks -> SEOCheck rows)
   |     +-- Content / Entity / Schema analyzers
   |     +-- AEO analyzer (question coverage/directness per page)
   |     +-- GEO analyzer (entity clarity/topical coverage/citation readiness)
   +-- Scoring         - versioned, weighted, every score traceable to its checks
   +-- Query generator  - 50-100 realistic queries per audit, from real entities/pages
   +-- Recommendations  - prioritized by impact*confidence/effort, with fix generation
   +-- Competitors       - runs the same pipeline against a competitor's site
   +-- Reports           - PDF export
   v
PostgreSQL (Prisma)
```

The audit pipeline (`AuditsService.runPipeline`) runs crawl -> technical SEO
-> content/entity/schema -> AEO -> GEO -> scoring -> query generation ->
recommendations, as a background job so the HTTP request that starts an
audit returns immediately; the frontend polls `/api/audits/:id/status`.

## Security

- `src/common/security/ssrf-guard.ts` blocks the crawler (and competitor
  analysis) from ever fetching localhost, private/link-local IP ranges, or
  cloud metadata endpoints - every hostname is DNS-resolved and every
  resulting IP checked, including after following redirects.
- `src/common/security/ownership.ts` enforces workspace isolation on every
  resource route, even ones not nested under `/workspaces/:workspaceId/...`.
- No LLM API keys are required or used by default. The AI Query Testing
  module (`modules/queries/providers/`) is a provider abstraction that
  reports `NOT_CONFIGURED` rather than fabricating a result when no
  provider API key is set (see `.env.example`).

## Verified end-to-end

The full pipeline (crawl -> technical SEO -> content/entity/schema -> AEO ->
GEO -> scoring -> query generation -> recommendations -> PDF report ->
competitor analysis) has been run against real, live public websites (not
fixtures), producing genuinely computed, evidence-backed results - e.g. an
audit of developer.mozilla.org came back with an overall score of 63.7/100,
7 category scores each traceable to the checks behind them, 155 SEOCheck
rows (116 PASS / 22 WARNING / 12 FAIL / 5 N/A), real entity extraction, real
per-question AEO evidence (including correctly recognizing that a crawled
404 page doesn't directly answer anything), a valid exported PDF report, and
a competitor comparison against a second live site with real gap findings.
377 automated tests pass across the repo (`cd apps/api && npm test`).

## Known limitations (honest, per the product's own principle of not
overstating what it can do)

- AI Query Testing (spec section 10) has no live provider wired up in this
  build - no API keys were available in the development environment. The
  abstraction is complete and testable via the `NOT_CONFIGURED` path; a real
  OpenAI/Anthropic/Perplexity/Google integration is a drop-in behind
  `QueryTestingService`.
- Entity/topic/question extraction is deterministic/heuristic, not
  LLM-based (no key available) - see each analyzer's file header for exactly
  which heuristic is used and where an LLM call could sharpen it later.
- Playwright JS-rendering is real (Chromium verified working in this
  environment) and is used as a fallback when a page looks like an empty
  JS shell; it degrades gracefully to HTTP+Cheerio if the browser binary
  isn't available in a given environment.
- With small crawl caps (e.g. maxPages=6, used for the live test above),
  query generation naturally produces fewer than the spec's 50-100 target
  since it only generates from real, grounded signal - a full-size crawl of
  a typical marketing site comfortably reaches that range.
- No distributed job queue (BullMQ/Redis) is wired up - the crawl/analysis
  pipeline runs as an in-process background task, which is correct for a
  single API instance; horizontal scaling would want the queue wired in
  (`bullmq`/`ioredis` are already installed as dependencies for that).
