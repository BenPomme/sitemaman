#!/usr/bin/env python3
"""Insert or refresh the footer link directory on every page.

Every specialist landing page and guide gets a crawlable link from every
page, so none of them is an orphan. The block lives between
``<!-- seo:footer-links:start -->`` and ``<!-- seo:footer-links:end -->``
and is rewritten on each run (idempotent). Hrefs are root-absolute so the
same block works in /guides/ and in seo/guide-template.html.

Run: python3 scripts/seo_footer.py
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
START = "<!-- seo:footer-links:start -->"
END = "<!-- seo:footer-links:end -->"

# (label i18n key, default FR label, [(href, lang, text)])
GROUPS = [
    ("footerLocalLabel", "Barcelone &amp; Sant&nbsp;Cugat", [
        ("/therapeute-francophone-barcelone.html", "fr", "Thérapeute francophone à Barcelone"),
        ("/therapie-francais-barcelone-expatriation.html", "fr", "Thérapie en français et expatriation"),
        ("/english-speaking-therapist-barcelona.html", "en", "English-speaking therapist in Barcelona"),
        ("/english-therapist-sant-cugat.html", "en", "English-speaking therapist in Sant Cugat"),
        ("/therapy-for-expats-barcelona.html", "en", "Therapy for expats in Barcelona"),
        ("/couples-therapy-sant-cugat.html", "en", "Couples therapy in Sant Cugat"),
        ("/terapia-gestalt-sant-cugat.html", "es", "Terapia Gestalt en Sant Cugat"),
        ("/psicoterapia-frances-barcelona.html", "es", "Psicoterapia en francés en Barcelona"),
        ("/terapeuta-francofona-barcelona.html", "es", "Terapeuta francófona en Barcelona"),
        ("/burnout-stress-travail-barcelone.html", "fr", "Burnout et stress au travail"),
        ("/career-coaching-barcelona.html", "en", "Career coaching in Barcelona"),
        ("/free-consultation-therapy-barcelona.html", "en", "Free first consultation"),
        ("/cercle-hommes-sant-cugat.html", "fr", "Cercle d'hommes à Sant Cugat"),
        ("/mens-circle-sant-cugat.html", "en", "Men's circle in Sant Cugat"),
    ]),
    ("footerOnlineLabel", "En ligne", [
        ("/therapie-en-ligne.html", "fr", "Thérapie en ligne en français"),
        ("/therapie-en-ligne-expatries-francophones.html", "fr", "Thérapie en ligne pour expatriés"),
        ("/online-therapy-for-expats.html", "en", "Online therapy for expats"),
        ("/anxiete-gestalt-therapie-en-ligne.html", "fr", "Anxiété&nbsp;: thérapie Gestalt en ligne"),
        ("/therapie-de-couple-en-ligne.html", "fr", "Thérapie de couple en ligne"),
        ("/online-couples-therapy.html", "en", "Online couples therapy"),
        ("/therapie-en-ligne-francophones-royaume-uni.html", "fr", "Francophones au Royaume-Uni"),
        ("/therapie-en-ligne-francophones-singapour.html", "fr", "Francophones à Singapour"),
        ("/online-career-coaching-expats.html", "en", "Online career coaching for expats"),
    ]),
    ("footerGuidesLabel", "Guides", [
        ("/guides/choisir-un-therapeute-a-l-etranger.html", "fr", "Choisir un thérapeute à l'étranger"),
        ("/guides/how-to-choose-a-therapist-abroad.html", "en", "How to choose a therapist abroad"),
        ("/guides/solitude-et-expatriation.html", "fr", "Solitude et expatriation"),
        ("/guides/loneliness-when-living-abroad.html", "en", "Loneliness when living abroad"),
        ("/guides/reconversion-professionnelle-a-l-etranger.html", "fr", "Changer de métier à l'étranger"),
        ("/guides/career-change-while-living-abroad.html", "en", "Career change while living abroad"),
        ("/compare.html", "fr", "Thérapie ou coaching&nbsp;?"),
    ]),
]


def page_lang(html: str) -> str:
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', html)
    return m.group(1) if m else ""


def build(lang: str) -> str:
    out = [START, '<nav class="foot__seo" aria-label="Accompagnements">']
    for key, label, links in GROUPS:
        items = []
        for href, lng, text in links:
            attr = "" if lng == lang else f' lang="{lng}" hreflang="{lng}"'
            items.append(f'<li><a href="{href}"{attr}>{text}</a></li>')
        out.append(
            f'  <div><span class="micro micro--inverse" data-i18n="{key}">{label}</span>'
            f'<ul>{"".join(items)}</ul></div>'
        )
    out += ["</nav>", END]
    return "\n  ".join(out)


def apply(path: Path) -> bool:
    html = path.read_text(encoding="utf-8")
    foot = re.search(r'<footer class="foot">.*?</footer>', html, re.S)
    if not foot:
        return False
    block = build(page_lang(html))
    body = foot.group(0)
    if START in body:
        body2 = re.sub(re.escape(START) + r".*?" + re.escape(END), block, body, flags=re.S)
    else:
        anchor = re.search(r'\n\s*<p class="micro micro--inverse foot__legal"', body)
        idx = anchor.start() if anchor else body.rindex("</footer>")
        body2 = body[:idx] + "\n  " + block + body[idx:]
    if body2 == body:
        return False
    path.write_text(html[: foot.start()] + body2 + html[foot.end():], encoding="utf-8")
    return True


if __name__ == "__main__":
    # Generated guides are owned by scripts/generate_guides.py: the block goes in
    # their template, then regenerate them (python3 scripts/generate_guides.py).
    targets = sorted(ROOT.glob("*.html")) + [ROOT / "seo" / "guide-template.html"]
    changed = [p.relative_to(ROOT) for p in targets if apply(p)]
    print(f"{len(changed)} file(s) updated")
    for p in changed:
        print(" ", p)
