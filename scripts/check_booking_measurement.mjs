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
  const { api: localStorage } = makeStorage();

  const gtagCalls = [];
  const assignments = [];
  const winHandlers = {};

  const documentElement = {
    lang: "fr",
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
      return Object.prototype.hasOwnProperty.call(documentQuery, sel) ? documentQuery[sel] : null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
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
      pathname: pageUrl.pathname,
      search: pageUrl.search,
      hash: pageUrl.hash,
      assign: (u) => assignments.push(u),
      replace: () => {},
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
    translations: {},
    URL,
    URLSearchParams,
    Date,
    console,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(APP_SRC, sandbox, { filename: "app.js" });
  (doc._handlers.DOMContentLoaded || []).forEach((fn) => fn());

  return {
    win,
    doc,
    body,
    sessionStore,
    gtagCalls,
    assignments,
    fireMessage: (data, origin, source) =>
      (winHandlers.message || []).forEach((fn) => fn({ origin, data, source })),
  };
}

const eventsNamed = (result, name) =>
  result.gtagCalls.filter((c) => c[0] === "event" && c[1] === name);

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
// 3. Injected booking bar resolves from /guides/
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
