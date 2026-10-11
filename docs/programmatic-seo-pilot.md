# Programmatic SEO pilot

## What this is

A small, deterministic pilot: three reviewed topics, each published as a native
French page and a native English page, for six static pages under
`/guides/<slug>.html`. The pages reuse the current shared header, footer and
theme, are linked from the Resources hub, are listed in `sitemap.xml` and
`llms.txt`, and carry valid `Article` and `BreadcrumbList` structured data.

Pilot topics (three pairs): loneliness and belonging abroad, career decisions
abroad, and choosing a therapist abroad. These are evergreen, non-medical, and
distinct from the existing service pages, so they do not compete with the
site's own landing pages for the same intent. The development fixture in
`.scratch` uses different placeholder topics and is not the publication.

The editorial dataset is reviewed before release, against the validation rules
in `seo/README.md` and the guardrails below. That review is editorial: wording,
structure, links and claims. It is not a clinical review, nothing on the pages
claims one, and clinical accuracy is not asserted. Changes to the dataset
should be reviewed and approved by the content owner before release.

This is an experiment. It promises no traffic uplift. The private baseline
captured in the gitignored `.scratch` notes is small and does not establish
non-brand demand, so treat the pilot as a test of whether these intents convert
at all, not as a traffic programme. Search Console figures stay in the
gitignored notes and are never published here.

## How it is built

The editorial dataset is the single source of truth. It is reviewed before
release, and the generator renders the pages and the marked integration
blocks. See `seo/README.md` for the data contract, the validation rules and the
ownership markers.

The pages are progressive-enhancement safe: the core content is ordinary
server-rendered HTML, and JavaScript is not required to read a page. The
existing `app.js` still handles the language selector (via
`data-static-language` and `data-lang-fr` / `data-lang-en`) and the
consent-gated analytics. Guide CTAs emit `booking_click` with a distinct
`data-track-source` per page (`guide-<slug>`), so guide-driven booking clicks
can be separated from header or hub clicks.

Each language page also links visibly to its other-language twin, in addition
to the `hreflang` pair, so the pair is discoverable by readers and crawlers.
Those sibling links are validated against the planned page set, which means a
fresh checkout can generate the whole set in one pass without placeholder
files.

Pages carry an editorial provenance line and an editorial `Organization` in
the structured data: the guides are published by the site, and nothing claims
that Sylviane Bahr wrote them or clinically reviewed them. Provider background
links to About and the CV remain.

## Operator commands

```bash
# Preview, then generate from the reviewed dataset
python3 scripts/generate_guides.py --dry-run
python3 scripts/generate_guides.py

# Read-only verification (exit 1 if anything is stale or invalid)
python3 scripts/check_guides.py
```

Generation and verification are the two operator actions. There is no
scheduler, no background job and no runtime dependency. Run the check before
and after any dataset change and before deploying.

## Editorial guardrails

* The first conversation is a free 30-minute introductory call, not a therapy
  session. This is stated in the page chrome and re-checked in the dataset.
* The practice is in Sant Cugat del Vallès. Guide copy must not claim a
  Barcelona office.
* Editorial checks gate publication: wording, structure, links and claims. They
  are not a clinical review, none is claimed, and no medical claim is made.
* No FAQ rich-result schema is emitted, deliberately: the pages do not promise
  FAQ rich results.
* Sources are shown on the page, with a publication and update date, and each
  page links to About and the CV for provider background.

## Measurement and expansion gates

Measure only after deployment. Three signals decide whether the pilot expands,
in order of trust:

1. **Organic discovery, by pilot URL.** In Google Search Console, read clicks
   and impressions for the `/guides/` URLs specifically, over a fixed window.
   This is the indexation and crawl signal only, not an outcome.
2. **Intent from guide pages.** `booking_click` events with
   `data-track-source="guide-*"` show which guide leads to a booking path. A
   click is intent, not a booking.
3. **Outcome.** Two consented events: `booking_confirmed` on
   `/confirmation.html` (a GA4-only event added alongside the existing,
   deduplicated Google Ads conversion, fired only with explicit analytics
   consent) and `inquiry_form_success` from the contact and appointments
   forms.

Read the outcome carefully. Neither `booking_confirmed` nor
`inquiry_form_success` carries the originating guide in its `page_path`: they
fire on the confirmation, contact and appointments pages, not on a guide.
Attribution is therefore done through the GA4 session funnel (landing page,
default channel group, then event), it applies only to consented traffic, and
some sessions are never measurable. Do not promise precise guide-to-booking
attribution, and do not treat every session as observable.

First impressions are not enough to scale. A page that is indexed but shows no
clicks, no consented conversions and no engagement after a fair window is
evidence against expansion, not a reason to generate more pages.

Recommended read-only reviews, no scheduler and no automatic changes:

* **2 weeks:** confirm the six pages are indexed, that the sitemap and hub
  links resolve, and that Search Console shows impressions by URL. Fix only
  technical faults.
* **4 weeks:** look at impressions and position by query for the pilot URLs.
  Decide whether any topic shows real demand, and whether the copy answers it.
* **8 weeks:** review consented conversions for the pilot through the GA4
  funnel (session landing page and channel, then `booking_confirmed` and
  `inquiry_form_success`) against Search Console clicks. Expand only where a
  topic shows both demand and outcome; retire or rewrite a topic that shows
  neither.

Each review proposes changes to the coordinator. Nothing is applied
automatically, and no review writes to the dataset or the site.

## Deploying

The coordinator imports the reviewed `seo/guides.json`, runs the generator,
runs `scripts/check_guides.py`, and only then deploys the static output
(`guides/*.html` plus the marked blocks in `resources.html`, `sitemap.xml` and
`llms.txt`). Until the reviewed dataset exists, the site is left untouched and
no placeholder pages are produced. The tooling folders (`scripts/`, `seo/`,
`docs/`) are excluded from the published output by the repository's
`_config.yml`, which another workstream owns.
