# career-ops

A local web app for running the job-application pipeline: paste a posting, let an
LLM read it, seed a tailored CV YAML, edit it against a live rendercv preview, and
track every application through to an offer.

It is **localhost-only by design**. It spawns CLIs (`rendercv`, `claude`, `codex`)
and reads and writes the real repo, so every route handler runs on Node and none of
it is deployable to a serverless host.

---

## What it does

| Page | What it's for |
|---|---|
| `/` Dashboard | applications per week, status funnel, score distribution, response rate, week-over-week deltas |
| `/applications` | the tracker — sortable table over `workspace/state/applications.md`, with a 4-dot indicator for which documents each folder actually has |
| `/applications/[key]` | canonical application workspace: overview and fit, persistent resume draft/preview, source files, runs, and assistant |
| `/profile` | edit the English or French master resume — the source material for every tailored CV |
| `/plan` | Apply plan — a board of saved job-search URLs to return to |
| `/applications/[key]/editor` | compatibility redirect to the Resume tab in the canonical workspace |
| Header **New application** | opens a posting dialog → engine analyzes it → creates a `Preparing` application and opens its workspace |

---

## Requirements

- **Node 20+** (developed on v23)
- **rendercv v2.8+** on `PATH` (or importable as `python3 -m rendercv`)
- At least one LLM CLI, logged in:
  - `claude` — [Claude Code](https://claude.com/claude-code), `claude login`
  - `codex` — `codex login`

Both CLIs authenticate through your **subscription**, not an API key. The app never
reads `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`; if a CLI is logged out, the engine
pill in the header says so instead of failing mid-request.

> `claude -p` reports `total_cost_usd` with `costBasis: "list"`. Under a
> subscription that is a list-price *equivalent*, not money billed — the app does
> not display it as spend, and neither should anything built on top of it.

## Running it

```bash
make engines     # check claude / codex / rendercv are installed and logged in
make setup       # install deps, then link any existing workspace/applications/ folders
make dev         # http://localhost:3000
```

`make setup` runs the reconcile step that links folders under `workspace/applications/`
to their tracker rows by name. Anything it can't match confidently is left alone and
surfaces in the UI as "link folder →" with a dropdown of unclaimed folders. It
never guesses.

## Make it yours

This is a personal-use tool: it's built around one candidate's identity and
master resumes, not a multi-tenant product. To use it for yourself:

1. `cp config/candidate.example.json config/candidate.json` and set `fullName`
   to your own name. This drives every generated filename (`cv-<you>.yaml`,
   `<You>.pdf`, ...). Optionally add `confidentialTerms` — names that should
   never appear on a generated resume or cover letter (e.g. a past employer's
   confidential clients); `src/lib/validate.ts` blocks a render if any appear.
2. Add your own **master** resume(s) as
   `workspace/resumes/masters/master-resume-english.yaml` and/or `-french.yaml`
   — the complete, comprehensive evidence source (see `templates/tailored-design.yaml`
   for the required design block).
3. Add your own **general** resume(s) as `workspace/resumes/own/cv-<you>-en.yaml`
   and/or `-fr.yaml` (matching the slug from step 1) — a shorter, balanced CV that
   seeds every new tailored application. Edit it on **Profile**. Tailoring then
   imports stronger evidence from the master where it helps a specific posting.
4. `workspace/state/applications.md` starts empty; `workspace/applications/`
   fills up as you create applications through the app.

## Make targets

`make` on its own prints the list.

| Target | What it does |
|---|---|
| `make dev` | dev server |
| `make build` / `make start` | production build and serve, still localhost-only |
| `make stop` | free the port when a server is left running |
| `make check` | typecheck |
| `make test` | parse → serialize `workspace/state/applications.md` and assert it comes back **byte-identical**, plus the table invariants |
| `make reconcile` | rebuild `workspace/state/app-index.json` from folder names |
| `make engines` | report whether `claude`, `codex`, and `rendercv` are available |
| `make clean` / `make nuke` | drop `.next/` / also drop `node_modules/` |

Every target takes `PORT=` (`make dev PORT=4000`). The npm scripts underneath are
unchanged if you'd rather call them directly.

Run `make test` before shipping anything that touches `src/lib/tracker.ts`. That
file is the only writer of an irreplaceable, git-tracked file.

> Don't run `make build` while `make dev` is live — the build replaces `.next/`
> under the dev server and every page starts 404ing until you restart it.

---

## How it's put together

### Data (`src/lib/`)

There is no database. `workspace/state/applications.md` **is** the database — the same markdown
table that was hand-edited before, still hand-editable now.

- `paths.ts` — every path in the repo, resolved once. Nothing else builds a path.
- `tracker.ts` — parses and serializes the 9-column table. Writes are atomic
  (temp file + `rename`), touch only the row that changed, and reject any cell
  containing `|`, which would silently corrupt the table.
- `appIndex.ts` — the tracker has no slug column, so `workspace/state/app-index.json` maps
  row id → folder name. `reconcile()` matches on slug+date, then date+prefix, then
  date alone, and reports which tier each match came from.
- `applications.ts` — joins tracker rows to what is actually on disk. Every
  document is optional: most legacy folders are incomplete, and the UI renders
  that rather than erroring.
- `workspaces.ts` — atomically persists versioned drafts, pending proposals,
  first-applied timestamps, and hash-aware profile-fit jobs with optimistic revisions.
- `weeks.ts` — Monday-anchored bucketing, empty weeks filled in, the current week
  marked partial so a Tuesday isn't read as a collapse in output.

### Validation (`src/lib/validate.ts`)

The hard rules, enforced on every render:

- no names from `config/candidate.json`'s `confidentialTerms` (e.g. a past
  employer's confidential client names)
- no `location` key anywhere in the CV
- no `[bracketed placeholders]`
- no em dashes
- the design block must match `templates/tailored-design.yaml` exactly, except
  `page.size`
- one page, with first-page fill reported for information only

Each failure carries a dotted path — `cv.sections.Experience[0].highlights[2]` —
and `yamlPath.ts` resolves that back to a character offset, so clicking a failure in
the editor moves the cursor to the line that caused it.

### Rendering (`src/lib/render.ts`, `pdf.ts`)

`rendercv` is spawned into a fresh temp dir per request, so concurrent renders can't
collide and there is nothing to clean up. It needs two env vars, both set by the
wrapper: `PYTHONPATH=<repo>/patches` for the nested-bullet fix, and
`PYTHONIOENCODING=utf-8`.

Page count and first-page fill come from `pdfjs-dist`; fill is the fraction of the
page above the lowest text baseline. A warm render is ~750ms, which is what makes
the live preview usable at a 500ms debounce with in-flight renders aborted.

### Engine (`src/lib/engine/`)

One interface, two adapters, switched from the header pill and persisted to
`workspace/state/settings.json` (gitignored).

```ts
interface Engine {
  id: 'claude' | 'codex'
  status(): Promise<{ ok: boolean; version?: string; reason?: string }>
  runStructured<T>(o: { prompt: string; schema: object; signal?: AbortSignal }): Promise<T>
}
```

Both run **read-only**. The model reads the posting and returns structured JSON; the
app does all the writing. Two things the adapters exist to handle:

- **Native streaming and conversations.** Codex uses app-server threads; Claude
  uses resumable `stream-json` sessions. Tailoring keeps one of those native
  conversations alive across every measured page-fit revision.

- **one schema, two validators.** OpenAI structured outputs rejects any schema whose
  `required` omits a key in `properties`, so every field is required and the
  genuinely optional ones are nullable instead. Claude accepts that shape too.

`/api/jd` streams NDJSON, because a 20-60s call behind a silent spinner reads as a
crash.

---

## Tailoring flow

The header **New application** dialog analyzes the posting, separates must requirements from nice-to-haves, and
ranks each group using signals in the posting: core duties, repetition, placement,
and explicit screening criteria. It seeds a per-application resume YAML from the
language-matched **general resume**, with the locked tailored design and JD paper size.

Every **Tailor** click reads the current general resume, full master, and candidate
guidance. The general resume supplies the editorial baseline; the master supplies
additional factual evidence. The CLI considers both before deciding what to keep,
reword, reorder, replace, add, or remove for the ranked requirements. A missing
fact remains a gap.

Operations are reviewable edits, including source-referenced imports of master
highlights, entries, skills text, and missing sections. Imports cannot move a
project under a different role, and source fingerprints prevent replay against
changed evidence. Existing sections can be reordered. The model cannot write
arbitrary objects or change the locked design.

The app validates and renders each plan in a staging buffer, with at most four
attempts to repair rejected edits or overflow. A valid one-page proposal ends the
loop: fill percentage is diagnostic, not a score to maximize. A no-change proposal
is valid. Each repair uses the same general and master snapshots. No application
file changes until acceptance, which re-renders the exact reviewed buffer. Page
count alone does not verify visual readability.

The model-facing instructions live in the filesystem skill registry under
`workspace/state/skills/<id>/SKILL.md`. Open **Skills** in the navigation (or **Edit skill**
beside **Tailor**) to edit, validate, duplicate, version, and restore them. The
`analyze-job` skill receives the posting; `tailor-cv` receives the current analysis,
general CV, master evidence, candidate guidance, and renderer feedback. The base
inputs use required `{{…}}` placeholders. Frontmatter selects a trusted runner and
its fixed capabilities. The structured output schemas and factual/structural
guards remain code-enforced even when instructions change.

Both **Analyze** and **Tailor** let you select any registered skill with the
compatible runner. Every execution is recorded under `workspace/state/runs/<run-id>/` with
the exact skill version, engine, application key, input manifest, progress events,
and a compact result or error summary. Open **Runs** globally, **AI runs** on an
application, or **Inspect run** beside an active feature to view that decision
trace. Full source documents are not copied into run history.

Each application page also has a persistent **Application coach**. It uses any
registered `advisory-chat` skill, reads a bounded snapshot of that application's
tracker row, posting, CV, and tailoring notes, and keeps the conversation in
`workspace/state/chats/<application-key>.json`. Answers expose the evidence they used,
suggested next actions, the exact skill version, and a link to the execution run.
The coach can propose a reusable skill rule. **Review change** shows the exact
Markdown diff and skill-version transition without writing anything. **Apply** is
a separate confirmation: it rejects a stale preview, archives the current skill,
creates the next version, and permanently marks that chat proposal as applied.
The model never receives direct file-write access.

The master resumes are the source of truth. Add or correct experience on **Profile**,
then tailor again; the tailoring pass does not invent accomplishments, change real
position titles, or modify either source resume. Added evidence must come from the master.

On **Profile**, **Review resume** reviews the selected English or French general
or master resume, including unsaved edits, using the editor-chat AI settings and
the versioned `review-resume` skill. Findings include strengths, prioritized issues,
supported wording suggestions, and questions needing your input. Reviews never
change or save the resume. Results stay in the current view, are marked outdated
after edits, and reset when switching sources. Runs retain skill provenance and
finding counts rather than the resume or full review. This is a text review;
rendered PDF layout and extraction are not assessed.

## Apply plan

**Apply plan** (`/plan`) is a small board of saved job-search URLs — a filtered
LinkedIn search, a company's careers page, whatever you return to routinely —
each tagged with an optional track and notes. It's just a bookmark board backed
by `workspace/state/saved-searches.json`; nothing here reads or scrapes those URLs.
