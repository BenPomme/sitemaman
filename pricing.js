// ============================================================
// Tarifs des séances - fichier de configuration
// ------------------------------------------------------------
// Modifiez uniquement les montants ci-dessous, puis rechargez le
// site : les prix affichés partout sont mis à jour automatiquement.
//
// Grille validée le 7 octobre 2026 : "draft" est passé à false et la
// mention "en validation" n'apparaît plus. Pour repasser en mode
// proposition avant publication, remettez draft à true.
// ============================================================
window.SITE_PRICING = {
  draft: false,
  updated: "2026-10-07",
  items: [
    {
      id: "in-person",
      amount: "65 €",
      label: {
        fr: "Séance en présentiel, Barcelone / Sant Cugat",
        en: "In-person session, Barcelona / Sant Cugat",
        es: "Sesión presencial, Barcelona / Sant Cugat",
      },
    },
    {
      id: "online-spain",
      amount: "60 €",
      label: {
        fr: "Séance en visio, clients en Espagne",
        en: "Online session, clients in Spain",
        es: "Sesión online, clientes en España",
      },
    },
    {
      id: "online-uk",
      amount: "£55",
      label: {
        fr: "Séance en visio, Royaume-Uni",
        en: "Online session, United Kingdom",
        es: "Sesión online, Reino Unido",
      },
    },
    {
      id: "online-singapore",
      amount: "S$120",
      label: {
        fr: "Séance en visio, Singapour",
        en: "Online session, Singapore",
        es: "Sesión online, Singapur",
      },
    },
  ],
};
