# dbt Documentation Auto-Generator — Phase 3 Deep Analysis

## 1. Problem Statement

**Core pain:** dbt models accumulate without documentation. Engineers skip writing descriptions because it is tedious, and no one enforces it until an incident occurs.

**Day-to-day manifestations:**
- New analyst joins and spends 2–3 days reverse-engineering what `fct_orders_adjusted` actually means
- Data team fields 5–10 Slack questions per week ("what does this column mean?", "is this table safe to use in production?")
- PRs merge without descriptions because reviewers focus on SQL correctness, not docs
- `dbt docs generate` produces a site full of empty description fields — technically deployed, practically useless

**Consequences of not solving it:**
- Onboarding cost: estimated 3–5 days per new data hire spent on tribal knowledge transfer
- Incident risk: undocumented transformation logic leads to misuse; one wrong metric in a board deck costs significant credibility
- Technical debt compounds: once 200+ models exist undocumented, catching up manually is nearly impossible

**Quantified pain:**
- Mid-size data team (5 engineers): ~10 hrs/week lost to documentation questions and onboarding explanations
- At $80/hr fully-loaded cost: $40K+/year in wasted time for a single team
- dbt Cloud has 30,000+ paying accounts (2023 disclosure); even 1% addressable = 300 teams with this pain

---

## 2. Customer Segment

### Primary: Data Engineering Lead at a Mid-Size Tech Company
| Attribute | Profile |
|-----------|---------|
| Title | Senior Data Engineer, Analytics Engineer, Data Platform Lead |
| Company size | 50–500 employees, 3–15 person data team |
| Stack | dbt Core or dbt Cloud, Snowflake/BigQuery/Redshift, GitHub |
| Maturity | Has 50–500 dbt models, CI/CD in place, docs neglected |
| Budget authority | $500–$2K/mo without VP approval |

### Secondary: Consulting / Agency
dbt consultants who deliver projects to clients and need to hand off documented codebases. Strong incentive: documentation is billable but painful. Will pay to compress 2 days of work into 20 minutes.

### Anti-Persona
- Solo analyst at a startup with 10 models (problem is too small)
- Enterprise with a dedicated data governance team (will buy Atlan or Alation instead)
- Teams on legacy SQL warehouses not using dbt (wrong tool entirely)

