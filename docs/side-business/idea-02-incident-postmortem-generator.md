# AI Incident Post-Mortem Generator — Phase 3 Deep Analysis

---

## 1. Problem Statement

**Core pain:** After an incident resolves, the hardest part begins. SRE/DevOps teams must reconstruct a timeline from scattered Slack threads, PagerDuty alerts, Datadog graphs, and Zoom call notes — then write a structured document under pressure, often while exhausted.

**Day-to-day manifestation:**
- On-call engineer spends 2–4 hours per P1/P2 post-mortem manually correlating timestamps across 4–6 tools
- Post-mortems get skipped for P3/P4 incidents entirely — estimated 60–70% skip rate at companies without dedicated SRE culture
- Documents are inconsistent quality: some have root cause, many have vague action items ("monitor more closely")
- Action items rot in Confluence/Notion with no owner or due date follow-through

**Consequences of inaction:**
- Repeat incidents: Google SRE data suggests 30–40% of incidents are repeat failures
- Audit risk: SOC 2 Type II requires evidence of post-mortem process; missing docs = findings
- Team morale: post-mortem fatigue causes burnout, especially at companies doing 10+ incidents/month
- Lost institutional knowledge when engineers leave without documented learnings

**Quantified pain:**
- 2 hours avg. post-mortem time × $150/hr fully-loaded SRE cost = $300/incident
- A 50-person eng org with 8 P1/P2s/month = $2,400/month in post-mortem labor
- That same org likely skips 20 P3 post-mortems — 20 missed learning opportunities

---

## 2. Customer Segment

### Primary: Mid-Market SRE/Platform Teams

| Attribute | Profile |
|-----------|---------|
| Job title | SRE Manager, Staff SRE, DevOps Lead |
| Company size | 50–500 engineers |
| Tech stack | AWS/GCP, Kubernetes, Datadog or Prometheus, PagerDuty |
| On-call setup | Rotating on-call, 5–20 incidents/month, dedicated SRE team |
| Budget owner | Engineering Manager or VP Engineering |
| Budget range | $200–$2,000/month without procurement friction |

### Secondary: Engineering Managers at Fast-Growing Startups (20–50 engineers)

No dedicated SRE. Incident process is ad-hoc. SOC 2 audit coming. Need to formalize process quickly without hiring. Will pay for a tool that does 80% of the work automatically.

### Anti-Persona

- Companies already using Rootly or FireHydrant (full incident management platform)
- Enterprise with dedicated incident management team and custom tooling
- Teams with fewer than 2 incidents/month (not enough pain)
- Organizations on Opsgenie/VictorOps without PagerDuty (integration gap)

### Acquisition Channels

1. PagerDuty App Directory listing (high intent, low friction)
2. HackerNews "Show HN" launch post
3. SRE-focused Slack communities (SRE Weekly, Reliability Engineers)
4. Content: "How to write blameless post-mortems" SEO articles
5. Dev.to / Medium technical posts targeting "post-mortem automation" keywords

### Decision-Making Process

Individual SRE discovers tool → shares with manager → 14-day trial → manager approves purchase on credit card. No legal/procurement for sub-$500/month. Above $1,000/month triggers VP approval.

---

## 3. Competitor Landscape

### Direct Competitors

| Tool | Pricing | Focus | Weakness |
|------|---------|-------|----------|
| Rootly | ~$1,200/mo (10 users) | Full incident mgmt | Expensive, complex onboarding |
| FireHydrant | ~$800/mo | Full incident mgmt | Overkill for small teams |
| Blameless | ~$1,500/mo | Enterprise SRE platform | Enterprise-only, long sales cycle |
| PagerDuty native | Included in PD Advanced | Basic postmortem form | No AI, no auto-population |
| Allma | ~$500/mo | Slack-based incident collab | Slack-only, limited doc quality |

### Indirect Competitors

Notion/Confluence templates, Google Docs with manual copy-paste, internal scripts. These are the real competition for 80% of the market.

### Positioning Map

```
                    AI-Generated
                         |
     [This Product] -----+-----  [Rootly/FireHydrant]
                         |       (full platform)
  Focused/Affordable ----+----  Expensive/Full-Suite
                         |
                    Manual/Template
```

### Key Differentiators

- **Narrowly scoped:** Does one thing extremely well — no incident management bloat
- **PagerDuty-native integration:** Works in 5 minutes, not 5 days
- **Per-incident pricing available:** Pay only when incidents happen
- **Solo/small team friendly:** No 10-seat minimums

