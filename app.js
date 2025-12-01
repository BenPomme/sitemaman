(() => {
  const selector = document.getElementById("language-selector");
  const defaultLang = localStorage.getItem("site-lang") || "fr";
  let currentLang = translations[defaultLang] ? defaultLang : "fr";

  const translateTextNodes = (lang) => {
    const dict = translations[lang] || translations.fr;
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (dict[key]) node.textContent = dict[key];
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (dict[key]) node.placeholder = dict[key];
    });
  };

  const handleLanguageChange = (lang) => {
    currentLang = translations[lang] ? lang : "fr";
    localStorage.setItem("site-lang", currentLang);
    translateTextNodes(currentLang);
  };

  const handleFormSubmission = (form) => {
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const dict = translations[currentLang] || translations.fr;
      alert(dict.formSuccess || "Thanks for your message!");
      form.reset();
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    selector.value = currentLang;
    translateTextNodes(currentLang);

    selector.addEventListener("change", (e) => handleLanguageChange(e.target.value));

    handleFormSubmission(document.getElementById("appointment-form"));
    handleFormSubmission(document.getElementById("contact-form"));
  });
})();
