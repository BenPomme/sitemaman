/* ============================================================
   Google tag (gtag.js) + consentement de mesure
   ------------------------------------------------------------
   Deux destinations partagent un seul chargeur gtag.js :
     - Google Ads         : AW-18499976691 (réservations, messages)
     - Google Analytics 4 : G-G20ED3FMXT (audience agrégée)
   Le mode Consentement v2 est refusé par défaut. La bannière
   maison met à jour le consentement et la fonction attendue par
   app.js (window.sbHasAdsConsent).
   GA4 n'est configuré, et n'envoie donc aucune donnée, qu'APRÈS un
   consentement explicite. La clé de consentement est versionnée
   (sb-measurement-consent-v2) : un ancien accord publicitaire seul
   (sb-ads-consent) n'enrôle pas silencieusement l'audience.
   ============================================================ */
(function () {
  "use strict";

  var GOOGLE_ADS_TAG_ID = "AW-18499976691";
  var GA4_MEASUREMENT_ID = "G-G20ED3FMXT";
  var CONSENT_KEY = "sb-measurement-consent-v2";
  var LEGACY_ADS_CONSENT_KEY = "sb-ads-consent";

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  // Consent Mode v2 : tout est refusé avant le choix de l'utilisateur.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
  });
  gtag("js", new Date());
  gtag("config", GOOGLE_ADS_TAG_ID);

  var tagScript = document.createElement("script");
  tagScript.async = true;
  tagScript.src = "https://www.googletagmanager.com/gtag/js?id=" + GOOGLE_ADS_TAG_ID;
  document.head.appendChild(tagScript);

  // Action de conversion "Réservation 30 min" (catégorie Prise de rendez-vous)
  // créée dans Google Ads le 7 octobre 2026. app.js lit cette valeur au
  // chargement pour déclencher la conversion sur /confirmation.html.
  window.SB_GOOGLE_ADS_CONVERSION_SEND_TO = "AW-18499976691/4aizCIre4ZQdEPP7vPVE";

  function readKey(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storeChoice(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (error) {
      /* Stockage indisponible : le choix reste valable pour la page en cours. */
    }
  }

  // Consentement publicitaire et consentement d'audience sont mis à jour
  // ensemble depuis la bannière, mais restent distincts : un ancien accord
  // publicitaire n'ouvre pas l'audience, et refuser ferme les deux.
  function applyConsent(adsGranted, analyticsGranted) {
    gtag("consent", "update", {
      ad_storage: adsGranted ? "granted" : "denied",
      ad_user_data: adsGranted ? "granted" : "denied",
      ad_personalization: adsGranted ? "granted" : "denied",
      analytics_storage: analyticsGranted ? "granted" : "denied",
    });
    window.sbHasAdsConsent = function () {
      return adsGranted;
    };
  }

  // Origine + chemin uniquement : aucun paramètre de requête ni fragment
  // n'est transmis à la mesure.
  function sanitizedUrl(raw) {
    if (!raw) {
      return "";
    }
    try {
      var parsed = new URL(raw, window.location.href);
      if (!parsed.origin || parsed.origin === "null") {
        return "";
      }
      return parsed.origin + parsed.pathname;
    } catch (error) {
      return "";
    }
  }

  var ga4Initialized = false;

  // Configure GA4 une seule fois, uniquement après consentement explicite.
  // Aucune donnée saisie par l'utilisateur n'est transmise : la pagevue
  // automatique ne porte que la page (origine + chemin) et le référent sans
  // query ni hash. La personnalisation publicitaire est désactivée pour GA4.
  function initGa4() {
    if (ga4Initialized) {
      return;
    }
    ga4Initialized = true;

    var params = {
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
    };
    var pageLocation = sanitizedUrl(window.location.href);
    if (pageLocation) {
      params.page_location = pageLocation;
    }
    var pageReferrer = sanitizedUrl(document.referrer);
    params.page_referrer = pageReferrer;

    gtag("config", GA4_MEASUREMENT_ID, params);
  }

  var storedChoice = readKey(CONSENT_KEY);
  var legacyChoice = readKey(LEGACY_ADS_CONSENT_KEY);

  // Le choix versionné fait foi. À défaut de choix versionné, on honore
  // l'ancien accord publicitaire (sb-ads-consent) pour ne pas interrompre la
  // mesure Google Ads déjà consentie ; un accord ancien ne donne en revanche
  // jamais accès à GA4, qui exige le choix versionné.
  var adsGranted =
    storedChoice === "granted" || (storedChoice === null && legacyChoice === "granted");
  var analyticsGranted = storedChoice === "granted";

  if (adsGranted) {
    applyConsent(true, analyticsGranted);
  } else {
    window.sbHasAdsConsent = function () {
      return false;
    };
  }

  if (analyticsGranted) {
    initGa4();
  }

  var TEXTS = {
    fr: {
      aria: "Consentement à la mesure d'audience et publicitaire",
      text:
        "Mesure d'audience et publicité : ce site utilise Google Analytics pour " +
        "mesurer la fréquentation de façon agrégée et la balise Google Ads pour " +
        "savoir quelles annonces mènent à une réservation ou à un message. Aucun " +
        "cookie de mesure n'est posé avant votre accord.",
      accept: "Accepter",
      decline: "Refuser",
      more: "En savoir plus",
      link: "privacy.html",
    },
    en: {
      aria: "Analytics and advertising measurement consent",
      text:
        "Analytics and advertising measurement: this site uses Google Analytics " +
        "to measure aggregate traffic and the Google Ads tag to understand which " +
        "ads lead to a booking or a message. No measurement cookies are set " +
        "before you agree.",
      accept: "Accept",
      decline: "Decline",
      more: "Learn more",
      link: "privacy.html#english",
    },
    es: {
      aria: "Consentimiento de medición de audiencia y publicitaria",
      text:
        "Medición de audiencia y publicidad: este sitio utiliza Google Analytics " +
        "para medir la audiencia de forma agregada y la etiqueta de Google Ads " +
        "para saber qué anuncios generan una reserva o un mensaje. No se instala " +
        "ninguna cookie de medición antes de tu consentimiento.",
      accept: "Aceptar",
      decline: "Rechazar",
      more: "Más información",
      link: "privacy.html",
    },
  };

  function currentLanguage() {
    var lang = "";
    try {
      lang = localStorage.getItem("site-lang") || "";
    } catch (error) {
      lang = "";
    }
    if (!lang) {
      lang = document.documentElement.lang || "fr";
    }
    lang = String(lang).slice(0, 2).toLowerCase();
    return TEXTS[lang] ? lang : "fr";
  }

  var banner = null;

  function removeBanner() {
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
    banner = null;
  }

  function setChoice(value) {
    storeChoice(value);
    var granted = value === "granted";
    applyConsent(granted, granted);
    if (granted) {
      initGa4();
    }
    removeBanner();
  }

  function buildBanner() {
    if (banner || storedChoice === "granted" || storedChoice === "denied") {
      return;
    }
    if (!document.body) {
      return;
    }
    var text = TEXTS[currentLanguage()];
    banner = document.createElement("div");
    banner.className = "consent-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", text.aria);
    banner.innerHTML =
      '<p class="consent-banner__text">' +
      text.text +
      ' <a href="' +
      text.link +
      '">' +
      text.more +
      "</a></p>" +
      '<div class="consent-banner__actions">' +
      '<button type="button" class="consent-banner__decline">' +
      text.decline +
      "</button>" +
      '<button type="button" class="consent-banner__accept">' +
      text.accept +
      "</button>" +
      "</div>";
    banner
      .querySelector(".consent-banner__accept")
      .addEventListener("click", function () {
        setChoice("granted");
      });
    banner
      .querySelector(".consent-banner__decline")
      .addEventListener("click", function () {
        setChoice("denied");
      });
    document.body.appendChild(banner);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildBanner);
  } else {
    buildBanner();
  }

  // Si la langue change pendant que la bannière est affichée, on la met à jour.
  document.addEventListener("change", function (event) {
    if (!banner || !event.target || event.target.id !== "language-selector") {
      return;
    }
    removeBanner();
    buildBanner();
  });
})();
