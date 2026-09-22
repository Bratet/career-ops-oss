---
id: tailor-cv
name: Tailor CV
description: Tailor the general resume to a job using the full master as evidence for additions and replacements.
runner: cv-operations
version: 6
scope: application
capabilities:
  - read-job-analysis
  - read-master-resume
  - propose-cv-operations
---

# Instructions

You are tailoring the general resume below for one job posting. The runtime also supplies the
language-matched master and candidate preferences. The general resume is the editorial baseline;
the master is the complete factual evidence source. Consult BOTH before proposing any changes.
Preserve good existing wording and structure, but replace weaker projects when the master has
stronger evidence for this role. Do not treat the master as merely an optional source of filler.
Facts absent from both sources must not be invented; flag conflicting source claims rather than
silently choosing the stronger one. Keep unchanged content without generating no-op edits.

## My custom rules

- Keep the finished CV to exactly one page and use the page well.
- Preserve the candidate's voice and factual meaning.
- Treat the master as a complete evidence inventory, not a document to shorten in place.
  Select a focused application CV; leaving a skill or project out does not remove it from the master.
- Use one direct bullet per selected project. Keep its implementation and evaluation together;
  shorten an overloaded bullet instead of splitting the same project into several bullets.
  Do not combine separate projects under an umbrella claim or invent a shared client.
- Prefer concrete achievements, outcomes, and demonstrated tools over generic claims.
- Never invent or upgrade a skill, metric, scope, employer, title, credential, or responsibility.

- Preserve explicit experience framing in the source. University freelancing must not be
  silently counted as extra full-time industry seniority; retain its context and real dates.
- Keep proficiency qualifiers such as basic familiarity. A posting's stack is not evidence
  that the candidate has used it.
- Distinguish a consulting employer from the client whose employees used a product. Do not
  turn a client-facing project into an internal tool for the consulting firm.
- Keep prose plain and close to the master. Avoid promotional language, em dashes, and
  formulaic lists of three. Prefer a clear project fact over an impressive-sounding claim.
- Evaluation tooling is not proof of an evaluation result: do not infer judge calibration,
  representative sampling, or measured improvement from the presence of an LLM judge.

## Evidence plan

1. Plan what to keep, reword, reorder, replace, add, and remove, with reasons tied to the JD.
   Represent only actual changes as operations. Then work through requirements in the ranked order shown below: every must before every nice,
   and lower rank numbers first within each group.
2. For every requirement, find the strongest direct evidence in the master and classify it:
   - `lead`: decisive evidence for a top-ranked must; it belongs in the summary or first bullets.
   - `prove`: a concrete achievement or project directly demonstrates it.
   - `support`: it is truthfully present only in skills, education, or adjacent experience.
   - `gap`: the master contains no evidence. Do not manufacture an answer.
3. Select content by coverage, not chronology alone. Cover the highest-ranked musts first, then
   remaining musts, then the highest-ranked nice requirements. Prefer one strong item that proves
   several related requirements over repetitive items.
4. Keep the employment timeline understandable, but remove entries, projects, bullets, and whole
   sections that add less evidence than the space they consume, respecting explicit user choices.

## Top-third strategy

- If the real titles do not clearly connect to the target role, create a truthful professional
  headline that bridges the candidate's actual title and demonstrated target-role experience.
- Retain an existing concise summary and explicitly chosen sections unless the user requests
  their removal. Shorten the summary before dropping it merely to save space. Respect the
  supplied section order by default. A missing summary may be imported from the master.
  Reorder cv.sections only when useful for the role or explicitly requested.
- Respect an explicitly chosen summary; do not force every posting keyword into it.
  Use the first achievement bullets to demonstrate requirements the summary does not mention.
- Put the most relevant achievement bullets first in each retained entry.

## Keywords and wording

- Use exact posting terminology only where the master already proves the underlying claim.
- Put keywords inside natural statements tied to work, projects, outcomes, or existing skills.
- Never create a keyword dump, stack trailer, or unsupported tool list.
- Preserve useful numbers and outcomes. Every wording change must improve relevance, clarity,
  or keyword alignment for a ranked requirement.
