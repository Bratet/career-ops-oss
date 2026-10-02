# Visa Badge

A Chrome extension (built with [WXT](https://wxt.dev)) that puts two labels above every LinkedIn job you open: visa sponsorship, and whether a remote job accepts people living outside Europe. Both come from one call to **Jev** (`typesafe/jev-1.13`), TypeSafe's "System One" classifier, called through OpenRouter's System One endpoint (`https://openrouter.ai/api/v1/systemone`).

| Badge | Meaning |
|---|---|
| 🟢 Sponsors visa | The posting offers or supports sponsorship |
| 🔴 No sponsorship | The posting rules sponsorship out |
| 🟠 Likely no sponsorship | It doesn't say, but asks for existing right to work, a valid permit, a citizenship, or clearance |
| ⚪ Visa not mentioned | Nothing about visas or right to work |

| Remote badge | Meaning |
|---|---|
| 🟢 Remote: open outside Europe | Worldwide, or regions beyond Europe (EMEA, Africa, MENA) |
| 🟢 Remote: timezone overlap only | Only asks for working-hours overlap (e.g. CET ±2h), no residency |
| 🔴 Remote: Europe residents only | Must live in Europe, the EU/EEA, the UK, or named European countries |
| ⚪ Remote: location unclear | Remote, but doesn't say where you may live |
| ⚪ Not remote (on-site/hybrid) | Not a remote job |

Both badges always show; if you only see one, the tab is running an old version (reload the extension, then the tab).

Each badge ends in "· Jev 87%". Below 60% confidence it reads "Unsure: …" with a dashed border. Hover for Jev's probability for each label; click to re-check. While Jev is working it shows "Checking visa & remote…".

## Install

```sh
make extension          # from the repo root; builds dist/chrome/
```

In Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `extension/visa-badge/dist/chrome`. After a rebuild, press the reload icon on the extension card.

Then add your key: **Details** → **Extension options** (or click the "Add OpenRouter key" badge), paste an [OpenRouter key](https://openrouter.ai/settings/keys), **Save**, **Test**. The test makes a live call on a sample EU-only remote posting and shows both answers, latency, model, provider, input tokens, and cost.

## How the call is kept small

- **One call per job.** Answers are keyed by LinkedIn's job id and cached in `chrome.storage.local` for 14 days, across tabs and restarts. Revisiting a job is instant and free (the tooltip says "cached"). Two tabs asking about the same job share one request.
- **Only what Jev needs.** `state` is the job header (title, company, location such as "EMEA (Remote)", workplace type) plus the description, whitespace collapsed and the "About the job" heading removed. Both questions go in the same call, so the posting is billed once; the remote question adds about 150 tokens. Jev bills input only ($0.042 per million tokens), so a typical posting costs about $0.00004.
- **No stale reads.** LinkedIn redraws the description several times while a job loads and switches the URL before the text. The script waits for the page to settle (0.5 s, capped at 1.5 s) and won't send the previous job's text under the new job id.
- 429 and 5xx responses are retried twice with backoff; other errors show "Jev check failed", with the reason in the tooltip. Click to retry.

## Privacy

On LinkedIn the extension is read-only: no clicks, no scrolling. When it can't read the job from the page (LinkedIn's `/jobs/search-results/` layout uses none of the known classes), it fetches that one job from LinkedIn's public guest page (`/jobs-guest/jobs/api/jobPosting/<id>`) without cookies, so the request isn't tied to your account. The background worker sends the job header and description to `openrouter.ai` using your key, which is stored only in this browser, never in the repo.

## Code

- `lib/jev.ts`: both questions, the request body, and response parsing. Bump `QUESTIONS_VERSION` when the questions change so cached answers are dropped.
- `lib/linkedin.ts`: job id from the URL, description cleanup, the guest-page parser.
- `entrypoints/background.ts`: the OpenRouter call, cache, and retries.
- `entrypoints/linkedin.content/`: reads the page and draws the badge. When LinkedIn changes its markup, update the selector lists at the top of `index.ts`. Until then the description is found by its "About the job" heading, then the guest page; if neither works the badge says "Couldn't read this job", and with no title to sit above, the badges float in the top-right corner.
- `entrypoints/options/`: the key and test page.

Tests run from the repo root with `make test` (`scripts/test-visa-badge.ts`).
