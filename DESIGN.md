# Design brief: sylvianebahr.com

## What the site is for
Sylviane Bahr is a Gestalt therapist and ICF coach in Sant Cugat and Barcelona, also working online. The site serves people who are often going through something hard, frequently expats, in French, English and Spanish.

The one action that matters is booking the **free 30-minute first conversation** (`appointments.html#reserver`). Every page should make that action easy to find, without pressure.

## Feel
Calm, warm, grounded, human. Editorial rather than "app". The visitor should feel they can slow down here.

- No motion that pulls at the eye: no auto-scrolling strips or looping animations. Gentle fade-ins on scroll are fine and respect `prefers-reduced-motion`.
- Photography of Sylviane and the practice carries the warmth. Do not add stock icons, icon grids, gradients or emoji.
- Copy is plain and specific, in the first person where Sylviane speaks. Use few em-dashes.

## Tokens (`theme.css`)
| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#f6f3ee` | Page background (warm paper, deliberate, see accepted findings) |
| `--cream` | `#efe9df` | Alternate sections, light buttons on dark |
| `--brown` | `#2b1a12` | Ticker, footer, primary buttons, call-to-action panels |
| `--ink` | `#17191b` | Headings and strong text |
| `--ink-light` | `#41474a` | Body text on light backgrounds only, never on `--brown` |
| `--muted` | `#6f665e` | Secondary text on light backgrounds |

Text on `--brown` uses `--cream` (or cream at 0.72 to 0.86 opacity for secondary text). `base.css` still contains teal values from an earlier theme; anything visible should use the tokens above instead.

## Type
- **Schibsted Grotesk** (`--sans`) for headings and body.
- **DM Mono** (`--mono`), uppercase and tracked, only for short labels: nav, buttons, tags, small meta. Never for sentences.
- Minimum 11px for any text, 11.5px or more for anything clickable. Form labels are 14px sans, not mono caps.
- Long-form paragraphs are capped at `58ch` (about 75 characters per line in this font).
- Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`.

## Structure
- One `h1` per page. Headings never skip a level. If a list of cards has no visible section title, add a `visually-hidden` `h2`.
- No small labels or chips above headings. Location or language context goes in a plain `hero__context` line under the `h1`. (`hero__meta` is a different, older component: a bordered fact panel.)
- No numbered section labels ("01 /"). Numbers only for a real sequence, like the three steps to start.
- No thick coloured bar on one side of a card. Use a full hairline border or a background tint.
- The header nav needs about 1330px on one line. Below 1360px the Menu button takes over (`theme.css` and `app.js` share this breakpoint).

## QA gate
Before merging any visual change, serve the folder locally (for example `python3 -m http.server 8765`) and scan the rendered pages at phone and desktop width:

```bash
npx impeccable detect --viewport 390x844 http://localhost:8765/index.html http://localhost:8765/appointments.html
```

```bash
npx impeccable detect --viewport 1280x800 http://localhost:8765/index.html http://localhost:8765/appointments.html
```

Add every page you touched to those commands. Expect zero findings other than the accepted ones below. Also open the booking page at 390px in FR, EN and ES, because the language switcher changes line lengths, and check the header at 1280px and 1440px.

The static file scan (`npx impeccable detect *.html theme.css ...`) is useful for a quick look but over-reports: it cannot resolve the CSS cascade, so it flags hairline-divided FAQ lists and the ticker as "cramped". The rendered scans decide.

## Accepted findings
Recorded in `.impeccable/config.json`:

- **cream-palette** (`#f6f3ee` background): kept on purpose. A warm paper tone suits a therapy practice better than clinical white.

## Known follow-up
The six generated pages in `guides/` still show a small label above their `h1` and FAQ heading. They come from `seo/guide-template.html`. The generator has drifted from the live pages (for example it still says "À propos" where the site now says "Qui suis-je ?"), so regenerating would undo other changes. Fix the generator first, then remove the two labels from the template and regenerate.
