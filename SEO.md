# SEO and AI-search notes: sylvianebahr.com

## Why organic traffic is low (Nov 2026)
- The domain was registered in Dec 2025 and most landing pages date from Oct–Nov 2026. New pages on a new domain usually take 3–6 months to rank.
- No other website links to the site or mentions Sylviane yet (no directories, press or listings). This is the main gap, and it is off-site work.
- On the site itself, the landing pages used to be almost orphaned (1–2 internal links each). That is now fixed.

## What runs on the site
| Script | What it does | When to run |
|---|---|---|
| `python3 scripts/seo_footer.py` | Writes the footer link directory (every landing page and guide, linked from every page) between `seo:footer-links` markers. | After adding or renaming a landing page. Then run the guide generator. |
| `python3 scripts/seo_schema.py` | Writes the JSON-LD graph (practice, Sylviane, website, page) into the core pages between `seo:schema` markers. | After adding a verified profile URL to `SAME_AS`, or changing address, prices or credentials. |
| `python3 scripts/generate_guides.py` then `python3 scripts/check_guides.py` | Builds `guides/` from `seo/guides.json` and the template (which carries the footer directory). | After editing a guide or the footer directory. |

## Rules
- Every new landing page goes in the sitemap, in `llms.txt` ("Best pages to cite") and in `scripts/seo_footer.py`.
- One intent per page. Before adding a page, check that no existing page already targets the same search.
- Structured data only states facts already visible on the site. Sylviane is a therapist and coach, never "psychologue" or "psicóloga".
- When a profile exists (Google Business Profile, LinkedIn, Doctoralia, TherapyRoute, etc.), add its URL to `SAME_AS` in `scripts/seo_schema.py` and rerun it. This is how Google and AI assistants connect the site to the real person.
- robots.txt welcomes search and AI crawlers. Do not add `Crawl-delay`: Bing respects it, and ChatGPT search relies largely on Bing.

## After each deploy
Submit changed URLs to Bing and other IndexNow engines (the key file is `fdf137198be6b6715164c4d62be18e20.txt`):

```bash
curl -s -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json' -d '{"host":"www.sylvianebahr.com","key":"fdf137198be6b6715164c4d62be18e20","urlList":["https://www.sylvianebahr.com/"]}'
```

Google: request indexing for the most important changed pages in Search Console (the domain is verified there by DNS).
