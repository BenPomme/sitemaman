# Programmatic SEO guides (pilot)

This folder holds the editorial dataset and the template for the static guide
pages. The generator turns the dataset into plain HTML on the existing GitHub
Pages site. It is deliberately small: Python standard library only, no CMS, no
build step, no runtime changes.

This folder, `scripts/` and `docs/` are excluded from the published GitHub
Pages output by the repository `_config.yml`, which another workstream owns.

Files:

| File | Role | Owner |
| --- | --- | --- |
| `seo/guides.json` | Editorial dataset, the allowlist (reviewed before release) | Content worker |
| `seo/guide-template.html` | Page template (tokens, see below) | Generator |
| `seo/guides.manifest.json` | Machine-readable output hashes, written by the generator | Generator |
| `scripts/generate_guides.py` | Deterministic generator | Coordinator |
| `scripts/check_guides.py` | Read-only verifier (CI-safe) | Coordinator |
| `guides/<slug>.html` | Generated pages | Generator only |

## Data contract

Top level:

```json
{ "version": 1, "pages": [ /* one entry per page */ ] }
```

Every page entry:

```jsonc
{
  "id": "fr-choose-therapist",          // stable, unique across the dataset
  "topic": "choose-a-therapist",        // shared by the FR/EN pair of one topic
  "lang": "fr",                         // "fr" or "en"
  "slug": "comment-choisir-un-therapeute",   // lowercase-hyphenated, unique
  "alternate_slug": "how-to-choose-a-therapist", // the other language's slug
  "title": "Full SEO title | Sylviane Bahr",
  "description": "Meta description",
  "eyebrow": "Guide",
  "h1": "On-page heading",
  "intro": ["paragraph", "paragraph"],
  "sections": [
    { "id": "frame", "heading": "…", "paragraphs": ["…"], "bullets": ["…"] }
  ],
  "exercise": { "heading": "…", "intro": "…", "items": ["…"] },
  "faqs": [{ "question": "…", "answer": "…" }],
  "related": [{ "href": "/therapy.html", "label": "…" }],
  "sources": [{ "url": "https://…", "title": "…", "note": "…" }],
  "published": "2026-10-11",
  "modified": "2026-10-11",
  "cta": { "label": "Book a free 30-min call", "note": "…" }
}
```

Content is plain text only. It is escaped on output, so it must never contain
raw HTML.

Each `topic` must contain exactly one FR and one EN page, and the two
`alternate_slug` values must point at each other. The dataset is an allowlist:
there is no cross-product expansion, and no locations or conditions are
generated beyond what was reviewed in this file.

`related.href` may point at a sibling guide page planned in the same dataset,
including a section anchor, because the whole set is validated as one plan
before anything is generated. Targets outside the planned guide set must
already exist in the repository. Each language page should link visibly to its
other-language twin: the pages also carry the `hreflang` pair, and the visible
link is what makes the pair discoverable.

Pages state an editorial provenance: `Site de Sylviane Bahr` (FR) and
`Sylviane Bahr website` (EN) appear as the structured-data author and publisher
and as a small visible line. The guides are never presented as written or
clinically reviewed by Sylviane Bahr.

`seo/guides.json` is reviewed before release, under the editorial checks above:
structure, links, claims and language pairs. That is not a clinical review, and
none is claimed on the pages. Changes to the dataset should be reviewed and
approved by the content owner before release. The publication topics
(loneliness and belonging abroad, career decisions abroad, choosing a therapist
abroad, each FR/EN) and the manual 2, 4 and 8 week reviews, with no scheduler,
are described in `docs/programmatic-seo-pilot.md`.

## What the generator enforces

Generation aborts, with the full list of problems, when the dataset:

* has duplicate `id` or `slug`, or a missing required field;
* has a `topic` that is not a complete FR/EN pair, or a non-reciprocal
  `alternate_slug`;
* has a `slug`, `section.id` or `alternate_slug` that is not lowercase
  hyphenated, or a `related.href` that is not root-relative, not `https`, or
  points through `..`, to a scheme, or to a target that is neither an existing
  page nor a guide page planned in this dataset (anchors are checked too, for
  both cases);
* has a `sources[].url` that is not an absolute `https` URL;
* contains raw HTML characters (`<` or `>`), or an en/em dash;
* contains a substantive near-duplicate of another page in the same language
  (Jaccard similarity of 5-word shingles at or above `NEAR_DUP_THRESHOLD`);
* contains a narrow banned editorial claim (see `BANNED_PHRASES`: a Barcelona
  office, a free "therapy session", or a guaranteed cure).

`BANNED_PHRASES` is intentionally short. It catches the specific claims that
must never appear; it is not a substitute for editorial review.

## Ownership and markers

Only marked artifacts are ever written or removed:

* Pages carry `<!-- pseo:generated-guide v1 id=… lang=… slug=… -->`.
  An existing page without this marker is never overwritten, and the run
  aborts instead. Previously generated pages that drop out of the dataset are
  pruned only if they carry the marker.
* Integration files use `<!-- pseo:guides:start -->` and
  `<!-- pseo:guides:end -->`. Only the content between them is replaced.
  Existing `lastmod` values in `sitemap.xml` are never touched.

## Operator commands

Run from the repository root. Add `--data` and `--root` to work against a
fixture or a scratch copy of the site.

```bash
# Preview the diff without writing anything
python3 scripts/generate_guides.py --dry-run

# Generate 6 pages and update the marked integration blocks
python3 scripts/generate_guides.py

# Verify everything is present, current and valid (read-only, CI-safe)
python3 scripts/check_guides.py

# Same, against a disposable scratch site and the development fixture
# (placeholder topics; this fixture is not the publication)
python3 scripts/generate_guides.py --root .scratch/qa/site --data .scratch/fixtures/guides.fixture.json
python3 scripts/check_guides.py    --root .scratch/qa/site --data .scratch/fixtures/guides.fixture.json
```

`check_guides.py` exits `0` when clean, `1` when something is stale/missing,
and `2` when the dataset or template cannot be read. It never writes, so it can
be wired into CI later. No CI dependency is added here; see
`docs/programmatic-seo-pilot.md` for the review cadence and expansion gates.

## Template tokens

The template is rendered by a small stdlib renderer in
`scripts/generate_guides.py`:

* `{{TOKEN}}` inserts a prepared value;
* `{{#LIST}} … {{/LIST}}` repeats a block for each item;
* `{{.}}` is the current string item;
* `{{?NAME}} … {{/NAME}}` renders the block only when `NAME` is non-empty.

All dataset values are HTML-escaped before insertion. JSON-LD is JSON-encoded
and escaped so markup cannot be closed from inside the script block.
