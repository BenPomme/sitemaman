(() => {
  const selector = document.getElementById("language-selector");
  const defaultLang = localStorage.getItem("site-lang") || "fr";
  let currentLang = translations[defaultLang] ? defaultLang : "fr";

  const translateTextNodes = (lang) => {
    const dict = translations[lang] || translations.fr;
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (dict[key]) {
        // Use innerHTML if the translation contains HTML tags, otherwise use textContent
        if (dict[key].includes("<")) {
          node.innerHTML = dict[key];
        } else {
          node.textContent = dict[key];
        }
      }
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

  const setFormStatus = (form, message, state) => {
    const statusNode = form.querySelector("[data-form-status]");
    if (!statusNode) return;

    statusNode.hidden = !message;
    statusNode.textContent = message || "";
    statusNode.dataset.state = state || "";
  };

  const handleFormSubmission = (form) => {
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      const action = form.getAttribute("action");
      if (!action) return;

      event.preventDefault();

      const dict = translations[currentLang] || translations.fr;
      const submitButton = form.querySelector('button[type="submit"]');

      if (submitButton) submitButton.disabled = true;
      setFormStatus(form, dict.formSending || "Sending...", "sending");

      try {
        const response = await fetch(action, {
          method: "POST",
          body: new FormData(form),
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Submission failed with status ${response.status}`);
        }

        form.reset();
        setFormStatus(form, dict.formSuccess || "Thanks for your message!", "success");
      } catch (error) {
        console.error(error);
        setFormStatus(
          form,
          dict.formError || "The message could not be sent. Please try again later.",
          "error",
        );
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (selector) selector.value = currentLang;
    translateTextNodes(currentLang);

    selector?.addEventListener("change", (e) => handleLanguageChange(e.target.value));

    document.querySelectorAll("[data-async-form]").forEach(handleFormSubmission);
  });
})();