### Moat Building

- Proprietary training data from anonymized post-mortems improves output quality over time
- Network effects via shared action item templates by incident type
- Integrations breadth (Jira, Linear, Slack) increases switching cost

---

## 4. Why Now

**SOC 2 tailwinds:** 60% YoY growth in SOC 2 certifications among Series A–C startups. Post-mortem documentation is a direct control requirement. Companies need evidence fast.

**LLM timing:** GPT-4-class models (mid-2023 onward) are now reliable enough to produce coherent technical narratives from structured data. Prior to 2023, this product would produce unusable output.

**Post-incident fatigue trend:** On-call burnout is a top-5 engineering retention issue. Tools that reduce cognitive load post-incident have a direct retention ROI pitch.

**Ecosystem timing:** PagerDuty's App Directory has 500+ integrations but no strong AI post-mortem player. First-mover in this specific slot gets organic discovery.

---

## 5. Pricing Hypothesis

### Recommended Tiers

| Tier | Price | Includes | Target |
|------|-------|----------|--------|
| Starter | $49/mo | 10 postmortems/mo, PagerDuty integration, PDF export | Small teams, trial conversion |
| Growth | $149/mo | Unlimited postmortems, Datadog integration, Jira/Linear action items, Slack digest | 20–100 eng orgs |
| Team | $399/mo | Everything + custom templates, SSO, audit log export, priority support | 100–500 eng orgs |
| Enterprise | Custom ($800+) | On-prem LLM option, custom integrations, SLA | 500+ eng |

**Rationale:** Comparable SaaS tools (Sleuth for DORA metrics, Cortex for service catalog) charge $150–$400/month for teams of similar size. Post-mortem is higher-value than metrics dashboards — $149–$399 is defensible.

**Per-incident option:** $9/incident add-on for Starter overages. Psychologically easy to justify ($300 labor saved vs. $9 cost).

**Annual discount:** 20% off annual, increases LTV and reduces churn risk.

---

## 6. Risks

| Risk | Severity | Mitigation | Kill Criteria |
|------|----------|------------|---------------|
| PagerDuty API changes break integration | High | Pin API version, monitor changelog, build Opsgenie fallback | PD removes public API access |
| LLM output quality too inconsistent for professional docs | High | Structured prompting + user editing layer + human-in-the-loop review before publish | >30% of users report docs need full rewrite |
| Rootly/FireHydrant adds AI post-mortem feature | Medium | Compete on price and simplicity; they won't sunset their broader platform | Both incumbents ship comparable AI feature within 6 months |
| Slow adoption — teams won't change post-mortem habits | Medium | Make it zero-friction: auto-draft appears in Slack 30min after incident closes | <5 paying customers after 3 months of active marketing |
| Data privacy concerns block sales | Medium | SOC 2 Type II certification (6–9 months), offer data processing agreement, EU data residency roadmap | Large segment of prospects cite privacy as blocker in >40% of lost deals |

---

## 7. Expected Timeline to Revenue

### Week 1–2: Build MVP
- PagerDuty OAuth integration + incident data fetch
- LLM post-mortem generation (GPT-4o via API)
- Basic web UI: review, edit, export PDF
- Stripe checkout for Starter tier

### Week 3–4: Launch
- PagerDuty App Directory submission
- "Show HN" post
- 10 beta users from SRE Slack communities (free 60-day trial)
- Collect feedback, iterate on prompt quality

### Month 2–3: Growth
- Datadog integration
- Jira/Linear action item push
- SEO content: 4 posts targeting post-mortem keywords
- Onboard Growth tier, enable annual billing

### Revenue Milestones

| Milestone | Target | Assumptions |
|-----------|--------|-------------|
| MRR at 3 months | $500 | 5 Starter + 1 Growth customer |
| MRR at 6 months | $2,500 | 10 Starter + 6 Growth + 1 Team |
| MRR at 12 months | $8,000 | 20 Starter + 20 Growth + 5 Team |
| Break-even (LLM + infra costs) | Month 2 | LLM costs ~$50/mo at early volume |

**12-month ARR projection:** ~$96,000. Viable side business; requires ~10 hrs/week post-launch.

---

*Analysis date: 2026-03-14. Competitor pricing based on publicly available information; verify before go-to-market.*
