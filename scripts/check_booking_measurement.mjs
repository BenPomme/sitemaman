#!/usr/bin/env node
/**
 * scripts/check_booking_measurement.mjs
 *
 * Self-contained harness for Task 1 (organic booking measurement):
 *   1. analytics.js consent gate: denied by default, GA4 configured only after
 *      the explicit versioned consent, legacy Ads-only consent never enrolls GA4.
 *   2. app.js confirmed-booking path: a GA4 `booking_confirmed` event targeted
 *      only at the GA4 destination, gated on the analytics consent, fired once
 *      per verified receipt, with the Ads conversion preserved.
 *   3. the injected mobile booking bar resolves to /appointments.html#reserver
 *      from a page under /guides/.
 *   4. deployment exclusions in _config.yml.
 *   5. node --check on both changed scripts.
 *
 * No network, no browser, no dependencies. Run: node scripts/check_booking_measurement.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANALYTICS_SRC = fs.readFileSync(path.join(ROOT, "analytics.js"), "utf8");
const APP_SRC = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const PRICING_SRC = fs.readFileSync(path.join(ROOT, "pricing.js"), "utf8");

const GA4_ID = "G-G20ED3FMXT";
const ADS_SEND_TO = "AW-18499976691/4aizCIre4ZQdEPP7vPVE";
const CALENDLY_ORIGIN = "https://calendly.com";
const RECEIPT_KEY = "sb-booking-confirmed";
const CONSENT_KEY = "sb-measurement-consent-v2";

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

// --------------------------------------------------------------------------
// Minimal DOM element mock
// --------------------------------------------------------------------------
function makeEl(tag = "div") {
  const classes = new Set();
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    children: [],
    attrs: {},
    dataset: {},
    _handlers: {},
    _q: {},
    parentNode: null,
    className: "",
    innerHTML: "",
    textContent: "",
    placeholder: "",
    value: "",
    hidden: false,
    href: "",
    src: "",
    async: false,
    target: "",
    rel: "",
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === "href") this.href = String(v);
      if (k === "src") this.src = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
    },
    hasAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k);
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    addEventListener(t, fn) {
      (this._handlers[t] = this._handlers[t] || []).push(fn);
    },
    removeEventListener() {},
    appendChild(c) {
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    append(...cs) {
      cs.forEach((c) => this.appendChild(c));
    },
    removeChild(c) {
      this.children = this.children.filter((x) => x !== c);
      c.parentNode = null;
      return c;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    replaceChildren(...cs) {
      this.children = [];
      cs.forEach((c) => this.appendChild(c));
    },
    // Auto-stub lower-level queries so banner buttons / iframes exist.
    querySelector(sel) {
      if (!this._q[sel]) this._q[sel] = makeEl();
      return this._q[sel];
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
  };
  return el;
}

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    api: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
}

function makeBlockedStorage() {
  const blocked = () => {
    throw new Error("Storage is blocked");
  };
  return {
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
  };
}

// --------------------------------------------------------------------------
// analytics.js runner
// --------------------------------------------------------------------------
function runAnalytics({ stored = {}, url, referrer = "", lang = "fr" } = {}) {
  const { store, api: localStorage } = makeStorage(stored);
  const head = makeEl("head");
  const body = makeEl("body");
  const doc = {
    readyState: "complete",
    referrer,
    documentElement: { lang, hasAttribute: () => false, getAttribute: () => null },
    head,
    body,
    _handlers: {},
    createElement: (t) => makeEl(t),
    addEventListener(t, fn) {
      (this._handlers[t] = this._handlers[t] || []).push(fn);
    },
  };
  const win = {
    dataLayer: [],
    document: doc,
    location: new URL(url || "https://www.sylvianebahr.com/privacy.html"),
  };
  const sandbox = {
    window: win,
    document: doc,
    localStorage,
    URL,
    URLSearchParams,
    Date,
    console,
    setTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(ANALYTICS_SRC, sandbox, { filename: "analytics.js" });
  return { win, doc, store, head, body };
}

const aPush = (win) => win.dataLayer.map((a) => Array.prototype.slice.call(a));
const aConfigs = (win) => aPush(win).filter((c) => c[0] === "config");
const aGaConfigs = (win) => aConfigs(win).filter((c) => c[1] === GA4_ID);
const aAwConfigs = (win) => aConfigs(win).filter((c) => c[1] === "AW-18499976691");
const bannerAccept = (body) =>
  body.children[0].querySelector(".consent-banner__accept")._handlers.click[0]();
const bannerDecline = (body) =>
  body.children[0].querySelector(".consent-banner__decline")._handlers.click[0]();

// --------------------------------------------------------------------------
// app.js runner
// --------------------------------------------------------------------------
function runApp(opts = {}) {
  const {
    url = "https://www.sylvianebahr.com/confirmation.html",
    referrer = "",
    confirmedReceipt = null,
    adsConsent = false,
    analyticsConsent = false,
    gtagPresent = true,
    analyticsApiPresent = true,
    sessionStore: sharedStore = null,
    documentQuery = {},
    querySelectorAll: querySelectorAllLists = {},
    pageLang = "fr",
    staticLanguage = false,
    langTargets = {},
    storedLang = "",
    storageBlocked = false,
    bookingLinks = [],
    languageSelector = null,
    translations = { fr: {}, en: {}, es: {} },
  } = opts;

  const session = sharedStore ? { store: sharedStore, api: {} } : makeStorage();
  const sessionStore = session.store;
  if (confirmedReceipt && !sessionStore.has(RECEIPT_KEY)) {
    sessionStore.set(RECEIPT_KEY, JSON.stringify(confirmedReceipt));
  }
  const sessionStorage = {
    getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
    setItem: (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
  };
  const local = makeStorage(storedLang ? { "site-lang": storedLang } : {});
  const localStorageStore = local.store;
  const localStorage = storageBlocked ? makeBlockedStorage() : local.api;

  const gtagCalls = [];
  const assignments = [];
  const replaceStateCalls = [];
  const winHandlers = {};

  const documentElement = {
    lang: pageLang,
    _attrs: {},
    hasAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this._attrs, k);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
    },
    setAttribute(k, v) {
      this._attrs[k] = String(v);
    },
  };
  if (staticLanguage) documentElement.setAttribute("data-static-language", "");
  Object.entries(langTargets).forEach(([lang, target]) => {
    documentElement.setAttribute(`data-lang-${lang}`, target);
  });

  const body = makeEl("body");
  if (opts.confirmationPage) body.setAttribute("data-booking-confirmation", "true");

  const pageUrl = new URL(url);
  const doc = {
    readyState: "complete",
    referrer,
    documentElement,
    body,
    head: makeEl("head"),
    _handlers: {},
    createElement: (t) => makeEl(t),
    querySelector(sel) {
      if (Object.prototype.hasOwnProperty.call(documentQuery, sel)) return documentQuery[sel];
      if (sel === "[data-booking-bar]") {
        return body.children.find((child) => child.dataset?.bookingBar === "true") || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (Object.prototype.hasOwnProperty.call(querySelectorAllLists, sel)) {
        return querySelectorAllLists[sel];
      }
      if (sel === 'a[href*="appointments.html"]') return bookingLinks;
      return [];
    },
    getElementById(id) {
      return id === "language-selector" ? languageSelector : null;
    },
    addEventListener(t, fn) {
      (this._handlers[t] = this._handlers[t] || []).push(fn);
    },
    removeEventListener() {},
  };

  const win = {
    dataLayer: [],
    document: doc,
    _handlers: {},
    location: {
      href: pageUrl.href,
      origin: pageUrl.origin,
      pathname: pageUrl.pathname,
      search: pageUrl.search,
      hash: pageUrl.hash,
      assign: (u) => assignments.push(u),
      replace: () => {},
    },
    history: {
      state: null,
      replaceState(state, title, nextUrl) {
        replaceStateCalls.push(nextUrl);
        try {
          const next = new URL(nextUrl, pageUrl.href);
          win.location.href = next.href;
          win.location.pathname = next.pathname;
          win.location.search = next.search;
          win.location.hash = next.hash;
        } catch {
          // The assertion only needs the requested URL.
        }
      },
    },
    addEventListener(t, fn) {
      (winHandlers[t] = winHandlers[t] || []).push(fn);
    },
    removeEventListener() {},
  };
  if (gtagPresent) win.gtag = (...args) => gtagCalls.push(args);
  win.sbHasAdsConsent = () => adsConsent;
  if (analyticsApiPresent) win.sbHasAnalyticsConsent = () => analyticsConsent;
  win.SB_GOOGLE_ADS_CONVERSION_SEND_TO = ADS_SEND_TO;
  win.SB_GA4_MEASUREMENT_ID = GA4_ID;

  const sandbox = {
    window: win,
    document: doc,
    sessionStorage,
    localStorage,
    translations,
    URL,
    URLSearchParams,
    Date,
    console,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(PRICING_SRC, sandbox, { filename: "pricing.js" });
  vm.runInContext(APP_SRC, sandbox, { filename: "app.js" });
  (doc._handlers.DOMContentLoaded || []).forEach((fn) => fn());

  return {
    win,
    doc,
    body,
    sessionStore,
    localStorageStore,
    gtagCalls,
    assignments,
    replaceStateCalls,
    fireMessage: (data, origin, source) =>
      (winHandlers.message || []).forEach((fn) => fn({ origin, data, source })),
  };
}

const eventsNamed = (result, name) =>
  result.gtagCalls.filter((c) => c[0] === "event" && c[1] === name);

function extractSetFormStatus(source) {
  const start = source.indexOf("  const setFormStatus =");
  const end = source.indexOf("\n\n  // Builds a ready-to-send message", start);
  if (start < 0 || end < 0) throw new Error("Could not locate setFormStatus in app.js");
  return source.slice(start, end);
}

function collectLinks(node, links) {
  if (!node) return;
  if (node.tagName === "A") links.push(node);
  (node.children || []).forEach((child) => collectLinks(child, links));
}

function executeSetFormStatus(source, actions) {
  const statusNode = makeEl("div");
  const document = {
    createTextNode(text) {
      return { nodeType: 3, textContent: text, children: [] };
    },
    createElement(tagName) {
      return makeEl(tagName);
    },
  };

  const sandbox = { document };
  vm.createContext(sandbox);
  vm.runInContext(
    `${extractSetFormStatus(source)}\nglobalThis.__setFormStatus = setFormStatus;`,
    sandbox,
  );

  const form = {
    querySelector(selector) {
      return selector === "[data-form-status]" ? statusNode : null;
    },
  };

  let error = null;
  try {
    sandbox.__setFormStatus(form, "Delivery failed", "error", actions);
  } catch (caught) {
    error = caught;
  }

  const links = [];
  collectLinks(statusNode, links);
  return { error, links };
}

// ==========================================================================
// 1. analytics.js consent gate
// ==========================================================================
console.log("== analytics.js consent gate ==");

{
  const { win, body } = runAnalytics({
    url: "https://www.sylvianebahr.com/privacy.html?utm_source=ads#english",
  });
  check("A1 fresh/denied: zero GA4 config", aGaConfigs(win).length === 0);
  check("A2 fresh/denied: exactly one Ads config", aAwConfigs(win).length === 1);
  check("A3 fresh/denied: banner shown", body.children.length === 1);
  check(
    "A4 fresh/denied: sbHasAnalyticsConsent() false",
    typeof win.sbHasAnalyticsConsent === "function" && win.sbHasAnalyticsConsent() === false,
  );
  check(
    "A5 GA4 destination id exposed for app.js",
    win.SB_GA4_MEASUREMENT_ID === GA4_ID,
    String(win.SB_GA4_MEASUREMENT_ID),
  );
  const link = body.children[0].innerHTML.match(/href="([^"]+)"/);
  check(
    "A6 banner privacy link is root-absolute",
    !!link && link[1].startsWith("/privacy.html"),
    link ? link[1] : "no link",
  );
}

{
  const { win, body, store } = runAnalytics({ url: "https://www.sylvianebahr.com/confirmation.html" });
  bannerAccept(body);
  check("B1 v2 accept: exactly one GA4 config", aGaConfigs(win).length === 1);
  check("B2 v2 accept: key stored granted", store.get(CONSENT_KEY) === "granted");
  check("B3 v2 accept: sbHasAnalyticsConsent() true", win.sbHasAnalyticsConsent() === true);
  check("B4 v2 accept: banner removed", body.children.length === 0);
}

{
  const { win, body } = runAnalytics({
    url:
      "https://www.sylvianebahr.com/therapie-en-ligne.html" +
      "?email=private%40example.com&utm_source=google&gclid=test-click-id&utm_medium=cpc#reserver",
    referrer: "https://www.google.com/search?q=private-query#fragment",
  });
  bannerAccept(body);
  const configs = aGaConfigs(win);
  const params = configs.length === 1 ? configs[0][2] : {};
  const pageLocation = params.page_location ? new URL(params.page_location) : null;
  check(
    "B5 GA4 page location keeps Google Ads click attribution",
    pageLocation &&
      pageLocation.searchParams.get("gclid") === "test-click-id" &&
      pageLocation.searchParams.get("utm_source") === "google" &&
      pageLocation.searchParams.get("utm_medium") === "cpc",
    params.page_location || "missing",
  );
  check(
    "B6 GA4 page location removes unrelated query values and fragment",
    pageLocation &&
      !pageLocation.searchParams.has("email") &&
      pageLocation.hash === "",
    params.page_location || "missing",
  );
  check(
    "B7 GA4 referrer keeps only origin and path",
    params.page_referrer === "https://www.google.com/search",
    String(params.page_referrer),
  );
}

{
  const { win, body } = runAnalytics({});
  bannerDecline(body);
  check("C1 refused: zero GA4 config", aGaConfigs(win).length === 0);
  check("C2 refused: sbHasAnalyticsConsent() false", win.sbHasAnalyticsConsent() === false);
}

{
  const { win, body } = runAnalytics({ stored: { "sb-ads-consent": "granted" } });
  check("D1 legacy ads-only: zero GA4 config", aGaConfigs(win).length === 0);
  check("D2 legacy ads-only: sbHasAdsConsent() true", win.sbHasAdsConsent() === true);
  check("D3 legacy ads-only: sbHasAnalyticsConsent() false", win.sbHasAnalyticsConsent() === false);
  check("D4 legacy ads-only: banner still shown", body.children.length === 1);
}

// ==========================================================================
// 2. app.js confirmed-booking path
// ==========================================================================
console.log("== app.js confirmed-booking path ==");

const receipt = { lang: "fr", at: 1 };

{
  const r = runApp({
    confirmationPage: true,
    confirmedReceipt: receipt,
    adsConsent: true,
    analyticsConsent: true,
  });
  const conv = eventsNamed(r, "conversion");
  const book = eventsNamed(r, "booking_confirmed");
  check("E1 both consents: exactly one Ads conversion", conv.length === 1, `got ${conv.length}`);
  check(
    "E2 both consents: conversion targets Ads label",
    conv.length === 1 && conv[0][2].send_to === ADS_SEND_TO,
  );
  check("E3 both consents: exactly one GA4 booking_confirmed", book.length === 1, `got ${book.length}`);
  check(
    "E4 booking_confirmed targets ONLY GA4 (send_to G-)",
    book.length === 1 && book[0][2].send_to === GA4_ID && /^G-/.test(book[0][2].send_to),
  );
  const keys = book.length === 1 ? Object.keys(book[0][2]).sort() : [];
  check(
    "E5 booking_confirmed carries only safe fixed details",
    JSON.stringify(keys) === JSON.stringify(["page_language", "page_path", "placement", "send_to", "source"]),
    JSON.stringify(keys),
  );
  check(
    "E6 booking_confirmed page_path is the fixed confirmation path",
    book.length === 1 && book[0][2].page_path === "/confirmation.html" && book[0][2].page_language === "fr",
  );
  check(
    "E7 booking_confirmed has no URL/query/free text",
    book.length === 1 && !/http|%|\?|#|=/.test(JSON.stringify(book[0][2])),
  );
  check("E8 verified receipt consumed exactly once", r.sessionStore.has(RECEIPT_KEY) === false);
  check(
    "E9 no internal fallback when a destination reported",
    r.win.dataLayer.filter((e) => e.event === "booking_completed_internal").length === 0,
  );
}

{
  const r = runApp({
    confirmationPage: true,
    confirmedReceipt: receipt,
    adsConsent: false,
    analyticsConsent: true,
  });
  check("F1 analytics-only: booking_confirmed fired", eventsNamed(r, "booking_confirmed").length === 1);
  check("F2 analytics-only: no Ads conversion", eventsNamed(r, "conversion").length === 0);
}

{
  const r = runApp({
    confirmationPage: true,
    confirmedReceipt: receipt,
    adsConsent: true,
    analyticsConsent: false,
  });
  check("G1 ads-only: Ads conversion fired once", eventsNamed(r, "conversion").length === 1);
  check("G2 ads-only: no GA4 booking_confirmed", eventsNamed(r, "booking_confirmed").length === 0);
}

{
  const r = runApp({ confirmationPage: true, confirmedReceipt: receipt });
  check("H1 no consent: zero gtag events", r.gtagCalls.length === 0, `got ${r.gtagCalls.length}`);
  check(
    "H2 no consent: internal fallback only",
    r.win.dataLayer.length === 1 && r.win.dataLayer[0].event === "booking_completed_internal",
  );
}

{
  const r1 = runApp({ confirmationPage: true, confirmedReceipt: receipt, adsConsent: true, analyticsConsent: true });
  check("I1 first load fires events", r1.gtagCalls.length === 2);
  const r2 = runApp({
    confirmationPage: true,
    sessionStore: r1.sessionStore,
    adsConsent: true,
    analyticsConsent: true,
  });
  check("I2 reload: no new event (receipt already consumed)", r2.gtagCalls.length === 0, `got ${r2.gtagCalls.length}`);
}

{
  const r = runApp({ confirmationPage: true, adsConsent: true, analyticsConsent: true });
  check("J1 direct confirmation visit: no event", r.gtagCalls.length === 0);
  check(
    "J2 direct confirmation visit: no internal fallback either",
    r.win.dataLayer.filter((e) => e.event === "booking_completed_internal").length === 0,
  );
}

{
  // External Calendly booking: Calendly redirects to the confirmation page.
  const redirectUrl = "https://www.sylvianebahr.com/confirmation.html?booked=calendly";
  const referrer = "https://calendly.com/sylvianebahr/30min";
  const r = runApp({
    url: redirectUrl,
    referrer,
    confirmationPage: true,
    adsConsent: true,
    analyticsConsent: true,
  });
  check("Q1 Calendly redirect: exactly one Ads conversion", eventsNamed(r, "conversion").length === 1);
  check("Q2 Calendly redirect: exactly one GA4 booking_confirmed", eventsNamed(r, "booking_confirmed").length === 1);
  check(
    "Q3 Calendly redirect: redirect counted flag set",
    r.sessionStore.get("sb-calendly-redirect-counted") === "1",
  );

  const r2 = runApp({
    url: redirectUrl,
    referrer,
    confirmationPage: true,
    adsConsent: true,
    analyticsConsent: true,
    sessionStore: r.sessionStore,
  });
  check("Q4 Calendly redirect reload: no double count", r2.gtagCalls.length === 0, `got ${r2.gtagCalls.length}`);
}

{
  const redirectUrl = "https://www.sylvianebahr.com/confirmation.html?booked=calendly";
  const r = runApp({
    url: redirectUrl,
    referrer: "",
    confirmationPage: true,
    adsConsent: true,
    analyticsConsent: true,
  });
  check("Q5 Calendly redirect without referrer: no count", r.gtagCalls.length === 0, `got ${r.gtagCalls.length}`);

  const r2 = runApp({
    url: redirectUrl,
    referrer: "https://evil.example/booking",
    confirmationPage: true,
    adsConsent: true,
    analyticsConsent: true,
  });
  check("Q6 Calendly redirect from another referrer: no count", r2.gtagCalls.length === 0, `got ${r2.gtagCalls.length}`);
}

{
  // Invalid Calendly messages must never create a receipt.
  const r = runApp({ url: "https://www.sylvianebahr.com/appointments.html#reserver" });
  r.fireMessage({ event: "calendly.event_scheduled" }, "https://evil.example", {});
  check("K1 wrong origin: no receipt", r.sessionStore.has(RECEIPT_KEY) === false);

  const r2 = runApp({ url: "https://www.sylvianebahr.com/appointments.html#reserver" });
  r2.fireMessage({ event: "calendly.something_else" }, CALENDLY_ORIGIN, {});
  check("K2 wrong event name: no receipt", r2.sessionStore.has(RECEIPT_KEY) === false);

  const r3 = runApp({ url: "https://www.sylvianebahr.com/appointments.html#reserver" });
  r3.fireMessage({ event: "calendly.event_scheduled" }, CALENDLY_ORIGIN, { stranger: true });
  check("K3 unverified source window: no receipt", r3.sessionStore.has(RECEIPT_KEY) === false);
}

{
  // Positive control: a verified Calendly message does create the receipt.
  const widget = makeEl();
  const iframe = makeEl("iframe");
  const sentinel = { contentWindow: {} };
  iframe.contentWindow = sentinel.contentWindow;
  widget._q["iframe"] = iframe;
  const r = runApp({
    url: "https://www.sylvianebahr.com/appointments.html#reserver",
    documentQuery: { ".calendly-inline-widget": widget },
  });
  r.fireMessage({ event: "calendly.event_scheduled" }, CALENDLY_ORIGIN, sentinel.contentWindow);
  check("K4 verified message: receipt created", r.sessionStore.has(RECEIPT_KEY) === true);
  check(
    "K5 verified message: redirects to /confirmation.html",
    r.assignments.includes("/confirmation.html"),
    JSON.stringify(r.assignments),
  );
}

// ==========================================================================
// 3. Contact-form failure fallback
// ==========================================================================
console.log("== contact-form failure fallback ==");

{
  const actions = [
    {
      href: "mailto:test@example.com?subject=Test",
      label: "Send by email",
    },
    {
      href: "https://wa.me/34647376533?text=Test",
      label: "Send by WhatsApp",
      external: true,
      track: "whatsapp_click",
      trackSource: "form_fallback",
    },
  ];
  const result = executeSetFormStatus(APP_SRC, actions);
  check(
    "P1 fallback renders without ReferenceError",
    !result.error,
    result.error ? result.error.stack : "",
  );
  check("P2 fallback renders both contact links", result.links.length === 2, `got ${result.links.length}`);
  check(
    "P3 fallback keeps the email link",
    result.links[0]?.href === actions[0].href,
    result.links[0]?.href || "missing",
  );
  check(
    "P4 WhatsApp fallback keeps conversion metadata",
    result.links[1]?.dataset.track === "whatsapp_click" &&
      result.links[1]?.dataset.trackSource === "form_fallback",
    JSON.stringify(result.links[1]?.dataset || {}),
  );
}

// ==========================================================================
// 4. French/English handoff and fee context
// ==========================================================================
console.log("== French/English handoff ==");

const LANGUAGE_TRANSLATIONS = {
  fr: {
    headerBookingCta: "Prendre RDV",
    homePricingLink: "Voir les tarifs et modalités",
    bookingBarAria: "Réserver un premier échange gratuit de 30 minutes",
    whatsappAria: "Contacter Sylviane sur WhatsApp",
  },
  en: {
    headerBookingCta: "Book",
    homePricingLink: "See all fees and practical details",
    bookingBarAria: "Book a free 30-minute first call",
    whatsappAria: "Contact Sylviane on WhatsApp",
  },
  es: {
    headerBookingCta: "Reservar",
    homePricingLink: "Ver tarifas y detalles",
    bookingBarAria: "Reservar una primera conversación gratuita de 30 minutos",
    whatsappAria: "Contactar a Sylviane por WhatsApp",
  },
};

const makeI18nNode = (key) => {
  const node = makeEl("span");
  node.setAttribute("data-i18n", key);
  return node;
};

const bookingBarLink = (result) => {
  const bar = result.body.children.find((child) => child.className.includes("booking-bar"));
  return bar ? bar.children[0] : null;
};

const bookingBarUrl = (result) => {
  const link = bookingBarLink(result);
  if (!link || !link.href) return null;
  try {
    return new URL(link.href, result.win.location.href);
  } catch {
    return null;
  }
};

{
  const heading = makeI18nNode("headerBookingCta");
  const link = makeEl("a");
  link.setAttribute("href", "appointments.html?utm_source=static&lang=fr#reserver");
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/english-therapist-sant-cugat.html",
    pageLang: "en",
    staticLanguage: true,
    storedLang: "fr",
    langTargets: { fr: "therapeute-francophone-barcelone.html" },
    languageSelector: selector,
    bookingLinks: [link],
    querySelectorAll: { "[data-i18n]": [heading] },
    translations: LANGUAGE_TRANSLATIONS,
  });
  const barUrl = bookingBarUrl(r);
  const linkUrl = new URL(link.getAttribute("href"), r.win.location.href);
  check(
    "T1 authored EN wins over stored FR",
    r.doc.documentElement.lang === "en" &&
      selector.value === "en" &&
      heading.textContent === "Book",
    `${r.doc.documentElement.lang}/${selector.value}/${heading.textContent}`,
  );
  check(
    "T2 injected booking bar carries EN",
    !!barUrl && barUrl.pathname === "/appointments.html" && barUrl.searchParams.get("lang") === "en",
    barUrl ? barUrl.href : "missing",
  );
  check(
    "T3 static anchor keeps query/hash and replaces lang",
    linkUrl.pathname === "/appointments.html" &&
      linkUrl.searchParams.get("lang") === "en" &&
      linkUrl.searchParams.get("utm_source") === "static" &&
      linkUrl.hash === "#reserver",
    linkUrl.href,
  );
}

{
  const heading = makeI18nNode("headerBookingCta");
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/therapie-en-ligne.html",
    pageLang: "fr",
    staticLanguage: true,
    storedLang: "en",
    languageSelector: selector,
    querySelectorAll: { "[data-i18n]": [heading] },
    translations: LANGUAGE_TRANSLATIONS,
  });
  const barUrl = bookingBarUrl(r);
  check(
    "T4 authored FR wins over stored EN",
    r.doc.documentElement.lang === "fr" &&
      selector.value === "fr" &&
      heading.textContent === "Prendre RDV" &&
      !!barUrl &&
      barUrl.searchParams.get("lang") === "fr",
    `${r.doc.documentElement.lang}/${selector.value}/${heading.textContent}/${barUrl ? barUrl.href : "missing"}`,
  );
}

{
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/appointments.html?lang=en&utm_source=ads#reserver",
    pageLang: "fr",
    storedLang: "fr",
    languageSelector: selector,
    translations: LANGUAGE_TRANSLATIONS,
  });
  check(
    "T5 explicit valid lang overrides stored opposite",
    r.doc.documentElement.lang === "en" && selector.value === "en",
    `${r.doc.documentElement.lang}/${selector.value}`,
  );
  check(
    "T6 explicit valid lang is persisted safely",
    r.localStorageStore.get("site-lang") === "en",
    String(r.localStorageStore.get("site-lang")),
  );
}

{
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/appointments.html?lang=xx#reserver",
    pageLang: "fr",
    storedLang: "en",
    languageSelector: selector,
    translations: LANGUAGE_TRANSLATIONS,
  });
  check(
    "T7 invalid lang falls back to stored EN",
    r.doc.documentElement.lang === "en" && selector.value === "en",
    `${r.doc.documentElement.lang}/${selector.value}`,
  );
}

{
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/appointments.html?lang=en#reserver",
    pageLang: "fr",
    storedLang: "fr",
    storageBlocked: true,
    languageSelector: selector,
    translations: LANGUAGE_TRANSLATIONS,
  });
  const barUrl = bookingBarUrl(r);
  check(
    "T8 blocked storage still honors explicit lang",
    r.doc.documentElement.lang === "en" &&
      selector.value === "en" &&
      !!barUrl &&
      barUrl.searchParams.get("lang") === "en",
    `${r.doc.documentElement.lang}/${selector.value}/${barUrl ? barUrl.href : "missing"}`,
  );

  const staticSelector = makeEl("select");
  const staticResult = runApp({
    url: "https://www.sylvianebahr.com/online-couples-therapy.html",
    pageLang: "en",
    staticLanguage: true,
    storageBlocked: true,
    languageSelector: staticSelector,
    translations: LANGUAGE_TRANSLATIONS,
  });
  const staticBarUrl = bookingBarUrl(staticResult);
  check(
    "T9 blocked storage keeps static page authored language",
    staticResult.doc.documentElement.lang === "en" &&
      staticSelector.value === "en" &&
      !!staticBarUrl &&
      staticBarUrl.searchParams.get("lang") === "en",
    `${staticResult.doc.documentElement.lang}/${staticSelector.value}/${staticBarUrl ? staticBarUrl.href : "missing"}`,
  );
}

{
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/appointments.html?utm_source=ads#reserver",
    pageLang: "fr",
    storedLang: "fr",
    languageSelector: selector,
    translations: LANGUAGE_TRANSLATIONS,
  });
  selector._handlers.change[0]({ target: { value: "en" } });
  const replacedUrl = new URL(r.replaceStateCalls[0], "https://www.sylvianebahr.com");
  check(
    "T10 selector still switches the shared page",
    r.doc.documentElement.lang === "en" && r.localStorageStore.get("site-lang") === "en",
    `${r.doc.documentElement.lang}/${r.localStorageStore.get("site-lang")}`,
  );
  check(
    "T11 selector URL keeps other query/hash content",
    r.replaceStateCalls.length === 1 &&
      replacedUrl.pathname === "/appointments.html" &&
      replacedUrl.searchParams.get("lang") === "en" &&
      replacedUrl.searchParams.get("utm_source") === "ads" &&
      replacedUrl.hash === "#reserver",
    r.replaceStateCalls[0] || "missing",
  );
}

{
  const heading = makeI18nNode("headerBookingCta");
  const headerLink = makeEl("a");
  headerLink.setAttribute("href", "appointments.html?utm_source=header#reserver");
  const unrelated = makeEl("a");
  unrelated.setAttribute("href", "contact.html?lang=fr&utm_source=header#form");
  const unrelatedHref = unrelated.getAttribute("href");
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/therapie-en-ligne.html?utm_source=ads#intro",
    pageLang: "fr",
    storedLang: "fr",
    storageBlocked: true,
    languageSelector: selector,
    bookingLinks: [headerLink],
    querySelectorAll: { "[data-i18n]": [heading] },
    translations: LANGUAGE_TRANSLATIONS,
  });

  selector._handlers.change[0]({ target: { value: "en" } });
  const headerUrl = new URL(headerLink.getAttribute("href"), r.win.location.href);
  const barUrl = bookingBarUrl(r);
  check(
    "T16 blocked-storage selector FR->EN updates header and sticky handoff",
    r.doc.documentElement.lang === "en" &&
      heading.textContent === "Book" &&
      headerUrl.searchParams.get("lang") === "en" &&
      headerUrl.searchParams.get("utm_source") === "header" &&
      headerUrl.hash === "#reserver" &&
      !!barUrl &&
      barUrl.searchParams.get("lang") === "en" &&
      barUrl.hash === "#reserver",
    `${r.doc.documentElement.lang}/${heading.textContent}/${headerUrl.href}/${barUrl ? barUrl.href : "missing bar"}`,
  );
  check(
    "T17 language handoff leaves unrelated links untouched",
    unrelated.getAttribute("href") === unrelatedHref,
    unrelated.getAttribute("href") || "missing",
  );
}

{
  const heading = makeI18nNode("headerBookingCta");
  const headerLink = makeEl("a");
  headerLink.setAttribute("href", "appointments.html?utm_source=static#reserver");
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/therapie-en-ligne.html?lang=en#reserver",
    pageLang: "fr",
    staticLanguage: true,
    storedLang: "en",
    storageBlocked: true,
    languageSelector: selector,
    bookingLinks: [headerLink],
    querySelectorAll: { "[data-i18n]": [heading] },
    translations: LANGUAGE_TRANSLATIONS,
  });
  const headerUrl = new URL(headerLink.getAttribute("href"), r.win.location.href);
  const barUrl = bookingBarUrl(r);
  check(
    "T18 static authored FR ignores conflicting lang parameter",
    r.doc.documentElement.lang === "fr" &&
      heading.textContent === "Prendre RDV" &&
      headerUrl.searchParams.get("lang") === "fr" &&
      headerUrl.searchParams.get("utm_source") === "static" &&
      headerUrl.hash === "#reserver" &&
      !!barUrl &&
      barUrl.searchParams.get("lang") === "fr",
    `${r.doc.documentElement.lang}/${heading.textContent}/${headerUrl.href}/${barUrl ? barUrl.href : "missing bar"}`,
  );
}

{
  const frNote = makeEl("p");
  runApp({
    url: "https://www.sylvianebahr.com/appointments.html",
    pageLang: "fr",
    languageSelector: makeEl("select"),
    documentQuery: { "[data-booking-fee-note]": frNote },
    translations: LANGUAGE_TRANSLATIONS,
  });
  check(
    "T12 FR fee note covers free intro, France/world, couples and in-person",
    /Ce premier échange de 30 minutes reste gratuit/.test(frNote.textContent) &&
      /Pour les séances payantes en visio \(France, Espagne et reste du monde\) : 60 € les 60 minutes en individuel, 90 € les 75 minutes à deux\./.test(
        frNote.textContent,
      ) &&
      /En présentiel à Sant Cugat : 65 € la séance\./.test(frNote.textContent) &&
      /Les tarifs du Royaume-Uni et de Singapour figurent dans la grille complète\./.test(
        frNote.textContent,
      ) &&
      !/£|S\$/.test(frNote.textContent) &&
      !/En présentiel[^.]*minutes/.test(frNote.textContent) &&
      !/durée à confirmer/.test(frNote.textContent),
    frNote.textContent,
  );

  const enNote = makeEl("p");
  runApp({
    url: "https://www.sylvianebahr.com/appointments.html?lang=en",
    pageLang: "fr",
    languageSelector: makeEl("select"),
    documentQuery: { "[data-booking-fee-note]": enNote },
    translations: LANGUAGE_TRANSLATIONS,
  });
  check(
    "T13 EN fee note covers free intro, France/world, couples and in-person",
    /The free 30-minute first call remains separate from paid sessions\./.test(enNote.textContent) &&
      /For paid online sessions \(France, Spain and the rest of the world\): 60 € for 60 minutes individual, 90 € for 75 minutes for two\./.test(
        enNote.textContent,
      ) &&
      /In person in Sant Cugat: 65 € per session\./.test(enNote.textContent) &&
      /Fees for the United Kingdom and Singapore are listed in the full fee table\./.test(
        enNote.textContent,
      ) &&
      !/£|S\$/.test(enNote.textContent) &&
      !/In person[^.]*minutes/.test(enNote.textContent) &&
      !/duration to be confirmed/.test(enNote.textContent),
    enNote.textContent,
  );
  const appointmentsHtml = fs.readFileSync(path.join(ROOT, "appointments.html"), "utf8");
  check(
    "T14 appointments keeps the free 30-minute intro clear",
    /premier échange gratuit de 30 minutes/.test(appointmentsHtml) &&
      /calendly\.com\/sylvianebahr\/30min/.test(appointmentsHtml) &&
      /data-booking-fee-note/.test(appointmentsHtml) &&
      /Pour les séances payantes en visio \(France, Espagne et reste du monde\) : 60 €/.test(
        appointmentsHtml,
      ) &&
      /En présentiel à Sant Cugat : 65 € la séance/.test(appointmentsHtml),
  );
}

{
  const heading = makeI18nNode("headerBookingCta");
  const link = makeEl("a");
  link.setAttribute("href", "appointments.html?utm_source=static#reserver");
  const selector = makeEl("select");
  const r = runApp({
    url: "https://www.sylvianebahr.com/terapia-gestalt-sant-cugat.html",
    pageLang: "es",
    staticLanguage: true,
    storedLang: "en",
    languageSelector: selector,
    bookingLinks: [link],
    querySelectorAll: { "[data-i18n]": [heading] },
    translations: LANGUAGE_TRANSLATIONS,
  });
  const barUrl = bookingBarUrl(r);
  const linkUrl = new URL(link.getAttribute("href"), r.win.location.href);
  check(
    "T15 authored ES stays ES without language handoff",
    r.doc.documentElement.lang === "es" &&
      selector.value === "es" &&
      heading.textContent === "Reservar" &&
      !linkUrl.searchParams.has("lang") &&
      linkUrl.searchParams.get("utm_source") === "static" &&
      linkUrl.hash === "#reserver" &&
      !!barUrl &&
      !barUrl.searchParams.has("lang"),
    `${r.doc.documentElement.lang}/${selector.value}/${heading.textContent}/${linkUrl.href}/${barUrl ? barUrl.href : "missing bar"}`,
  );
}

// ==========================================================================
// 5. Injected booking bar resolves from /guides/
// ==========================================================================
console.log("== injected booking bar from /guides/ ==");

{
  const guideUrl = "https://www.sylvianebahr.com/guides/expat-loneliness-fr.html";
  const r = runApp({ url: guideUrl });
  const bar = r.body.children.find((c) => c.className.includes("booking-bar"));
  check("L1 booking bar injected on a guide-like page", !!bar);
  const link = bar && bar.children[0];
  check("L2 booking bar link present", !!link && !!link.href, link ? link.href : "none");
  const resolved = link && link.href ? new URL(link.href, guideUrl) : null;
  check(
    "L3 from /guides/x.html the link resolves to /appointments.html#reserver",
    !!resolved &&
      resolved.pathname === "/appointments.html" &&
      resolved.hash === "#reserver",
    resolved ? resolved.pathname + resolved.hash : "unresolved",
  );
}

// ==========================================================================
// 4. Deployment exclusions in _config.yml
// ==========================================================================
console.log("== _config.yml deployment exclusions ==");

{
  const cfgPath = path.join(ROOT, "_config.yml");
  const raw = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, "utf8") : "";
  const entries = ["seo", "scripts", "docs", "CLAUDE.md"];
  const structuralOk =
    /(^|\n)exclude:/.test(raw) && entries.every((e) => new RegExp(`(^|\\n)\\s*-\\s*${e.replace(".", "\\.")}\\s*($|\\n)`).test(raw));
  check("M1 _config.yml exists with the four exclusions", structuralOk);

  const ruby = spawnSync(
    "ruby",
    ["-ryaml", "-rjson", "-e", 'print JSON.generate(YAML.load_file("_config.yml"))'],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (ruby.status === 0) {
    let cfg = null;
    try {
      cfg = JSON.parse(ruby.stdout);
    } catch (e) {
      cfg = null;
    }
    const ex = cfg && Array.isArray(cfg.exclude) ? cfg.exclude : [];
    check(
      "M2 _config.yml parses as valid YAML with the exclude list",
      !!cfg && entries.every((e) => ex.includes(e)),
      JSON.stringify(ex),
    );
  } else {
    console.log("SKIP  M2 YAML parse (ruby/psych not available)");
  }
}

// ==========================================================================
// 5. node --check on both changed scripts
// ==========================================================================
console.log("== node --check ==");

for (const file of ["analytics.js", "app.js"]) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
  check(`N node --check ${file}`, r.status === 0, (r.stderr || "").trim());
}

// ==========================================================================
// 6. Reuse the pre-existing consent regression suite when present
// ==========================================================================
console.log("== existing consent regression (optional) ==");

{
  const legacy = "/tmp/ga4_test.mjs";
  if (fs.existsSync(legacy)) {
    const r = spawnSync(process.execPath, [legacy, path.join(ROOT, "analytics.js")], { encoding: "utf8" });
    check(
      "O existing /tmp/ga4_test.mjs passes",
      r.status === 0,
      (r.stdout || "").trim().split("\n").pop() || (r.stderr || "").trim(),
    );
  } else {
    console.log("SKIP  O /tmp/ga4_test.mjs not present");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
