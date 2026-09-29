# AI Search Readiness Analyzer

## Product Vision

Build a production-ready SaaS platform called **AI Search Readiness
Analyzer**.

The product allows a user to enter a website URL and analyzes how well
that website is structured and optimized for modern search engines and
AI-powered answer/generative systems.

The product should **not** claim to know or predict exactly how ChatGPT,
Gemini, Claude, Perplexity, Google AI Overviews, or other AI systems
will rank or recommend a website.

Instead, calculate an explainable **AI Search Readiness Score** based on
measurable website characteristics.

------------------------------------------------------------------------

# 1. Core Product Modules

1.  Website Crawler
2.  Technical SEO Analyzer
3.  Content Analyzer
4.  Entity & Semantic Analyzer
5.  Schema/Structured Data Analyzer
6.  AEO Analyzer
7.  GEO / AI Search Readiness Analyzer
8.  Query Generator
9.  AI Query Testing
10. Competitor Analyzer
11. Gap Analysis
12. Recommendation Engine
13. Automatic Fix Generator
14. Audit Dashboard
15. Historical Audits
16. Report/PDF Export

------------------------------------------------------------------------

# 2. Recommended Technology Stack

## Frontend

-   React
-   React Material
-   Chart.js

## Backend

-   NestJS
-   PostgreSQL
-   Prisma

## Crawler

-   Playwright
-   Cheerio
-   sitemap.xml parser
-   robots.txt parser

## AI

Use an LLM only where semantic/content reasoning is required.

Use deterministic rules for technical SEO checks.

Keep AI-generated recommendations explainable and traceable to evidence.

------------------------------------------------------------------------

# 3. Product Principle

Do **not** create a meaningless score such as:

> Your website is 73/100.

Every score must have:

-   Category
-   Individual checks
-   Evidence
-   Severity
-   Impact
-   Recommendation
-   Suggested fix

Example:

``` text
AEO Score: 58/100

Question Coverage: 12/25
Answer Directness: 14/20
Content Structure: 13/20
FAQ Coverage: 6/15
Schema: 8/10
Entity Clarity: 5/10
```

Each failed check should explain:

``` text
Problem:
The pricing page does not provide a direct answer to common pricing questions.

Evidence:
The page contains pricing information but does not clearly answer
"How much does X cost?" in a concise section.

Recommendation:
Add a direct pricing answer near the beginning of the page and provide
supporting details below it.

Suggested Fix:
Generate an example section that the user can review and copy.
```

------------------------------------------------------------------------

# 4. System Architecture

``` text
React
   |
   v
NestJS API
   |
   +--> Authentication
   |
   +--> Website Management
   |
   +--> Crawl Jobs
   |
   +--> Analysis Engine
   |       |
   |       +--> Technical SEO
   |       +--> Content
   |       +--> Entity
   |       +--> Schema
   |       +--> AEO
   |       +--> GEO
   |
   +--> Query Engine
   |
   +--> Competitor Engine
   |
   +--> Recommendation Engine
   |
   +--> Report Engine
   |
   v
PostgreSQL / Prisma
```

------------------------------------------------------------------------

# 5. Website Crawler

Build a Website Crawler module.

## Input

``` text
website URL
```

## Requirements

The crawler must:

1.  Validate the URL.
2.  Fetch robots.txt.
3.  Detect sitemap.xml.
4.  Discover URLs from the sitemap.
5.  Crawl internal pages within configurable limits.
6.  Avoid external domains.
7.  Avoid duplicate URLs.
8.  Normalize URLs.
9.  Detect canonical URLs.
10. Respect robots.txt where applicable.
11. Support JavaScript-rendered pages using Playwright.
12. Extract:
    -   title
    -   meta description
    -   headings
    -   paragraphs
    -   links
    -   images
    -   alt text
    -   canonical
    -   robots meta
    -   Open Graph
    -   Twitter metadata
    -   JSON-LD
    -   schema.org entities
    -   HTTP status
    -   redirects
    -   word count
    -   language
    -   structured data