### Acquisition Channels
- dbt Slack community (#tools-and-integrations, #getting-started) — 50,000+ members
- dbt Community Discourse and GitHub Discussions
- LinkedIn targeting "Analytics Engineer" + "dbt" + company size filter
- Content SEO: "how to document dbt models", "dbt schema.yml generator"

### Decision Process
Individual contributor discovers the tool, shares in team Slack, lead approves via credit card. No procurement cycle below $500/mo. Above $1K/mo expect a 2–4 week evaluation with a manager sign-off.

---

## 3. Competitor Landscape

### Direct Competitors
| Tool | Pricing | Approach |
|------|---------|----------|
| dbt Cloud built-in docs | Included in dbt Cloud ($100+/mo/seat) | Static generation, no LLM descriptions |
| Metaplane | ~$800/mo | Data observability focus, docs secondary |
| Select Star | ~$400/mo | Auto-documentation but catalog-first, not dbt-native |
| Castor | ~$500/mo | Catalog + lineage, manual descriptions |
| DataHub (OSS) | Free / self-hosted | No LLM generation, high ops overhead |

### Indirect Competitors
- DIY: team writes a Python script calling OpenAI API against their schema.yml — low quality, not maintained
- ChatGPT/Claude direct prompting: copy-paste SQL, ask for description — works but doesn't scale or persist

### Positioning Map

```
High Automation
        |
[THIS PRODUCT]     [Select Star]
        |
Low Price ——————————————— High Price
        |
[DataHub OSS]      [Atlan/Alation]
        |
Low Automation
```

### Key Differentiators
- dbt-native: understands `ref()`, `source()`, DAG lineage out of the box
- Writes back to `schema.yml` — output is version-controlled, not locked in a SaaS catalog
- Zero-config: connects to a GitHub repo, no warehouse credentials required for basic operation
- Solo-founder speed: can ship dbt-specific features faster than horizontal catalog vendors

### Moat Opportunities
- Proprietary training data: descriptions generated and approved by users improve future suggestions (flywheel)
- dbt package ecosystem integration (dbt-utils, dbt-expectations metadata awareness)
- Team review workflow: humans approve/edit LLM output, building a labeled dataset over time

---

## 4. Why Now

- **LLM maturity (2023–2025):** GPT-4 and Claude 3 produce SQL-aware descriptions accurate enough to be useful with minimal editing. This was not viable two years ago.
- **dbt adoption spike:** dbt went from niche to default analytics engineering tool. dbt Cloud reached 30K+ accounts; the installed base is large enough to support a niche SaaS.
- **Documentation debt is peaking:** Teams that adopted dbt in 2021–2022 now have hundreds of undocumented models and feel the pain acutely.
- **AI tooling normalization:** Buyers are pre-sold on "LLM + developer workflow" tools (GitHub Copilot, Cursor). The purchase motion is familiar.
- **dbt Core v1.6+ improved `schema.yml` structure:** Makes parsing and writing back programmatically more reliable.

---

## 5. Pricing Hypothesis

### Tiers

| Tier | Price | Limit | Target |
|------|-------|-------|--------|
| Starter | Free | 1 project, 50 models | Top-of-funnel, indie/solo |
| Pro | $49/mo | 3 projects, unlimited models | Small teams (2–5 engineers) |
| Team | $149/mo | 10 projects, team review workflow | Mid-size teams (5–15 engineers) |
| Business | $399/mo | Unlimited + SSO + priority support | Larger orgs, consultancies |

**Rationale:** Comparable dev tools (Metabase, Retool, Hex) price in the $50–$500/mo band for teams. The problem saves 5–10 hrs/week, making $150/mo obviously ROI-positive. Annual billing at 20% discount improves cash flow.

**Expected conversion:**
- Free → Pro: 5–8% (strong intent signal when they connect a real repo)
- Pro → Team: 20–30% (natural upgrade when team size grows)
- Churn target: under 5%/mo (stickiness comes from generated content living in their repo)

**Revenue model:** Per-project flat rate. Per-seat creates friction in small teams; per-project aligns cost with value delivered.

---

## 6. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| 1 | dbt Labs ships native LLM docs | Medium | High | Build write-back + review workflow they won't prioritize; stay faster on niche features |
| 2 | LLM output quality insufficient for trust | Medium | High | Human review step built into core UX; ship with edit+approve, not auto-publish |
| 3 | Too small a market (niche within niche) | Low | High | Validate with 10 paying customers before building team features |
| 4 | GitHub/dbt API changes break parsing | Low | Medium | Pin to stable dbt Core manifest schema versions; automated integration tests |
| 5 | Solo founder bandwidth | High | Medium | Scope strictly: no warehouse connections in v1, no multi-cloud, no mobile |

**Kill criteria:**
- Cannot reach $1K MRR within 4 months of public launch
- Fewer than 5 users activate (connect repo + generate docs) in first 30 days of free tier
- dbt Labs announces direct feature parity at dbt Coalesce conference

---

## 7. Expected Timeline to Revenue

### Week 1–2: Core Build
- CLI tool: parse dbt manifest.json + schema.yml, call LLM, write descriptions back to schema.yml
- Web UI: GitHub OAuth, repo connect, model browser, approve/reject interface
- Deploy on Railway or Fly.io; basic auth

### Week 3–4: Launch
- Post in dbt Slack #tools-and-integrations with a 2-minute demo video
- Publish "I built a tool to auto-document your dbt models" on Substack/LinkedIn
- List on Product Hunt (aim for #3–5 in Dev Tools category)
- Offer free 1:1 onboarding sessions to first 20 users

### Month 2: Growth
- SEO content: 3 posts targeting "dbt documentation" queries
- Reach out to dbt consultancies directly (10 DMs/week)
- Instrument activation funnel; fix top drop-off point
- Add Slack notification integration (team review workflow)

### Revenue Milestones

| Milestone | Target Date | MRR |
|-----------|-------------|-----|
| First paying customer | Week 5 | $49 |
| 3-month mark | Month 3 | $500–$1,000 |
| 6-month mark | Month 6 | $2,000–$5,000 |
| 12-month mark | Month 12 | $8,000–$15,000 |

At $149 average MRR per customer, $5K MRR requires ~34 paying teams — achievable given the size of the dbt community and a focused distribution strategy.