- Distinguish scale from outcome: a customer or record count establishes scope, not success.
  Do not turn customers covered into an exact count of IDs produced, exposure reviewed into
  money saved, or accuracy into precision. Retain metric names and evaluation qualifiers.
- Keep Skills selective and easy to scan: choose relevant items in existing categories,
  remove overlaps, and leave the full inventory in the master. Do not restore a long tools
  list merely to increase page fill.
- A gap stays a gap.

## Page budget

Select for relevance and strength of evidence before rendering. One page is a hard limit;
page-fill percentage is diagnostic, not a quality score or an objective. Do not add tools,
distinctions, or weak projects just to fill space. If relevant evidence is missing, replace
lower-value content, not necessarily append. Do not change the locked design.

Repair feedback reports the actual PDF page count and rejected operations. Fix rejected edits
and cut lower-value evidence if the result overflows. Return a complete replacement plan against
the original general resume, not a patch against the previous attempt. The master snapshot is
also unchanged across attempts. Empty operations are valid when the baseline already fits the
role; still supply the complete requirement assessment. Visual layout remains unverified unless
images were actually inspected.

## Language

Write natural prose in the document's language, not a literal translation. Preserve the chosen
register consistently: French nominal openings such as "Conception", "Développement", and
"Automatisation" are valid; do not force past participles. Keep established technical English
terms when used by the source or requested by the candidate, including accuracy, recall,
F1-score, fine-tuning, RAG, and MLOps. Accuracy and precision are distinct metrics; translation
must never substitute one for the other. Prefer clear French verbs over calques such as
"router les demandes" or "scorer les clients".

Use render feedback to verify page count; a one-page source estimate does not establish a
one-page PDF. Do not claim visual inspection, readable spacing, or working links from page
count alone. Report any checks the runner could not perform.

## Operations contract

Return operations, never a rewritten document. Paths use the dotted convention
`cv.sections.Experience[0].highlights[2]` and must start with `cv.`. Destination paths and indices refer to the original GENERAL resume before edits. Source paths
refer to the MASTER. Only import of a missing section and set of cv.headline may create paths.

- `drop` — remove an entry, highlight, or whole section. Supply `path` and `why`.
- `reword` — replace one text value. Supply `path`, `from` (exact current text), `to`, and `why`.
- `reorder` — permute a sequence or the existing cv.sections mapping (indices follow source key order). Supply `path`, `order` (every index exactly once), and `why`.
- `set` — create or replace `cv.headline` only. Supply `path`, `value`, and `why`.

- `import` — bring in evidence from the master. Supply `sourcePath`, destination `path`, and `why`.
  Import a highlight into the same role's highlights sequence, an entry into its matching section,
  or a missing section using its original name (source a whole section or a single selected entry). To replace a highlight, target its existing
  scalar path; to enrich a skills bucket, target its existing details scalar and source a master
  details scalar. Use `to` only for a faithful text adaptation (it can retain destination evidence
  when replacing text); otherwise copy exactly. For sequence additions, `index` inserts before
  that ORIGINAL index; null appends. Do not reword or drop the same destination in another op.
  Projects must stay under the same employer, title, and dates. Importing an entire entry/section
  copies all its content: choose focused highlight imports when possible. New sections append;
  they cannot be reordered in the same plan. Do not target newly imported paths in other ops.
  Leave `sourceExpect` null; the server records evidence fingerprints for safe review replay.

Leave fields an operation does not use as `null`. Also return one `requirementActions` row for every
ranked requirement, in the same order. The output schema supplied separately defines the exact shape.

{{RENDER_FEEDBACK}}

## The posting

{{POSTING_ANALYSIS}}

## The CV

```yaml
{{CV_YAML}}
```

Return a complete selection plan. If repair feedback is present, the CV above is still the original:
replace the prior plan completely so content cut too eagerly can be restored.
