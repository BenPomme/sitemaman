#!/usr/bin/env python3
"""Read-only verification of the generated guides, integration blocks and schema.

Never writes. Exits non-zero when any generated artifact is stale, missing,
tampered with, or when the dataset fails validation. Designed to be runnable as
a clean CI gate once the reviewed dataset exists.

Usage:
    python3 scripts/check_guides.py [--root DIR] [--data FILE] [--template FILE]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_guides as gen  # noqa: E402

LD_JSON_RE = re.compile(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', re.DOTALL)
LINK_RE = re.compile(r'<link\b[^>]*>')


def _attr(tag: str, name: str):
    m = re.search(rf'\b{re.escape(name)}="([^"]*)"', tag)
    return m.group(1) if m else None


def inspect_page(page: dict, html: str, errors: list[str], warnings: list[str]):
    label = f"guides/{page['slug']}.html"
    lang = page["lang"]
    own_url = gen._page_url(page["slug"])
    fr_url = gen._page_url(page["slug"]) if lang == "fr" else gen._page_url(page["alternate_slug"])
    en_url = gen._page_url(page["slug"]) if lang == "en" else gen._page_url(page["alternate_slug"])

    if any(dash in html for dash in gen.FORBIDDEN_DASHES):
        errors.append(f"{label}: rendered file contains an en/em dash")

    html_tag = re.search(r"<html\b[^>]*>", html)
    if not html_tag or _attr(html_tag.group(0), "lang") != lang:
        errors.append(f"{label}: <html lang> must be '{lang}'")
    if not html_tag or "data-static-language" not in html_tag.group(0):
        errors.append(f"{label}: missing data-static-language")
    other = "en" if lang == "fr" else "fr"
    alt_attr = _attr(html_tag.group(0), f"data-lang-{other}") if html_tag else None
    if alt_attr != f"/guides/{page['alternate_slug']}.html":
        errors.append(f"{label}: data-lang-{other} must point to the alternate slug")

    canon = [t for t in LINK_RE.findall(html) if _attr(t, "rel") == "canonical"]
    if len(canon) != 1 or _attr(canon[0], "href") != own_url:
        errors.append(f"{label}: self-canonical must be exactly {own_url}")

    alternates = {}
    for tag in LINK_RE.findall(html):
        if _attr(tag, "rel") == "alternate" and _attr(tag, "hreflang"):
            alternates[_attr(tag, "hreflang")] = _attr(tag, "href")
    if alternates.get("fr") != fr_url:
        errors.append(f"{label}: hreflang fr must be {fr_url}")
    if alternates.get("en") != en_url:
        errors.append(f"{label}: hreflang en must be {en_url}")
    if alternates.get("x-default") != fr_url:
        errors.append(f"{label}: hreflang x-default must be the FR URL")

    og_url = None
    author_meta = None
    for tag in re.findall(r"<meta\b[^>]*>", html):
        if _attr(tag, "property") == "og:url":
            og_url = _attr(tag, "content")
        if _attr(tag, "name") == "author":
            author_meta = _attr(tag, "content")
    if og_url != own_url:
        errors.append(f"{label}: og:url must be {own_url}")

    # Editorial provenance: the site publishes these pages. Nothing may imply
    # that Sylviane Bahr wrote or clinically reviewed them.
    editorial = gen.L10N[lang]["authorName"]
    if author_meta != editorial:
        errors.append(f"{label}: meta author must be the editorial name '{editorial}'")
    if gen.L10N[lang]["provenance"] not in html:
        errors.append(f"{label}: missing the visible editorial provenance line")

    # The twin link must be a real crawlable anchor, not only hreflang and JS.
    expected_twin = (
        f'<a class="text-link" href="/guides/{page["alternate_slug"]}.html" '
        f'hreflang="{other}">{gen.esc(gen.L10N[lang]["twinLabel"])}</a>'
    )
    if expected_twin not in html:
        errors.append(f"{label}: missing the visible crawlable twin link ({expected_twin})")

    schemas = []
    for block in LD_JSON_RE.findall(html):
        try:
            schemas.append(json.loads(block.replace("\\u003c", "<").replace("\\u003e", ">")
                                      .replace("\\u0026", "&")))
        except json.JSONDecodeError as exc:
            errors.append(f"{label}: JSON-LD block does not parse ({exc})")
    types = {s.get("@type") for s in schemas}
    if "Article" not in types:
        errors.append(f"{label}: missing Article JSON-LD")
    if "BreadcrumbList" not in types:
        errors.append(f"{label}: missing BreadcrumbList JSON-LD")
    for schema in schemas:
        if schema.get("@type") == "Article":
            if schema.get("author", {}).get("@type") != "Organization":
                errors.append(f"{label}: Article author must be an Organization")
            if schema.get("publisher", {}).get("@type") != "Organization":
                errors.append(f"{label}: Article publisher must be an Organization")
            if schema.get("author", {}).get("name") != editorial:
                errors.append(f"{label}: Article author must use the editorial name '{editorial}'")
            if schema.get("publisher", {}).get("name") != editorial:
                errors.append(f"{label}: Article publisher must use the editorial name '{editorial}'")
            if schema.get("datePublished") != page["published"] or \
                    schema.get("dateModified") != page["modified"]:
                errors.append(f"{label}: Article dates must match the dataset")
    if "FAQPage" in types:
        errors.append(f"{label}: FAQPage schema must not be emitted (no rich-result promises)")


def check_translation_alignment(root: Path, errors: list[str]):
    path = root / "translations.js"
    if not path.is_file():
        errors.append("translations.js not found (cannot verify chrome alignment)")
        return
    text = path.read_text(encoding="utf-8")
    for lang, chrome in gen.CHROME.items():
        for key in gen.TRANSLATION_CHROME_KEYS:
            if chrome[key] not in text:
                errors.append(f"translations.js: chrome '{key}' ({lang}) drifted from the template chrome")
    for lang, labels in gen.L10N.items():
        for key in gen.TRANSLATION_LABEL_KEYS:
            if labels[key] not in text:
                errors.append(f"translations.js: label '{key}' ({lang}) not found")


def check_parity(pages: list[dict], errors: list[str], warnings: list[str]):
    topics: dict[str, dict] = {}
    for page in pages:
        topics.setdefault(page["topic"], {})[page["lang"]] = page
    for topic, pair in topics.items():
        fr, en = pair.get("fr"), pair.get("en")
        if not fr or not en:
            continue
        if len(fr["sections"]) != len(en["sections"]):
            warnings.append(
                f"topic '{topic}': FR has {len(fr['sections'])} sections, EN has {len(en['sections'])}"
            )
        if len(fr["faqs"]) != len(en["faqs"]):
            warnings.append(
                f"topic '{topic}': FR has {len(fr['faqs'])} FAQs, EN has {len(en['faqs'])}"
            )
        if len(fr["intro"]) != len(en["intro"]):
            warnings.append(
                f"topic '{topic}': FR has {len(fr['intro'])} intro paragraphs, EN has {len(en['intro'])}"
            )


def run(root: Path, dataset_path: Path, template_path, guides_dirname: str) -> int:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        template = gen.load_template(root, template_path)
    except gen.SiteError as exc:
        print(f"error: {exc}")
        return 2
    try:
        doc = gen.load_dataset(dataset_path)
    except gen.SiteError as exc:
        print(f"error: {exc}")
        return 2

    pages, issues, soft = gen.validate_dataset(doc, root)
    errors.extend(issues)
    warnings.extend(soft)

    if not issues:
        guides_dir = root / guides_dirname

        # Generated pages: present and byte-identical to a fresh render.
        expected: dict[str, str] = {}
        for page in pages:
            rendered = gen.render_page(page, template)
            expected[page["slug"]] = rendered
            path = guides_dir / f"{page['slug']}.html"
            if not path.is_file():
                errors.append(f"missing generated page: {path.relative_to(root)}")
                continue
            actual = path.read_text(encoding="utf-8")
            if actual != rendered:
                errors.append(f"stale generated page: {path.relative_to(root)} differs from a fresh render")
                continue
            inspect_page(page, actual, errors, warnings)

        # Orphaned owned pages (no longer in the dataset).
        current = set(expected)
        for slug, path in gen.owned_guide_files(guides_dir).items():
            if slug not in current:
                errors.append(f"orphaned generated page: {path.relative_to(root)} is not in the dataset")
        for path in sorted(guides_dir.glob("*.html")) if guides_dir.is_dir() else []:
            if not gen.PAGE_MARKER_RE.search(path.read_text(encoding="utf-8", errors="replace")):
                warnings.append(f"{path.relative_to(root)} is not generator-owned; left untouched")

        # Integration blocks: present and matching a fresh build.
        integration = [
            (root / "resources.html", gen._hub_inner(pages)),
            (root / "sitemap.xml", gen._sitemap_inner(pages)),
            (root / "llms.txt", gen._llms_inner(pages)),
        ]
        for path, expected_inner in integration:
            actual_inner = gen.read_marked(path, gen.HUB_START, gen.HUB_END)
            if actual_inner is None:
                errors.append(f"missing generated block in {path.relative_to(root)}")
            elif actual_inner != expected_inner:
                errors.append(f"stale generated block in {path.relative_to(root)}")

        # Every page must be reachable from the resources hub block.
        hub = gen.read_marked(root / "resources.html", gen.HUB_START, gen.HUB_END) or ""
        for page in pages:
            if f'href="/guides/{page["slug"]}.html"' not in hub:
                errors.append(f"guides/{page['slug']}.html is not linked from the resources hub block")

        # Manifest must match.
        manifest_path = root / "seo" / "guides.manifest.json"
        if not manifest_path.is_file():
            errors.append("missing manifest: seo/guides.manifest.json")
        else:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("dataset_sha256") != gen.sha256_file(dataset_path):
                errors.append("manifest dataset_sha256 does not match the current dataset")
            by_slug = {entry["slug"]: entry for entry in manifest.get("pages", [])}
            if set(by_slug) != current:
                errors.append("manifest page set does not match the dataset")
            for slug, rendered in expected.items():
                entry = by_slug.get(slug)
                if entry and entry.get("sha256") != gen.sha256_text(rendered):
                    errors.append(f"manifest hash mismatch for guides/{slug}.html")

        check_parity(pages, errors, warnings)

    check_translation_alignment(root, errors)

    for warning in warnings:
        print(f"warning: {warning}")
    if errors:
        for error in errors:
            print(f"error: {error}")
        print(f"FAIL: {len(errors)} problem(s) found.")
        return 1
    print(f"OK: {len(pages)} guide page(s) verified, integration blocks current, schema valid.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Verify generated guides (read-only).")
    parser.add_argument("--root", help="site root (defaults to the repo root)")
    parser.add_argument("--data", help="dataset JSON (defaults to seo/guides.json)")
    parser.add_argument("--template", help="template (defaults to seo/guide-template.html)")
    parser.add_argument("--guides-dir", default="guides", help="output directory name")
    args = parser.parse_args(argv)

    root = gen.find_root(args.root)
    dataset_path = Path(args.data) if args.data else root / "seo" / "guides.json"
    return run(root, dataset_path, args.template, args.guides_dir)


if __name__ == "__main__":
    raise SystemExit(main())