13. Detect broken internal links.
14. Record crawl errors.
15. Record response timing where available.
16. Store raw analysis data separately from calculated scores.

## Components

Implement:

-   CrawlJob
-   CrawlQueue
-   PageCrawler
-   URLNormalizer
-   SitemapParser
-   RobotsParser
-   HTMLExtractor

Use asynchronous jobs so large websites do not block HTTP requests.

## Crawl Status

``` text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
```

Allow configuration for:

-   Maximum pages
-   Crawl depth
-   Request concurrency
-   Timeout
-   User agent

Do not crawl unlimited URLs.

------------------------------------------------------------------------

# 6. Technical SEO Analyzer

Build a deterministic Technical SEO Analyzer.

Analyze every crawled page and the website globally.

## Technical Checks

-   HTTP status
-   HTTPS
-   Redirects
-   Canonical
-   Robots directives
-   Indexability
-   Sitemap
-   robots.txt
-   Duplicate URLs
-   Broken links

## Metadata

-   Title existence
-   Title length
-   Duplicate titles
-   Meta description
-   Duplicate descriptions
-   Open Graph
-   Canonical

## Content Structure

-   H1 existence
-   Multiple H1s
-   Heading hierarchy
-   Empty headings
-   Thin content
-   Duplicate content
-   Image alt text

## Internal Linking

-   Orphan pages
-   Pages with very few internal links
-   Excessive links
-   Important pages with poor internal linking

## Structured Data

Check for:

-   JSON-LD
-   Schema validity
-   Organization
-   WebSite
-   Article
-   Product
-   FAQPage
-   BreadcrumbList
-   LocalBusiness
-   Person
-   Service

Only evaluate schemas that are applicable to the page.

Each check must return:

``` typescript
{
  checkId: string;
  category: string;
  status: "PASS" | "WARNING" | "FAIL" | "NOT_APPLICABLE";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
  evidence: string;
  recommendation: string;
}
```

Do not use AI for deterministic checks.

Create a transparent scoring engine where every score can be traced back
to individual checks.

------------------------------------------------------------------------

# 7. AEO Analyzer

Build an Answer Engine Optimization analyzer.

The goal is to determine whether website content is easy for an answer
engine or AI system to understand and use when answering user questions.

Analyze:

1.  Question coverage
2.  Answer directness
3.  Content structure
4.  Heading clarity
5.  FAQ coverage
6.  Definitions
7.  Step-by-step explanations
8.  Concise answer sections
9.  Entity clarity
10. Supporting evidence
11. Structured data
12. Content completeness

For important pages, generate likely user questions based on the page
topic.

For every question:

-   Determine whether the page answers it.
-   Find supporting content.
-   Evaluate answer completeness.
-   Evaluate whether the answer appears directly and clearly.
-   Identify missing information.

Use:

``` text
DIRECTLY_ANSWERED
PARTIALLY_ANSWERED
NOT_ANSWERED
```

Example:

``` text
Question:
"What does Acme cost?"

Result:
NOT_ANSWERED

Evidence:
Pricing page contains pricing cards but does not provide a textual explanation of plans.

Recommendation:
Add a concise pricing explanation near the top of the page.
```

Do not claim that this guarantees AI citations or rankings.

Produce an explainable AEO score.

------------------------------------------------------------------------

# 8. GEO / AI Search Readiness Analyzer

Build a Generative Engine Optimization / AI Search Readiness analyzer.

The goal is to evaluate whether a website provides clear, structured,
authoritative, machine-understandable information that could be useful
to search and AI retrieval systems.

## Entity Clarity

Determine:

-   What organization/person/product is this?
-   What does it do?
-   Who does it serve?
-   Where does it operate?
-   What products/services does it provide?
-   Relationships between entities

## Topical Coverage

Identify:

-   Primary topics
-   Supporting topics
-   Missing important subtopics
-   Semantic coverage
-   Topical depth

## Content Quality Signals

Analyze:

-   Clear authorship
-   Author/about information
-   Source references
-   Factual support
-   Publication/update information where appropriate
-   First-hand information
-   Specific claims
-   Supporting evidence

## Machine Readability

Analyze:

-   Structured headings
-   Structured data
-   Semantic HTML
-   JSON-LD
-   Consistent entity names
-   Consistent business information

## Citation Readiness

Analyze:

-   Factual statements
-   References
-   Authoritative sources
-   Unique information
-   Statistics
-   Original research
-   Expert information

Do not claim:

> Your website has an 80% chance of being cited by ChatGPT.

Instead say:

> AI Search Readiness: 72/100

and explain exactly which measurable characteristics contributed to the
score.

Every recommendation must contain evidence from the website.

------------------------------------------------------------------------

# 9. AI Query Generation Engine

Build an AI Query Generation Engine.

Given a website and its extracted entities, products, services, topics,
and target audience, generate realistic questions users may ask
AI/search systems.

## Query Categories

1.  Informational
2.  Commercial
3.  Transactional
4.  Comparison
5.  Alternative
6.  Problem-solving
7.  Product/service-specific
8.  Brand
9.  Local
10. Industry
11. "Best" queries
12. "How to" queries
13. Pricing queries
14. Feature queries
15. Trust/credibility queries

Example:

``` text
"What is Example?"
"What does Example do?"
"Who is Example for?"
"How much does Example cost?"
"Example alternatives"
"Example vs Competitor"
"Is Example suitable for small businesses?"
"Does Example integrate with Salesforce?"
```

Generate 50-100 queries initially.

Each query must contain:

``` typescript
{
  query: string;
  intent: string;
  topic: string;
  entity: string;
  importance: number;
  sourcePage: string;
}
```

Avoid generic questions that have no relationship to the website.

Allow users to:

-   Edit queries
-   Delete queries
-   Add queries
-   Approve queries
-   Group queries

------------------------------------------------------------------------

# 10. AI / Search Query Testing

Build an AI/Search Query Testing module.

The purpose is to measure how the target website appears for a
predefined set of queries.

For each query, collect available results from supported search/AI
providers through their official APIs or permitted integrations.

Never scrape a service in violation of its terms.

For every query record:

-   Query
-   Provider
-   Timestamp
-   Whether target brand was mentioned
-   Whether target URL was cited
-   Cited URLs
-   Competing brands mentioned
-   Competing URLs
-   Answer summary
-   Citation position/order when available
-   Provider response metadata

Display:

``` text
Query:
Best project management software for small teams?

Target mentioned:
YES / NO

Target cited:
YES / NO

Competitors mentioned:
Competitor A
Competitor B

Target citation:
URL
```

Store historical results so users can compare changes over time.

Clearly distinguish observed results from predictions.

Do not convert a single query result into a claim about overall ranking.

------------------------------------------------------------------------

# 11. Competitor Analysis

Build a Competitor Analysis module.

The user can provide:

-   Target website
-   Competitor websites

Analyze the target and competitors using the same methodology.

Compare:

-   Technical SEO
-   Content coverage
-   Question coverage
-   Entity clarity
-   Structured data
-   Internal linking
-   Topical coverage
-   AEO readiness
-   AI Search Readiness
-   Citation/reference signals
-   Content depth

Do not simply produce a single winner.

Instead show:

-   Target strengths
-   Target gaps
-   Competitor differences
-   Missing topics
-   Missing questions
-   Missing entities
-   Missing structured data
-   Missing content sections

Example:

``` text
Gap:
Competitor A has a dedicated page answering "X pricing".

Target:
No equivalent answer detected.

Recommended action:
Create or improve a pricing section.
```

All competitor findings must be backed by crawled evidence.

------------------------------------------------------------------------

# 12. Recommendation Engine

