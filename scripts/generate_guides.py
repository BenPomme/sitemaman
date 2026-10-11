#!/usr/bin/env python3
"""Deterministic static guide generator for the Sylviane Bahr programmatic SEO pilot.

Python standard library only. No CMS, no dependencies, no runtime changes.

It reads the reviewed editorial dataset (``seo/guides.json`` by default), renders
one static HTML page per entry into ``guides/<slug>.html``, and updates the marked
integration blocks in ``resources.html``, ``sitemap.xml`` and ``llms.txt``.

Ownership rules:
  * Only files carrying the generated-guide marker are overwritten or pruned.
  * Only the content between the ``pseo:guides:start`` / ``pseo:guides:end``
    markers is touched in the integration files.
  * Hand-authored pages are never overwritten: the run aborts instead.

See ``seo/README.md`` (data contract, operator commands) and
``docs/programmatic-seo-pilot.md`` (pilot framing, expansion gates).
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

SITE_ORIGIN = "https://www.sylvianebahr.com"
DATASET_VERSION = 1
ASSET_VERSION = "20261011"

HUB_START = "<!-- pseo:guides:start -->"
HUB_END = "<!-- pseo:guides:end -->"
PAGE_MARKER_RE = re.compile(
    r"<!--\s*pseo:generated-guide\s+v1\s+id=(?P<id>\S+)\s+lang=(?P<lang>\S+)\s+slug=(?P<slug>\S+)\s*-->"
)
GEN_MARKER = "<!-- pseo:generated-guide v1 id={id} lang={lang} slug={slug} -->"

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FORBIDDEN_DASHES = "\u2013\u2014\u2015"  # en dash, em dash, horizontal bar
LANGS = ("fr", "en")
X_DEFAULT_LANG = "fr"

# Near-duplicate guard: Jaccard similarity of 5-word shingles over the
# page-specific editorial text (chrome is excluded). Tuned for the pilot; see
# seo/README.md before changing.
NEAR_DUP_THRESHOLD = 0.5
SHINGLE_SIZE = 5

# Deliberately narrow editorial guardrails. Each entry is a normalised
# (accent-stripped, lowercased) substring. See seo/README.md.
BANNED_PHRASES = {
    "cabinet a barcelone",
    "cabinet barcelonais",
    "barcelona office",
    "office in barcelona",
    "consulting room in barcelona",
    "seance de therapie gratuite",
    "free therapy session",
    "free therapy sessions",
    "guerison garantie",
    "guaranteed cure",
    "cures depression",
    "remplace un traitement medical",
    "replaces medical treatment",
}

# Localised chrome reused from the live site's shared header/footer/ticker.
# Strings mirror translations.js so the JS pass produces no visible change.
CHROME = {
    "fr": {
        "brandRole": "Psychothérapie & Coaching",
        "navTherapy": "Thérapie",
        "navCoaching": "Coaching",
        "navTherapyOrCoaching": "Thérapie ou coaching",
        "navGroups": "Groupes & Ateliers",
        "navCircle": "Cercle d'hommes",
        "navAbout": "À propos",
        "navResources": "Ressources",
        "navAppointments": "RDV",
        "tickerOffer": "Premier échange de 30 minutes offert · Barcelone, Sant Cugat et visio",
        "headerBookingCta": "Prendre RDV",
        "footerPracticeLabel": "Cabinet",
        "footerContactLabel": "Contact",
        "footerPagesLabel": "Pages",
        "footerWhatsApp": "WhatsApp via le bouton du site",
        "footerPrivacy": "Confidentialité",
        "footerLegalNotice": "Mentions légales",
        "footerLang": "Français / English",
    },
    "en": {
        "brandRole": "Psychotherapy & Coaching",
        "navTherapy": "Therapy",
        "navCoaching": "Coaching",
        "navTherapyOrCoaching": "Therapy or coaching",
        "navGroups": "Groups & Workshops",
        "navCircle": "Men's circle",
        "navAbout": "About",
        "navResources": "Resources",
        "navAppointments": "Book",
        "tickerOffer": "Free 30-minute first conversation · Barcelona, Sant Cugat and online",
        "headerBookingCta": "Book a call",
        "footerPracticeLabel": "Practice",
        "footerContactLabel": "Contact",
        "footerPagesLabel": "Pages",
        "footerWhatsApp": "WhatsApp via the button on this site",
        "footerPrivacy": "Privacy",
        "footerLegalNotice": "Legal notice",
        "footerLang": "English / Français",
    },
}

# Per-language labels that are not part of the shared chrome but must render in
# the page language.
L10N = {
    "fr": {
        "crumbHome": "Accueil",
        "crumbResources": "Ressources",
        "published": "Publié",
        "modified": "Mis à jour",
        "faqBadge": "Questions fréquentes",
        "faqTitle": "Questions fréquentes",
        "relatedTitle": "À lire aussi",
        "sourcesTitle": "Sources et références",
        "sourcesNote": "Sources listées par transparence.",
        "providerNote": "Pour le cadre, la formation et l'approche :",
        "aboutLabel": "À propos",
        "cvLabel": "CV",
        "editorialNote": "Contenu éditorial. Il ne constitue pas un avis médical et ne remplace pas un accompagnement adapté.",
        "ctaHeading": "Échanger avant de commencer",
        "contactLabel": "Poser une question",
        "freeCallNote": "Cet échange sert à faire connaissance : il ne constitue pas une séance de thérapie.",
        # Editorial provenance: the guides are published by the site, not
        # written or clinically reviewed by Sylviane Bahr.
        "authorName": "Site de Sylviane Bahr",
        "provenance": "Publication : site de Sylviane Bahr",
        # Label shown on a FR page, pointing at its EN twin.
        "twinLabel": "Read this guide in English",
    },
    "en": {
        "crumbHome": "Home",
        "crumbResources": "Resources",
        "published": "Published",
        "modified": "Updated",
        "faqBadge": "Frequently asked questions",
        "faqTitle": "Frequently asked questions",
        "relatedTitle": "Related reading",
        "sourcesTitle": "Sources and references",
        "sourcesNote": "Sources are listed for transparency.",
        "providerNote": "For the frame, training and approach:",
        "aboutLabel": "About",
        "cvLabel": "CV",
        "editorialNote": "Editorial content. It is not medical advice and does not replace appropriate support.",
        "ctaHeading": "Talk before you start",
        "contactLabel": "Ask a question",
        "freeCallNote": "This call is a chance to get to know each other: it is not a therapy session.",
        # Editorial provenance: the guides are published by the site, not
        # written or clinically reviewed by Sylviane Bahr.
        "authorName": "Sylviane Bahr website",
        "provenance": "Published by the Sylviane Bahr website",
        # Label shown on an EN page, pointing at its FR twin.
        "twinLabel": "Lire ce guide en français",
    },
}

# Chrome/label strings that must exist verbatim in translations.js (drift guard).
TRANSLATION_CHROME_KEYS = (
    "brandRole",
    "navTherapy",
    "navCoaching",
    "navTherapyOrCoaching",
    "navGroups",
    "navCircle",
    "navAbout",
    "navResources",
    "navAppointments",
    "tickerOffer",
    "headerBookingCta",
    "footerPracticeLabel",
    "footerContactLabel",
    "footerPagesLabel",
    "footerWhatsApp",
    "footerPrivacy",
    "footerLegalNotice",
    "footerLang",
)
TRANSLATION_LABEL_KEYS = ("freeCallNote",)

MONTHS = {
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"],
    "en": ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
}


class SiteError(Exception):
    """Raised when the dataset or the site tree cannot be safely generated."""


# --------------------------------------------------------------------------- #
# Text helpers
# --------------------------------------------------------------------------- #
def esc(value) -> str:
    """HTML-escape a value for text and attribute contexts."""
    return html.escape(str(value), quote=True)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalise(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()


def human_date(iso: str, lang: str) -> str:
    year, month, day = iso.split("-")
    return f"{int(day)} {MONTHS[lang][int(month) - 1]} {year}"


# --------------------------------------------------------------------------- #
# Minimal template renderer
#   {{token}}                 scalar substitution (value already prepared)
#   {{#list}} .. {{/list}}    repeat for each item (dict item or plain string)
#   {{.}}                     the current plain-string item
#   {{?name}} .. {{/name}}    render body only when name is truthy
# --------------------------------------------------------------------------- #
TOKEN_RE = re.compile(r"\{\{\s*([#/?]?)\s*([A-Za-z0-9_.]+)\s*\}\}")


class TemplateError(Exception):
    pass


def _lookup(name: str, ctx: dict, item):
    if name == ".":
        return item
    if isinstance(item, dict) and name in item:
        return item[name]
    return ctx.get(name)


def render_template(template: str, ctx: dict) -> str:
    return _render(template, ctx, None)


def _render(tpl: str, ctx: dict, item) -> str:
    out: list[str] = []
    i = 0
    while True:
        m = TOKEN_RE.search(tpl, i)
        if not m:
            out.append(tpl[i:])
            break
        out.append(tpl[i:m.start()])
        sigil, name = m.group(1), m.group(2)
        if sigil in ("#", "?"):
            body, after = _extract_block(tpl, m.end(), name)
            value = _lookup(name, ctx, item)
            if sigil == "#":
                if value is None:
                    value = []
                if not isinstance(value, (list, tuple)):
                    raise TemplateError(f"loop {{{{{name}}}}} is not a list")
                for child in value:
                    out.append(_render(body, ctx, child))
            else:  # conditional
                if value:
                    out.append(_render(body, ctx, item))
            i = after
        elif sigil == "/":
            raise TemplateError(f"unexpected closing token {{{{{name}}}}}")
        else:
            value = _lookup(name, ctx, item)
            out.append("" if value is None else str(value))
            i = m.end()
    return "".join(out)


def _extract_block(tpl: str, start: int, name: str):
    depth = 1
    j = start
    while depth:
        m = TOKEN_RE.search(tpl, j)
        if not m:
            raise TemplateError(f"unclosed block {{{{{name}}}}}")
        if m.group(1) in ("#", "?"):
            depth += 1
        elif m.group(1) == "/":
            depth -= 1
            if depth == 0:
                return tpl[start:m.start()], m.end()
        j = m.end()
    raise TemplateError(f"unclosed block {{{{{name}}}}}")


# --------------------------------------------------------------------------- #
# Dataset validation
# --------------------------------------------------------------------------- #
def _collect_strings(value, path: str):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, child in value.items():
            yield from _collect_strings(child, f"{path}.{key}")
    elif isinstance(value, list):
        for idx, child in enumerate(value):
            yield from _collect_strings(child, f"{path}[{idx}]")


def _check_text(value, field: str, label: str, issues: list[str]):
    if not isinstance(value, str) or not value.strip():
        issues.append(f"{label}: field '{field}' must be a non-empty string")
        return
    if "<" in value or ">" in value:
        issues.append(f"{label}: field '{field}' contains raw HTML characters (< or >)")
    if any(dash in value for dash in FORBIDDEN_DASHES):
        issues.append(f"{label}: field '{field}' contains an en/em dash (forbidden in new copy)")
    normalised = normalise(value)
    for phrase in BANNED_PHRASES:
        if phrase in normalised:
            issues.append(f"{label}: field '{field}' matches banned phrase '{phrase}'")


def _shingles(text: str, n: int = SHINGLE_SIZE) -> set:
    words = re.findall(r"[a-z0-9']+", normalise(text))
    if len(words) < n:
        return set(words)
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _editorial_text(page: dict) -> str:
    parts: list[str] = [page.get("title", ""), page.get("description", ""),
                        page.get("eyebrow", ""), page.get("h1", "")]
    parts += list(page.get("intro", []))
    for section in page.get("sections", []):
        parts.append(section.get("heading", ""))
        parts += list(section.get("paragraphs", []))
        parts += list(section.get("bullets", []))
    exercise = page.get("exercise", {})
    parts.append(exercise.get("heading", ""))
    parts.append(exercise.get("intro", ""))
    parts += list(exercise.get("items", []))
    for faq in page.get("faqs", []):
        parts.append(faq.get("question", ""))
        parts.append(faq.get("answer", ""))
    parts.append(page.get("cta", {}).get("note", ""))
    return "\n".join(parts)


def _check_related(href, site_root: Path, label: str, field: str, issues: list[str],
                   planned: dict):
    if not isinstance(href, str) or not href:
        issues.append(f"{label}: {field} must be a non-empty root-relative URL")
        return
    if not href.startswith("/"):
        issues.append(f"{label}: {field} '{href}' must be root-relative (start with /)")
        return
    if href.startswith("//"):
        issues.append(f"{label}: {field} '{href}' must not be protocol-relative")
        return
    path, _, frag = href.partition("#")
    path = path.split("?", 1)[0]
    if ":" in path:
        issues.append(f"{label}: {field} '{href}' must not contain a URL scheme")
        return
    if any(seg == ".." for seg in path.split("/")):
        issues.append(f"{label}: {field} '{href}' must not contain '..'")
        return
    # A sibling guide page planned in this same dataset is a valid target even
    # on a fresh checkout, before any page has been generated.
    if path in planned:
        if frag and frag not in planned[path]:
            issues.append(
                f"{label}: {field} '{href}' anchor '#{frag}' is not a section of the planned guide page"
            )
        return
    rel = path.lstrip("/")
    target = site_root / rel / "index.html" if path.endswith("/") else site_root / rel
    if not target.is_file():
        issues.append(f"{label}: {field} '{href}' points to a page that does not exist")
        return
    if frag:
        body = target.read_text(encoding="utf-8", errors="replace")
        if not re.search(r'(?:id|name)="' + re.escape(frag) + r'"', body):
            issues.append(f"{label}: {field} '{href}' anchor '#{frag}' not found in {target.name}")


def validate_dataset(doc, site_root: Path) -> tuple[list[dict], list[str], list[str]]:
    """Return (pages_ordered, issues, warnings). Does not raise; caller decides."""
    issues: list[str] = []
    warnings: list[str] = []

    if not isinstance(doc, dict):
        return [], ["dataset root must be a JSON object"], warnings
    if doc.get("version") != DATASET_VERSION:
        issues.append(f"dataset 'version' must be {DATASET_VERSION}")
    pages = doc.get("pages")
    if not isinstance(pages, list) or not pages:
        issues.append("dataset 'pages' must be a non-empty list")
        return [], issues, warnings

    seen_ids: dict[str, str] = {}
    seen_slugs: dict[str, str] = {}
    seen_topics: dict[str, list[dict]] = {}

    for idx, page in enumerate(pages):
        label = f"page[{idx}]"
        if not isinstance(page, dict):
            issues.append(f"{label}: must be an object")
            continue
        pid = page.get("id")
        if isinstance(pid, str) and pid:
            label = f"page '{pid}'"
            if pid in seen_ids:
                issues.append(f"{label}: duplicate id (also used by {seen_ids[pid]})")
            seen_ids[pid] = label
        else:
            issues.append(f"{label}: missing 'id'")

        lang = page.get("lang")
        if lang not in LANGS:
            issues.append(f"{label}: 'lang' must be one of {LANGS}")

        slug = page.get("slug")
        if not isinstance(slug, str) or not SLUG_RE.match(slug):
            issues.append(f"{label}: 'slug' must be lowercase hyphenated (got {slug!r})")
        else:
            if slug in seen_slugs:
                issues.append(f"{label}: duplicate slug '{slug}' (also used by {seen_slugs[slug]})")
            seen_slugs[slug] = label

        alt = page.get("alternate_slug")
        if not isinstance(alt, str) or not SLUG_RE.match(alt):
            issues.append(f"{label}: 'alternate_slug' must be lowercase hyphenated (got {alt!r})")

        topic = page.get("topic")
        if not isinstance(topic, str) or not topic.strip():
            issues.append(f"{label}: missing 'topic'")
        else:
            seen_topics.setdefault(topic, []).append(page)

        for field in ("title", "description", "eyebrow", "h1", "published", "modified"):
            if not isinstance(page.get(field), str) or not str(page.get(field)).strip():
                issues.append(f"{label}: missing required field '{field}'")

        if isinstance(page.get("published"), str) and page["published"] and not DATE_RE.match(page["published"]):
            issues.append(f"{label}: 'published' must be an ISO date (YYYY-MM-DD)")
        if isinstance(page.get("modified"), str) and page["modified"] and not DATE_RE.match(page["modified"]):
            issues.append(f"{label}: 'modified' must be an ISO date (YYYY-MM-DD)")
        if DATE_RE.match(str(page.get("published", ""))) and DATE_RE.match(str(page.get("modified", ""))):
            if str(page["modified"]) < str(page["published"]):
                issues.append(f"{label}: 'modified' is earlier than 'published'")

        for field in ("intro", "sections", "faqs", "related", "sources"):
            value = page.get(field)
            if not isinstance(value, list) or not value:
                issues.append(f"{label}: '{field}' must be a non-empty list")

        exercise = page.get("exercise")
        if not isinstance(exercise, dict):
            issues.append(f"{label}: 'exercise' must be an object")
        else:
            if not isinstance(exercise.get("heading"), str):
                issues.append(f"{label}: exercise.heading must be a string")
            if not isinstance(exercise.get("intro"), str):
                issues.append(f"{label}: exercise.intro must be a string")
            if not isinstance(exercise.get("items"), list) or not exercise["items"]:
                issues.append(f"{label}: exercise.items must be a non-empty list")

        sections = page.get("sections")
        if isinstance(sections, list):
            seen_section_ids: set = set()
            for s_idx, section in enumerate(sections):
                if not isinstance(section, dict):
                    issues.append(f"{label}: sections[{s_idx}] must be an object")
                    continue
                sid = section.get("id")
                if not isinstance(sid, str) or not SLUG_RE.match(sid):
                    issues.append(f"{label}: sections[{s_idx}].id must be lowercase hyphenated")
                elif sid in seen_section_ids:
                    issues.append(f"{label}: duplicate section id '{sid}'")
                else:
                    seen_section_ids.add(sid)
                if not str(section.get("heading", "")).strip():
                    issues.append(f"{label}: sections[{s_idx}].heading is required")
                for key in ("paragraphs", "bullets"):
                    if not isinstance(section.get(key), list):
                        issues.append(f"{label}: sections[{s_idx}].{key} must be a list")
                if not section.get("paragraphs") and not section.get("bullets"):
                    issues.append(f"{label}: sections[{s_idx}] needs paragraphs or bullets")

        cta = page.get("cta")
        if not isinstance(cta, dict) or not str(cta.get("label", "")).strip() \
                or not str(cta.get("note", "")).strip():
            issues.append(f"{label}: 'cta' must provide 'label' and 'note'")

        for field_path, value in _collect_strings(page, ""):
            short = field_path.lstrip(".") or "(root)"
            _check_text(value, short, label, issues)

    # Language pairing and slug reciprocity.
    for topic, group in seen_topics.items():
        langs = sorted(p.get("lang") for p in group)
        if langs != sorted(LANGS):
            issues.append(f"topic '{topic}': expected exactly one FR and one EN page, got {langs}")
            continue
        by_lang = {p["lang"]: p for p in group}
        fr, en = by_lang.get("fr"), by_lang.get("en")
        if fr and en:
            if fr.get("alternate_slug") != en.get("slug"):
                issues.append(f"topic '{topic}': FR alternate_slug must equal the EN slug")
            if en.get("alternate_slug") != fr.get("slug"):
                issues.append(f"topic '{topic}': EN alternate_slug must equal the FR slug")

    # Each alternate_slug must resolve to the opposite-language page.
    by_slug = {p.get("slug"): p for p in pages if isinstance(p.get("slug"), str)}
    for page in pages:
        label = f"page '{page.get('id')}'"
        target = by_slug.get(page.get("alternate_slug"))
        if target is None:
            issues.append(f"{label}: alternate_slug '{page.get('alternate_slug')}' has no matching page")
        elif target.get("lang") == page.get("lang"):
            issues.append(f"{label}: alternate_slug is the same language, expected the pair")

    # Planned guide URLs, so sibling guide links (including section anchors)
    # validate on a fresh checkout, before anything has been generated.
    planned: dict = {}
    for page in pages:
        slug = page.get("slug")
        if isinstance(slug, str) and SLUG_RE.match(slug):
            anchors = {"exercise", "sources"}
            for section in page.get("sections") or []:
                if isinstance(section, dict) and isinstance(section.get("id"), str) and section["id"]:
                    anchors.add(section["id"])
            planned[f"/guides/{slug}.html"] = anchors

    # Related links and sources.
    for page in pages:
        label = f"page '{page.get('id')}'"
        related = page.get("related") if isinstance(page.get("related"), list) else []
        for idx, rel in enumerate(related):
            if not isinstance(rel, dict):
                issues.append(f"{label}: related[{idx}] must be an object")
                continue
            _check_related(rel.get("href"), site_root, label, f"related[{idx}].href", issues, planned)
            if not str(rel.get("label", "")).strip():
                issues.append(f"{label}: related[{idx}].label is required")
            href = rel.get("href")
            if isinstance(href, str) and href.split("#", 1)[0] == f"/guides/{page.get('slug')}.html":
                issues.append(f"{label}: related[{idx}] links to itself")
        sources = page.get("sources") if isinstance(page.get("sources"), list) else []
        for idx, src in enumerate(sources):
            if not isinstance(src, dict):
                issues.append(f"{label}: sources[{idx}] must be an object")
                continue
            url = src.get("url")
            if not isinstance(url, str) or not url.startswith("https://") or " " in url:
                issues.append(f"{label}: sources[{idx}].url must be an absolute https URL")
            if not str(src.get("title", "")).strip():
                issues.append(f"{label}: sources[{idx}].title is required")
            if not str(src.get("note", "")).strip():
                issues.append(f"{label}: sources[{idx}].note is required")

    # Near-duplicate editorial content within one language.
    for lang in LANGS:
        group = [p for p in pages if p.get("lang") == lang]
        for a in range(len(group)):
            for b in range(a + 1, len(group)):
                sim = _jaccard(_shingles(_editorial_text(group[a])), _shingles(_editorial_text(group[b])))
                if sim >= NEAR_DUP_THRESHOLD:
                    issues.append(
                        f"near-duplicate editorial content ({lang}): '{group[a].get('id')}' and "
                        f"'{group[b].get('id')}' similarity {sim:.2f} >= {NEAR_DUP_THRESHOLD}"
                    )

    ordered = sorted(
        pages,
        key=lambda p: (str(p.get("topic", "")),
                       LANGS.index(p["lang"]) if p.get("lang") in LANGS else 9,
                       str(p.get("slug", ""))),
    )

    # Soft, non-blocking SEO hygiene warnings (never fail the run).
    for page in pages:
        title = str(page.get("title", ""))
        desc = str(page.get("description", ""))
        if not 15 <= len(title) <= 70:
            warnings.append(f"page '{page.get('id')}': title length {len(title)} (aim 15-70)")
        if not 40 <= len(desc) <= 165:
            warnings.append(f"page '{page.get('id')}': description length {len(desc)} (aim 40-165)")

    return ordered, issues, warnings


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #
def _page_url(slug: str) -> str:
    return f"{SITE_ORIGIN}/guides/{slug}.html"


def _dump_jsonld(data: dict) -> str:
    raw = json.dumps(data, ensure_ascii=False, indent=2)
    # Safe JSON-LD embedding: markup cannot be closed from inside the script block.
    return raw.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def _jsonld_article(page: dict, canonical: str) -> str:
    editorial = L10N[page["lang"]]["authorName"]
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": page["title"],
        "description": page["description"],
        "inLanguage": page["lang"],
        "datePublished": page["published"],
        "dateModified": page["modified"],
        # Editorial provenance: the site publishes the guides. They are not
        # presented as written or clinically reviewed by Sylviane Bahr.
        "author": {"@type": "Organization", "name": editorial, "url": SITE_ORIGIN + "/"},
        "publisher": {
            "@type": "Organization",
            "name": editorial,
            "url": SITE_ORIGIN + "/",
            "logo": {"@type": "ImageObject", "url": SITE_ORIGIN + "/favicon.svg"},
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
        "url": canonical,
        "image": [SITE_ORIGIN + "/sylviane.jpeg"],
    }
    return _dump_jsonld(data)


def _jsonld_breadcrumb(page: dict, canonical: str) -> str:
    lang = page["lang"]
    data = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": L10N[lang]["crumbHome"], "item": SITE_ORIGIN + "/"},
            {"@type": "ListItem", "position": 2, "name": L10N[lang]["crumbResources"],
             "item": SITE_ORIGIN + "/resources.html"},
            {"@type": "ListItem", "position": 3, "name": page["h1"], "item": canonical},
        ],
    }
    return _dump_jsonld(data)


def build_context(page: dict) -> dict:
    lang = page["lang"]
    labels = L10N[lang]
    chrome = CHROME[lang]
    canonical = _page_url(page["slug"])
    alternate_url = f"/guides/{page['alternate_slug']}.html"
    alternate_lang = "en" if lang == "fr" else "fr"
    fr_url = _page_url(page["slug"]) if lang == "fr" else _page_url(page["alternate_slug"])
    en_url = _page_url(page["slug"]) if lang == "en" else _page_url(page["alternate_slug"])

    ctx: dict = {
        "GENERATED_MARKER": GEN_MARKER.format(id=page["id"], lang=lang, slug=page["slug"]),
        "HTML_OPEN": f'<html lang="{lang}" data-static-language '
                     f'data-lang-{alternate_lang}="{esc(alternate_url)}">',
        "TITLE": esc(page["title"]),
        "DESCRIPTION": esc(page["description"]),
        "EYEBROW": esc(page["eyebrow"]),
        "H1": esc(page["h1"]),
        "CANONICAL": esc(canonical),
        "URL_FR": esc(fr_url),
        "URL_EN": esc(en_url),
        "OG_LOCALE": "fr_FR" if lang == "fr" else "en_GB",
        "OG_LOCALE_ALT": "en_GB" if lang == "fr" else "fr_FR",
        "OG_IMAGE": SITE_ORIGIN + "/sylviane.jpeg",
        "ASSET_VERSION": ASSET_VERSION,
        "PUBLISHED_ISO": esc(page["published"]),
        "PUBLISHED_HUMAN": esc(human_date(page["published"], lang)),
        "MODIFIED_ISO": esc(page["modified"]),
        "MODIFIED_HUMAN": esc(human_date(page["modified"], lang)),
        "JSONLD_ARTICLE": _jsonld_article(page, canonical),
        "JSONLD_BREADCRUMB": _jsonld_breadcrumb(page, canonical),
        "CTA_SOURCE": esc(f"guide-{page['slug']}"),
        "CTA_LABEL": esc(page["cta"]["label"]),
        "CTA_NOTE": esc(page["cta"]["note"]),
        "AUTHOR_NAME": esc(labels["authorName"]),
        "PROVENANCE": esc(labels["provenance"]),
        "ALTERNATE_URL": esc(alternate_url),
        "ALTERNATE_LANG": alternate_lang,
        "TWIN_LABEL": esc(labels["twinLabel"]),
        "INTRO": [esc(p) for p in page["intro"]],
        "SECTIONS": [
            {
                "ID": esc(section.get("id", "")),
                "HEADING": esc(section.get("heading", "")),
                "PARAGRAPHS": [esc(p) for p in section.get("paragraphs", [])],
                "BULLETS": [esc(b) for b in section.get("bullets", [])],
            }
            for section in page["sections"]
        ],
        "EXERCISE_HEADING": esc(page["exercise"]["heading"]),
        "EXERCISE_INTRO": esc(page["exercise"]["intro"]),
        "EXERCISE_ITEMS": [esc(i) for i in page["exercise"]["items"]],
        "FAQS": [{"Q": esc(f["question"]), "A": esc(f["answer"])} for f in page["faqs"]],
        "RELATED": [{"HREF": esc(r["href"]), "LABEL": esc(r["label"])} for r in page["related"]],
        "SOURCES": [{"URL": esc(s["url"]), "TITLE": esc(s["title"]), "NOTE": esc(s["note"])}
                    for s in page["sources"]],
    }
    ctx.update({key: esc(value) for key, value in chrome.items()})
    ctx.update({key: esc(value) for key, value in labels.items()})
    return ctx


def render_page(page: dict, template: str) -> str:
    return render_template(template, build_context(page))


# --------------------------------------------------------------------------- #
# Integration blocks
# --------------------------------------------------------------------------- #
def _hub_inner(pages: list[dict]) -> str:
    lines = [
        "",
        '      <div class="section__header" style="margin-top: 48px;">',
        '        <p class="pill pill--subtle">Guides</p>',
        "        <h2>Guides pratiques / Practical guides</h2>",
        "      </div>",
        '      <div class="resource-list">',
    ]
    for page in pages:
        lines.append(
            f'        <a class="card card--soft" href="/guides/{esc(page["slug"])}.html">'
            f'<span class="lang-tag">{esc(page["lang"].upper())}</span>'
            f'<h3>{esc(page["h1"])}</h3>'
            f'<p>{esc(page["description"])}</p></a>'
        )
    lines.append("      </div>")
    # Trailing indent so the end marker aligns with the surrounding markup;
    # it belongs to the marked span because the replace path rewrites it.
    lines.append("      ")
    return "\n".join(lines)


def _sitemap_inner(pages: list[dict]) -> str:
    lines = [""]
    for page in pages:
        lines += [
            "  <url>",
            f"    <loc>{esc(_page_url(page['slug']))}</loc>",
            f"    <lastmod>{esc(page['modified'])}</lastmod>",
            "    <changefreq>monthly</changefreq>",
            "    <priority>0.6</priority>",
            "  </url>",
        ]
    lines.append("")
    return "\n".join(lines)


def _llms_inner(pages: list[dict]) -> str:
    # llms.txt is plain text: keep Unicode exactly as authored, never
    # HTML-escaped. Escaping still applies to the HTML and XML outputs.
    lines = ["", "Guides (FR / EN):"]
    for page in pages:
        lines.append(f"- {page['h1']} ({page['lang'].upper()}): {_page_url(page['slug'])}")
    lines.append("")
    return "\n".join(lines)


def read_marked(path: Path, start: str, end: str):
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    if start not in text or end not in text:
        return None
    after = text.index(start) + len(start)
    return text[after:text.index(end, after)]


def update_marked(path: Path, start: str, end: str, inner: str, anchors, dry_run: bool) -> str:
    text = path.read_text(encoding="utf-8")
    if start in text and end in text:
        pre = text[:text.index(start) + len(start)]
        post = text[text.index(end):]
        new = pre + inner + post
        action = "updated"
    else:
        if not anchors:
            sep = "" if text.endswith("\n") else "\n"
            new = text + sep + start + inner + end + "\n"
        else:
            index = next((text.index(a) for a in anchors if a in text), None)
            if index is None:
                raise SiteError(f"{path}: no anchoring point found for the marked block: {anchors!r}")
            # Insert whole lines and reuse the anchor line's indentation, so
            # the anchor keeps its own leading whitespace and removing the
            # block later leaves the original file byte-identical.
            line_start = text.rfind("\n", 0, index) + 1
            indent = re.match(r"[ \t]*", text[line_start:index]).group(0)
            new = text[:line_start] + indent + start + inner + end + "\n" + text[line_start:]
        action = "inserted"
    if not dry_run and new != text:
        path.write_text(new, encoding="utf-8", newline="\n")
    return action


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def find_root(explicit) -> Path:
    if explicit:
        return Path(explicit).resolve()
    return Path(__file__).resolve().parent.parent


def load_template(root: Path, explicit) -> str:
    path = Path(explicit) if explicit else root / "seo" / "guide-template.html"
    if not path.is_file():
        raise SiteError(f"template not found: {path}")
    return path.read_text(encoding="utf-8")


def load_dataset(path: Path) -> dict:
    if not path.is_file():
        raise SiteError(f"dataset not found: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SiteError(f"dataset is not valid JSON: {exc}") from exc


def owned_guide_files(guides_dir: Path) -> dict:
    owned: dict = {}
    if not guides_dir.is_dir():
        return owned
    for path in sorted(guides_dir.glob("*.html")):
        match = PAGE_MARKER_RE.search(path.read_text(encoding="utf-8", errors="replace"))
        if match:
            owned[match.group("slug")] = path
    return owned


def build_all(template: str, pages: list[dict]) -> dict:
    rendered = {page["slug"]: render_page(page, template) for page in pages}
    manifest = {
        "version": 1,
        "generator": "scripts/generate_guides.py",
        "site_origin": SITE_ORIGIN,
        "asset_version": ASSET_VERSION,
        "dataset_sha256": None,  # filled by the caller
        "pages": [
            {
                "id": page["id"],
                "lang": page["lang"],
                "slug": page["slug"],
                "topic": page["topic"],
                "path": f"guides/{page['slug']}.html",
                "url": _page_url(page["slug"]),
                "sha256": sha256_text(rendered[page["slug"]]),
            }
            for page in pages
        ],
        "integration": {
            "resources.html": sha256_text(_hub_inner(pages)),
            "sitemap.xml": sha256_text(_sitemap_inner(pages)),
            "llms.txt": sha256_text(_llms_inner(pages)),
        },
    }
    return {"rendered": rendered, "manifest": manifest}


def generate(root: Path, dataset_path: Path, template_path, guides_dirname: str,
             dry_run: bool) -> dict:
    guides_dir = root / guides_dirname
    template = load_template(root, template_path)
    doc = load_dataset(dataset_path)
    pages, issues, warnings = validate_dataset(doc, root)
    if issues:
        raise SiteError("dataset validation failed:\n  - " + "\n  - ".join(issues))
    for warning in warnings:
        print(f"warning: {warning}")

    built = build_all(template, pages)
    rendered = built["rendered"]
    manifest = built["manifest"]
    manifest["dataset_sha256"] = sha256_file(dataset_path)

    actions: list[str] = []

    # Prune owned pages that are no longer in the dataset (marked only).
    owned = owned_guide_files(guides_dir)
    current = {page["slug"] for page in pages}
    for slug, path in owned.items():
        if slug not in current:
            actions.append(f"prune {path.relative_to(root)}")
            if not dry_run:
                path.unlink()

    # Write pages, refusing to overwrite anything we do not own.
    for page in pages:
        path = guides_dir / f"{page['slug']}.html"
        content = rendered[page["slug"]]
        if path.exists():
            existing = path.read_text(encoding="utf-8", errors="replace")
            if not PAGE_MARKER_RE.search(existing):
                raise SiteError(
                    f"{path.relative_to(root)} exists but is not a generated guide; refusing to overwrite"
                )
            if existing == content:
                actions.append(f"unchanged {path.relative_to(root)}")
                continue
            actions.append(f"update {path.relative_to(root)}")
        else:
            actions.append(f"create {path.relative_to(root)}")
        if not dry_run:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")

    # Integration blocks.
    # Anchors are tried in order so the block still lands safely if the
    # integration file is edited by hand between generator runs.
    integration = [
        (root / "resources.html", HUB_START, HUB_END, _hub_inner(pages),
         ('<p class="form__note form__note--top"',
          '<div class="cta-box"',
          "</main>")),
        (root / "sitemap.xml", HUB_START, HUB_END, _sitemap_inner(pages), ("</urlset>",)),
        (root / "llms.txt", HUB_START, HUB_END, _llms_inner(pages), None),
    ]
    for path, start, end, inner, anchors in integration:
        if not path.is_file():
            raise SiteError(f"integration file missing: {path.relative_to(root)}")
        actions.append(f"{update_marked(path, start, end, inner, anchors, dry_run)} "
                       f"block in {path.relative_to(root)}")

    if not dry_run:
        manifest_path = root / "seo" / "guides.manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8", newline="\n",
        )
        actions.append(f"write {manifest_path.relative_to(root)}")

    return {"pages": pages, "actions": actions, "warnings": warnings}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Deterministic static guide generator.")
    parser.add_argument("--root", help="site root (defaults to the repo root)")
    parser.add_argument("--data", help="dataset JSON (defaults to seo/guides.json)")
    parser.add_argument("--template", help="template (defaults to seo/guide-template.html)")
    parser.add_argument("--guides-dir", default="guides", help="output directory name")
    parser.add_argument("--dry-run", action="store_true", help="report actions without writing")
    args = parser.parse_args(argv)

    root = find_root(args.root)
    dataset_path = Path(args.data) if args.data else root / "seo" / "guides.json"
    try:
        result = generate(root, dataset_path, args.template, args.guides_dir, args.dry_run)
    except SiteError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    for action in result["actions"]:
        print(action)
    print(f"{len(result['pages'])} guide page(s) {'planned' if args.dry_run else 'generated'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
