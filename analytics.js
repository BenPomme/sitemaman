/* ============================================================
   Google tag (gtag.js) + consentement publicitaire
   ------------------------------------------------------------
   Tag du compte Google Ads de Sylviane Bahr : AW-18499976691.
   Le mode Consentement v2 est refusé par défaut. La bannière
   maison met à jour le consentement et la fonction attendue par
   app.js (window.sbHasAdsConsent).
   ============================================================ */
(function () {
  "use strict";

  var GOOGLE_ADS_TAG_ID = "AW-18499976691";
  var CONSENT_KEY = "sb-ads-consent";

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

  function readChoice() {
    try {
      return localStorage.getItem(CONSENT_KEY);
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

  function applyConsent(granted) {
    gtag("consent", "update", {
      ad_storage: granted ? "granted" : "denied",
      ad_user_data: granted ? "granted" : "denied",
      ad_personalization: granted ? "granted" : "denied",
      analytics_storage: granted ? "granted" : "denied",
    });
    window.sbHasAdsConsent = function () {
      return granted;
    };
  }

  var storedChoice = readChoice();
  if (storedChoice === "granted") {
    applyConsent(true);
  } else {
    window.sbHasAdsConsent = function () {
      return false;
    };
  }

  var TEXTS = {
    fr: {
      aria: "Consentement à la mesure publicitaire",
      text:
        "Mesure publicitaire : ce site utilise la balise Google Ads pour savoir " +
        "quelles annonces mènent à une réservation ou à un message. Aucun cookie " +
        "de mesure n'est posé avant votre accord.",
      accept: "Accepter",
      decline: "Refuser",
      more: "En savoir plus",
      link: "privacy.html",
    },
    en: {
      aria: "Advertising measurement consent",
      text:
        "Advertising measurement: this site uses the Google Ads tag to understand " +
        "which ads lead to a booking or a message. No measurement cookies are set " +
        "before you agree.",
      accept: "Accept",
      decline: "Decline",
      more: "Learn more",
      link: "privacy.html#english",
    },
    es: {
      aria: "Consentimiento de medición publicitaria",
      text:
        "Medición publicitaria: este sitio utiliza la etiqueta de Google Ads para " +
        "saber qué anuncios generan una reserva o un mensaje. No se instala ninguna " +
        "cookie de medición antes de tu consentimiento.",
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
    applyConsent(value === "granted");
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