Build a recommendation engine that converts audit findings into
actionable tasks.

Every recommendation must contain:

-   Title
-   Category
-   Severity
-   Impact
-   Effort
-   Evidence
-   Explanation
-   Recommended action
-   Example
-   Affected URL
-   Implementation type

Severity:

``` text
CRITICAL
HIGH
MEDIUM
LOW
```

Prioritize recommendations using:

``` text
Priority = Impact × Confidence ÷ Effort
```

Do not create arbitrary recommendations.

Example:

``` text
HIGH

Add Organization structured data

Why:
No Organization schema was detected.

Impact:
Improves machine-readable entity understanding.

Affected:
https://example.com/

Suggested implementation:
Provide valid JSON-LD.
```

Also provide AI-generated fixes where appropriate.

Examples:

-   Generate meta title
-   Generate meta description
-   Generate FAQ
-   Generate JSON-LD
-   Generate missing answer section
-   Suggest internal links
-   Suggest page outline
-   Suggest content updates

The user must be able to review the generated fix before applying it.

------------------------------------------------------------------------

# 13. Automatic Fix Generator

Build a Fix Generator.

For each eligible recommendation, allow:

``` text
Generate Fix
```

Examples:

## Meta Title

Before:

``` text
Products | Acme
```

Suggested:

``` text
Project Management Software for Small Teams | Acme
```

## Missing Answer

Generate a concise answer section.

## Schema

Generate valid JSON-LD.

## FAQ

Generate relevant FAQ questions and answers.

## Internal Links

Suggest:

``` text
Source page
Target page
Suggested anchor text
Reason
```

Never automatically modify a customer's website without explicit user
authorization.

------------------------------------------------------------------------

# 14. Explainable Scoring Engine

Design an explainable scoring engine.

Do not use arbitrary AI-generated scores.

Suggested initial structure:

``` text
Technical SEO:              20%
Content Quality:            20%
AEO:                        20%
Entity/Semantic Clarity:    15%
Structured Data:             10%
Citation/Evidence Readiness: 10%
Internal Linking:             5%
```

These weights must be configurable.

Example AEO scoring:

``` text
Question Coverage:       30%
Answer Directness:       25%
Content Structure:        15%
FAQ/Knowledge Coverage:   10%
Entity Clarity:            10%
Structured Data:           10%
```

A final score must be calculated from individual checks.

Store:

``` typescript
{
  score: number;
  weight: number;
  rawScore: number;
  normalizedScore: number;
  checkResults: object[];
  calculationVersion: string;
}
```

Version the scoring methodology.

If scoring rules change from v1 to v2, historical audits must continue
displaying the score according to the version used at that time.

The system must be able to explain:

> Your score is 64 because...

and provide the exact checks responsible for the score.

Avoid claiming that this score represents an official Google, OpenAI,
Gemini, Claude, or Perplexity ranking factor.

------------------------------------------------------------------------

# 15. Dashboard

Build a professional SaaS dashboard.

Example:

``` text
Website:
example.com

Overall AI Search Readiness:
72/100
```

Category scores:

``` text
Technical SEO          82
Content                68
AEO                    61
Entity                 74
Structured Data        80
AI Search Readiness    59
```

Then show:

-   Critical Issues
-   High Priority Issues
-   Quick Wins
-   Content Gaps
-   Question Gaps
-   Competitor Gaps
-   AI Query Results

Create:

> What should I fix first?

Example:

``` text
1. Add Organization schema
2. Answer 14 missing customer questions
3. Improve pricing page
4. Add internal links to 7 important pages
5. Add author information
6. Add references to key factual claims
```

Provide drill-down navigation.

Clicking a score must show exactly how it was calculated.

Clicking an issue must show:

-   Problem
-   Evidence
-   Affected URL
-   Why it matters
-   How to fix
-   AI-generated example

Use a clean modern SaaS design.

Avoid excessive charts. Prioritize actionable information over
decorative analytics.

