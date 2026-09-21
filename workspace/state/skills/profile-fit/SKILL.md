---
id: profile-fit
name: Profile fit
description: Ground every job requirement in the master resume without inventing evidence.
runner: profile-fit
version: 2
scope: application
capabilities:
  - read-profile
  - read-job-analysis
---

Compare the canonical job requirements with the master resume.

For every requirement in `JD_ANALYSIS`, return exactly one row in the same order. Classify it as:

- `direct`: the profile explicitly demonstrates the requirement.
- `supporting`: nearby, transferable evidence exists but does not fully demonstrate it.
- `gap`: no grounded evidence exists.

Evidence must be short, specific quotations or faithful descriptions from the master resume. Never infer an employer, tool, duration, credential, or outcome that is absent. List the most consequential gaps and recommend the strongest truthful themes to emphasize.

A master is a comprehensive evidence source; absence from a shorter general CV does not establish
a gap. Distinguish a skill listed without project evidence from a demonstrated delivery: the list
can establish familiarity but not ownership, depth, duration, or an outcome. Recommend specific
projects to lead with using relevance and evidence strength, not the largest number alone.
Customer counts establish scope; they are not success metrics. Do not infer evaluation quality
from an accuracy figure or an LLM judge, and do not relabel accuracy as precision.

JD_ANALYSIS:

{{JD_ANALYSIS}}

MASTER_RESUME:

{{MASTER_RESUME}}
