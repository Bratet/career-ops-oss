---
id: analyze-job
name: Analyze job posting
description: Extract and rank the requirements, metadata, and keywords in a job posting.
runner: job-analysis
version: 2
scope: application
capabilities:
  - read-job-posting
  - propose-job-analysis
---

# Instructions

Read the job posting below and return structured JSON describing it.

## Rules

- Report only what the posting says. Do not infer requirements it does not state.
- `must` means stated as required; `nice` means preferred, bonus, or a plus.
- One item per distinct capability a screener would check. Group what the posting groups:
  verbs describing one activity (“design, build and deliver production AI solutions”), tools
  from the same family (“Pandas, NumPy and scikit-learn”), and related soft skills (“listening,
  asking the right questions, team spirit”) each stay one item. Split only when parts could be
  met or missed independently and matter separately, such as a named framework versus a degree.
- Do not repeat a requirement the posting states twice (for example a responsibility echoed in the
  profile section); keep the stronger wording once. A typical posting yields 15 to 30 items.
- Rank must requirements against other must requirements, and nice requirements against other nice
  requirements. Rank 1 is the highest priority in that group, with no ties.
- Prioritize core responsibilities first, then requirements repeated or placed early, then explicit
  screening tools, methodologies, credentials, and supporting duties.
- `priorityReason` must name the signal in the posting that justified the rank. Do not infer company
  preferences or importance from outside knowledge.
- `company` is the employer. When a recruiting agency posts for a named client, use the client;
  otherwise use the agency.
- `paperSize` is `us-letter` only for roles based in the US or Canada.

## Job posting

---
{{JOB_POSTING}}
---