------------------------------------------------------------------------

# 16. Historical Tracking

Implement audit history.

Users should be able to compare:

``` text
September 2026
October 2026
November 2026
```

Track:

-   Overall score
-   Category scores
-   New issues
-   Resolved issues
-   New pages
-   Removed pages
-   Query visibility changes
-   Competitor changes
-   Content changes

Provide:

``` text
Score:
64 → 73

Improvement:
+9
```

Explain what caused the change.

------------------------------------------------------------------------

# 17. Database Design

Create a scalable Prisma/PostgreSQL schema.

Core entities should include:

``` text
User
Workspace
Website
Audit
CrawlJob
Page
PageLink
SEOCheck
ContentAnalysis
Entity
SchemaAnalysis
AEOAnalysis
GEOAnalysis
Query
QueryResult
Competitor
CompetitorAnalysis
Recommendation
GeneratedFix
Score
ScoreVersion
AuditChange
Report
```

Use appropriate indexes.

Use foreign keys and cascading behavior carefully.

Support multi-tenant SaaS architecture.

All workspace-owned records must be isolated by workspace ID.

------------------------------------------------------------------------

# 18. API Structure

Suggested API structure:

``` text
/api/auth

/api/websites
/api/websites/:id

/api/audits
/api/audits/:id

/api/crawls
/api/crawls/:id

/api/seo
/api/aeo
/api/geo

/api/entities
/api/schema

/api/queries
/api/query-results

/api/competitors
/api/competitor-analysis

/api/recommendations
/api/fixes

/api/reports
```

Use:

-   DTO validation
-   Authentication guards
-   Authorization
-   Rate limiting
-   Pagination
-   Proper HTTP status codes
-   Structured error responses

------------------------------------------------------------------------

# 19. Security Requirements

Implement:

-   Authentication
-   Authorization
-   Workspace isolation
-   Input validation
-   URL validation
-   SSRF protection
-   Crawl limits
-   Rate limiting
-   Request timeouts
-   Safe HTML processing
-   Sanitization
-   API key encryption
-   Secrets through environment variables
-   Audit logging

## SSRF Protection

The crawler must not allow users to make the server request:

-   localhost
-   127.0.0.1
-   private IP ranges
-   cloud metadata endpoints
-   internal network addresses

Validate DNS resolution and final redirects.

Re-check every redirect destination.

------------------------------------------------------------------------

# 20. Performance Requirements

The crawler must be asynchronous.

Do not keep HTTP requests open while crawling large sites.

Use:

``` text
API Request
    ↓
Create Crawl Job
    ↓
Queue
    ↓
Worker
    ↓
Crawl
    ↓
Analyze
    ↓
Store
    ↓
Update Progress
```

The frontend should poll or subscribe to progress updates.

Support:

``` text
0%
25%
50%
75%
100%
```

with meaningful status messages.

------------------------------------------------------------------------

# 21. Testing Requirements

Write tests for:

## Crawler

-   URL normalization
-   robots.txt
-   sitemap
-   redirects
-   duplicate URLs
-   crawl limits
-   SSRF protection

## SEO

-   Missing title
-   Duplicate title
-   Missing H1
-   Canonical
-   Schema
-   Broken links

## AEO

-   Question detection
-   Answer detection
-   Missing answers
-   Partial answers

## Scoring

Test that identical input always produces identical scores.

## Competitor Analysis

Ensure the same methodology is used for target and competitor websites.

## Security

Test:

-   SSRF
-   malicious URLs
-   invalid URLs
-   unauthorized workspace access
-   rate limits

------------------------------------------------------------------------

# 22. Development Strategy

Do not build the entire application in one step.

Work in milestones.

## Milestone 1

-   Architecture
-   Prisma schema
-   NestJS modules
-   React application structure
-   Authentication
-   Website/project model

## Milestone 2

-   Website crawler
-   Crawl jobs
-   Sitemap
-   robots.txt
-   Page extraction
-   Crawl storage

