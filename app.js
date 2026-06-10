(() => {
  const WHATSAPP_NUMBER = "34647376533";
  const WHATSAPP_MESSAGES = {
    fr: "Bonjour Sylviane, je vous contacte depuis votre site pour un premier échange.",
    en: "Hello Sylviane, I am contacting you from your website about a first conversation.",
    es: "Hola Sylviane, te contacto desde tu web para una primera conversación.",
  };

  const selector = document.getElementById("language-selector");
  const defaultLang = localStorage.getItem("site-lang") || "fr";
  let currentLang = translations[defaultLang] ? defaultLang : "fr";

  const updateWhatsAppLink = (lang) => {
    const link = document.querySelector("[data-whatsapp-link]");
    if (!link) return;

    const dict = translations[lang] || translations.fr;
    const message = WHATSAPP_MESSAGES[lang] || WHATSAPP_MESSAGES.fr;
    link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    link.setAttribute("aria-label", dict.whatsappAria || "Contact Sylviane on WhatsApp");
    link.setAttribute("title", dict.whatsappAria || "Contact Sylviane on WhatsApp");
  };

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

    updateWhatsAppLink(lang);
  };

  const handleLanguageChange = (lang) => {
    currentLang = translations[lang] ? lang : "fr";
    localStorage.setItem("site-lang", currentLang);
    translateTextNodes(currentLang);
  };

  const createWhatsAppButton = () => {
    if (document.querySelector("[data-whatsapp-link]")) return;

    const link = document.createElement("a");
    link.className = "whatsapp-float";
    link.dataset.whatsappLink = "true";
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = `
      <svg class="whatsapp-float__icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M16.03 4.2c-6.37 0-11.55 5.12-11.55 11.43 0 2.12.6 4.19 1.72 5.99L4.38 28l6.55-1.7a11.68 11.68 0 0 0 5.1 1.18c6.37 0 11.55-5.12 11.55-11.43S22.4 4.2 16.03 4.2Zm0 21.34c-1.7 0-3.36-.43-4.83-1.25l-.35-.2-3.88 1.01 1.04-3.74-.23-.38a9.67 9.67 0 0 1-1.38-4.95c0-5.24 4.32-9.5 9.63-9.5 5.3 0 9.62 4.26 9.62 9.5 0 5.25-4.32 9.51-9.62 9.51Zm5.28-7.12c-.29-.14-1.7-.83-1.96-.92-.26-.1-.45-.14-.64.14-.19.28-.74.92-.9 1.11-.17.19-.33.21-.62.07-.29-.14-1.22-.45-2.33-1.43a8.72 8.72 0 0 1-1.61-1.99c-.17-.28-.02-.43.13-.57.13-.13.29-.33.43-.5.14-.16.19-.28.29-.47.1-.19.05-.36-.02-.5-.08-.14-.64-1.53-.88-2.1-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.36-.26.28-1 1-1 2.43 0 1.42 1.04 2.8 1.18 2.99.14.19 2.04 3.08 4.95 4.32.69.3 1.23.48 1.65.61.69.22 1.32.19 1.82.12.55-.08 1.7-.69 1.94-1.35.24-.66.24-1.23.17-1.35-.07-.12-.26-.19-.55-.33Z"/>
      </svg>
      <span class="whatsapp-float__text" data-i18n="whatsappCTA">WhatsApp</span>
    `;

    document.body.appendChild(link);
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
    createWhatsAppButton();
    translateTextNodes(currentLang);

    selector?.addEventListener("change", (e) => handleLanguageChange(e.target.value));

    document.querySelectorAll("[data-async-form]").forEach(handleFormSubmission);
  });
})();
