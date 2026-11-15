#!/usr/bin/env python3
"""Insert the site-wide entity graph (practice + Sylviane + website) as JSON-LD.

Only facts already stated on the site are used. The block lives between
``<!-- seo:schema:start -->`` and ``<!-- seo:schema:end -->`` just before
</head> and is rewritten on each run (idempotent).

Add verified profile URLs (Google Business Profile, LinkedIn, directories)
to SAME_AS: they let Google and AI assistants tie the site to the real person.

Run: python3 scripts/seo_schema.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://www.sylvianebahr.com"
START = "<!-- seo:schema:start -->"
END = "<!-- seo:schema:end -->"

SAME_AS: list[str] = []

ADDRESS = {
    "@type": "PostalAddress",
    "streetAddress": "Carrer de Josep Puig i Cadafalch, 42-44",
    "postalCode": "08172",
    "addressLocality": "Sant Cugat del Vallès",
    "addressRegion": "Barcelona",
    "addressCountry": "ES",
}

PERSON = {
    "@type": "Person",
    "@id": f"{SITE}/#person",
    "name": "Sylviane Bahr",
    "url": f"{SITE}/about.html",
    "image": f"{SITE}/sylviane.jpeg",
    "jobTitle": "Gestalt therapist and ICF-certified coach (ACC)",
    "description": (
        "Humanistic and integrative psychotherapist trained in Gestalt therapy at the "
        "Institut Gestalt in Barcelona, and Associate Certified Coach (ACC) with the "
        "International Coaching Federation. Supervised practice in French, English and Spanish."
    ),
    "knowsLanguage": ["fr", "en", "es"],
    "alumniOf": {"@type": "EducationalOrganization", "name": "Institut Gestalt", "address": "Barcelona"},
    "hasCredential": {
        "@type": "EducationalOccupationalCredential",
        "name": "Associate Certified Coach (ACC)",
        "credentialCategory": "certification",
        "recognizedBy": {"@type": "Organization", "name": "International Coaching Federation", "url": "https://coachingfederation.org"},
    },
    "knowsAbout": [
        "Gestalt therapy", "Humanistic psychotherapy", "Integrative psychotherapy",
        "Therapy for expats", "Couples therapy", "Burnout", "Anxiety", "Life transitions",
        "Career coaching",
    ],
    "worksFor": {"@id": f"{SITE}/#practice"},
}

PRACTICE = {
    "@type": "ProfessionalService",
    "@id": f"{SITE}/#practice",
    "name": "Sylviane Bahr – Psychothérapie & Coaching",
    "url": f"{SITE}/",
    "image": f"{SITE}/sylviane.jpeg",
    "logo": f"{SITE}/favicon.svg",
    "email": "sylviane_bahr@hotmail.com",
    "description": (
        "Gestalt-based humanistic and integrative therapy and ICF-certified coaching in Sant Cugat "
        "del Vallès and Barcelona, and online, in French, English and Spanish. Free 30-minute first conversation."
    ),
    "address": ADDRESS,
    "areaServed": [
        {"@type": "City", "name": "Sant Cugat del Vallès"},
        {"@type": "City", "name": "Barcelona"},
        {"@type": "Place", "name": "Online, worldwide"},
    ],
    "availableLanguage": ["French", "English", "Spanish"],
    "priceRange": "€60–€90",
    "founder": {"@id": f"{SITE}/#person"},
    "employee": {"@id": f"{SITE}/#person"},
    "hasOfferCatalog": {
        "@type": "OfferCatalog",
        "name": "Services",
        "itemListElement": [
            {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Free 30-minute first conversation", "url": f"{SITE}/appointments.html"}, "price": "0", "priceCurrency": "EUR"},
            {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Individual therapy session in Sant Cugat or Barcelona", "url": f"{SITE}/therapy.html"}, "price": "65", "priceCurrency": "EUR"},
            {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Online therapy session", "url": f"{SITE}/therapie-en-ligne.html"}, "price": "60", "priceCurrency": "EUR"},
            {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Online couples therapy session (75 min)", "url": f"{SITE}/therapie-de-couple-en-ligne.html"}, "price": "90", "priceCurrency": "EUR"},
            {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Career and leadership coaching (ICF)", "url": f"{SITE}/coaching.html"}},
        ],
    },
}

WEBSITE = {
    "@type": "WebSite",
    "@id": f"{SITE}/#website",
    "url": f"{SITE}/",
    "name": "Sylviane Bahr",
    "inLanguage": ["fr", "en", "es"],
    "publisher": {"@id": f"{SITE}/#practice"},
}

# page -> (page type, name, extra service)
PAGES = {
    "index.html": ("WebPage", None),
    "about.html": ("AboutPage", None),
    "cv.html": ("ProfilePage", None),
    "therapy.html": ("WebPage", {"@type": "Service", "name": "Gestalt, humanistic and integrative therapy", "serviceType": "Psychotherapy",
                                 "areaServed": ["Sant Cugat del Vallès", "Barcelona", "Online"], "availableLanguage": ["French", "English", "Spanish"]}),
    "coaching.html": ("WebPage", {"@type": "Service", "name": "ICF-certified career and leadership coaching", "serviceType": "Coaching",
                                  "areaServed": ["Sant Cugat del Vallès", "Barcelona", "Online"], "availableLanguage": ["French", "English", "Spanish"]}),
    "appointments.html": ("ContactPage", None),
    "contact.html": ("ContactPage", None),
    "groups.html": ("WebPage", None),
    "compare.html": ("WebPage", None),
    "resources.html": ("CollectionPage", None),
    "reflections.html": ("CollectionPage", None),
}


def graph_for(page: str, html: str) -> dict:
    ptype, service = PAGES[page]
    url = f"{SITE}/" if page == "index.html" else f"{SITE}/{page}"
    title = re.search(r"<title>(.*?)</title>", html, re.S).group(1).strip()
    webpage = {
        "@type": ptype, "@id": f"{url}#webpage", "url": url, "name": title,
        "isPartOf": {"@id": f"{SITE}/#website"},
        "about": {"@id": f"{SITE}/#practice"},
        "inLanguage": "fr",
    }
    person = dict(PERSON)
    if SAME_AS:
        person["sameAs"] = SAME_AS
    if ptype in ("AboutPage", "ProfilePage"):
        webpage["mainEntity"] = {"@id": f"{SITE}/#person"}
    nodes = [WEBSITE, PRACTICE, person, webpage]
    if service:
        s = dict(service, **{"@id": f"{url}#service", "url": url, "provider": {"@id": f"{SITE}/#practice"}})
        nodes.append(s)
    return {"@context": "https://schema.org", "@graph": nodes}


def apply(page: str) -> bool:
    path = ROOT / page
    html = path.read_text(encoding="utf-8")
    data = json.dumps(graph_for(page, html), ensure_ascii=False, indent=1)
    block = f'{START}\n  <script type="application/ld+json">\n{data}\n  </script>\n  {END}'
    if START in html:
        new = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, html, flags=re.S)
    else:
        new = html.replace("</head>", f"  {block}\n</head>", 1)
    if new != html:
        path.write_text(new, encoding="utf-8")
        return True
    return False


if __name__ == "__main__":
    changed = [p for p in PAGES if apply(p)]
    print(f"{len(changed)} page(s) updated: {', '.join(changed)}")