## Milestone 3

-   Technical SEO analyzer
-   Deterministic scoring

## Milestone 4

-   Content analyzer
-   Entity analyzer
-   Schema analyzer

## Milestone 5

-   AEO analyzer
-   GEO/AI Search Readiness analyzer

## Milestone 6

-   Query generation
-   Query management

## Milestone 7

-   AI/search query testing integrations

## Milestone 8

-   Competitor analysis
-   Gap analysis

## Milestone 9

-   Recommendation engine
-   AI-generated fixes

## Milestone 10

-   Dashboard
-   Reports
-   PDF export

## Milestone 11

-   Historical tracking
-   Scheduled audits
-   Change detection

------------------------------------------------------------------------

# 23. Coding Agent Instructions

You are the senior engineer responsible for implementing this platform.

For every milestone:

1.  Inspect existing code.
2.  Do not overwrite working functionality unnecessarily.
3.  Implement backend first where appropriate.
4.  Add database migrations.
5.  Add API validation.
6.  Add error handling.
7.  Add unit/integration tests.
8.  Test with real website data.
9.  Verify scoring calculations.
10. Document what was implemented.
11. Identify limitations honestly.

Do not create mock data and pretend it is real analysis.

If a feature requires an external API, create a provider abstraction and
clearly mark the integration boundary.

Prioritize correctness and explainability over visual polish.

At the end of each milestone provide:

-   Files created
-   Files modified
-   Database changes
-   APIs added
-   Tests added
-   Known limitations
-   Next milestone

------------------------------------------------------------------------

# 24. Product Positioning

Do not position the product as merely:

> SEO + GEO + AEO Checker

Position it as:

> **AI Search Readiness Platform**

Core message:

> Find out how well your website can be understood, retrieved, and
> represented by modern search and AI systems --- then get actionable
> recommendations to improve it.

------------------------------------------------------------------------

# 25. Killer User Workflow

The complete product workflow should be:

``` text
Enter URL
    ↓
Crawl Website
    ↓
Understand Website
    ↓
Analyze SEO
    ↓
Analyze Content
    ↓
Analyze Entities
    ↓
Analyze Structured Data
    ↓
Analyze AEO
    ↓
Analyze AI Search Readiness
    ↓
Generate Real User Queries
    ↓
Test Search / AI Visibility
    ↓
Analyze Competitors
    ↓
Find Gaps
    ↓
Prioritize Recommendations
    ↓
Generate Fixes
    ↓
User Reviews Fixes
    ↓
Implement Changes
    ↓
Re-run Audit
    ↓
Track Improvement
```

------------------------------------------------------------------------

# 26. Important Product Limitation

Never claim:

> "Our score tells you whether ChatGPT will recommend your website."

Never claim:

> "Your website has an 87% probability of appearing in AI answers."

Never claim:

> "This is Google's official GEO score."

Instead describe the result as:

> **AI Search Readiness Score**

and clearly explain the measurable factors behind it.

The product should distinguish between:

-   Observed data
-   Deterministic analysis
-   AI interpretation
-   External provider results
-   Recommendations
-   Predictions

Do not present predictions as facts.

------------------------------------------------------------------------

# 27. Final Product Goal

The final product should answer four questions for the customer:

### 1. How ready is my website?

``` text
AI Search Readiness: 72/100
```

### 2. Why?

``` text
Entity clarity is strong.
Question coverage is weak.
Structured data is incomplete.
Several important pages have weak internal linking.
```

### 3. What am I missing?

``` text
14 customer questions
6 topical subtopics
3 important entities
8 internal links
2 structured-data opportunities
```

### 4. What should I do?

``` text
1. Fix pricing page
2. Add Organization schema
3. Add FAQ section
4. Improve entity/about information
5. Add internal links
6. Add supporting references
```

The platform should turn website analysis into a **prioritized action
plan**, not just another SEO score.
