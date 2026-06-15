/** Theme editor manifest — sections, fields, pages */

export const HOME_SECTION_ORDER = [
  "hero",
  "manifesto",
  "collections",
  "bestSellers",
  "instagram",
  "reviews",
  "faq"
];

/** Pages statiques éditables via cms_content (Section B du menu éditeur). */
export const STATIC_PAGES = [
  {
    id: "returns",
    label: "Politique de retour & Remboursement",
    cmsKey: "page.returns",
    href: "../pages/livraison-retours.html",
    icon: "text"
  },
  {
    id: "cgv",
    label: "Conditions Générales de Vente (CGV)",
    cmsKey: "page.cgv",
    href: "../pages/conditions-utilisation.html",
    icon: "text"
  },
  {
    id: "legal",
    label: "Mentions Légales",
    cmsKey: "page.legal",
    href: "../pages/politique-confidentialite.html",
    icon: "text"
  },
  {
    id: "contact",
    label: "Contact / À Propos",
    cmsKey: "page.contact",
    href: "../pages/contact.html",
    icon: "mail"
  }
];

export const THEME_MANIFEST = {
  pages: {
    home: {
      label: "Page d'accueil",
      sections: [
        {
          id: "hero",
          label: "Bannière accueil",
          icon: "image",
          selector: '[data-editor-section="hero"]',
          page: "home",
          groups: [
            {
              id: "content",
              label: "Contenu",
              fields: [
                { key: "tagline", label: "Surtitre", type: "text", help: "Texte au-dessus du titre principal." },
                { key: "title", label: "Titre", type: "text" },
                { key: "ctaLabel", label: "Texte bouton", type: "text" },
                { key: "ctaHref", label: "Lien bouton", type: "text", help: "catalog ou URL complète." }
              ]
            },
            {
              id: "media",
              label: "Médias",
              fields: [
                {
                  key: "images",
                  label: "Images carousel",
                  type: "imageList",
                  help: "Une URL par ligne — carousel de la bannière."
                }
              ]
            }
          ]
        },
        {
          id: "manifesto",
          label: "Manifeste",
          icon: "text",
          selector: '[data-editor-section="manifesto"]',
          page: "home",
          groups: [
            {
              id: "content",
              label: "Contenu",
              fields: [
                { key: "eyebrow", label: "Surtitre", type: "text" },
                { key: "body", label: "Texte", type: "textarea" }
              ]
            }
          ]
        },
        {
          id: "collections",
          label: "Collections",
          icon: "grid",
          selector: '[data-editor-section="collections"]',
          page: "home",
          fields: [{ key: "title", label: "Titre de section", type: "text" }]
        },
        {
          id: "bestSellers",
          label: "Coups de cœur",
          icon: "grid",
          selector: '[data-editor-section="bestSellers"]',
          page: "home",
          fields: [
            { key: "eyebrow", label: "Surtitre", type: "text" },
            { key: "title", label: "Titre", type: "text" },
            { key: "viewAll", label: "Lien « Tout voir »", type: "text" }
          ]
        },
        {
          id: "instagram",
          label: "Instagram",
          icon: "social",
          selector: '[data-editor-section="instagram"]',
          page: "home",
          groups: [
            {
              id: "content",
              label: "Contenu",
              fields: [
                { key: "eyebrow", label: "Surtitre", type: "text" },
                { key: "title", label: "Titre", type: "text" },
                { key: "copy", label: "Description", type: "textarea" }
              ]
            },
            {
              id: "links",
              label: "Liens",
              fields: [
                { key: "handle", label: "Handle (@ld.boutique)", type: "text" },
                { key: "profileUrl", label: "URL profil Instagram", type: "text", help: "Lien vers le profil public." }
              ]
            }
          ]
        },
        {
          id: "reviews",
          label: "Témoignages",
          icon: "quote",
          selector: '[data-editor-section="reviews"]',
          page: "home",
          fields: [
            { key: "eyebrow", label: "Surtitre", type: "text" },
            { key: "title", label: "Titre", type: "text" },
            { key: "intro", label: "Introduction", type: "textarea" }
          ]
        },
        {
          id: "faq",
          label: "FAQ",
          icon: "faq",
          selector: '[data-editor-section="faq"]',
          page: "home",
          groups: [
            {
              id: "header",
              label: "En-tête",
              fields: [
                { key: "eyebrow", label: "Surtitre", type: "text" },
                { key: "title", label: "Titre", type: "text" },
                { key: "intro", label: "Introduction", type: "textarea" }
              ]
            },
            {
              id: "questions",
              label: "Questions",
              fields: [
                { key: "q1", label: "Question 1", type: "text" },
                { key: "a1", label: "Réponse 1", type: "textarea" },
                { key: "q2", label: "Question 2", type: "text" },
                { key: "a2", label: "Réponse 2", type: "textarea" },
                { key: "q3", label: "Question 3", type: "text" },
                { key: "a3", label: "Réponse 3", type: "textarea" },
                { key: "q4", label: "Question 4", type: "text" },
                { key: "a4", label: "Réponse 4", type: "textarea" },
                { key: "q5", label: "Question 5", type: "text" },
                { key: "a5", label: "Réponse 5", type: "textarea" },
                { key: "q6", label: "Question 6", type: "text" },
                { key: "a6", label: "Réponse 6", type: "textarea" }
              ]
            }
          ]
        },
        {
          id: "newsletter",
          label: "Newsletter",
          icon: "mail",
          selector: '[data-editor-section="newsletter"]',
          page: "home",
          fields: [
            { key: "title", label: "Titre", type: "text" },
            { key: "copy", label: "Texte", type: "textarea" },
            { key: "placeholder", label: "Placeholder e-mail", type: "text" },
            { key: "subscribe", label: "Bouton", type: "text" }
          ]
        },
        {
          id: "promoPopup",
          label: "Popup promo",
          icon: "popup",
          selector: "#welcome-promo-popup",
          page: "home",
          global: true,
          groups: [
            {
              id: "content",
              label: "Contenu",
              fields: [
                { key: "enabled", label: "Activer sur la boutique", type: "checkbox" },
                { key: "title", label: "Titre", type: "text" },
                { key: "body", label: "Texte", type: "textarea" },
                { key: "code", label: "Code promo", type: "text" }
              ]
            }
          ]
        }
      ]
    },
    catalog: {
      label: "Catalogue",
      sections: [
        {
          id: "catalogHeader",
          label: "En-tête catalogue",
          icon: "catalog",
          selector: '[data-editor-section="catalogHeader"]',
          page: "catalog",
          fields: [
            { key: "title", label: "Titre", type: "text" },
            { key: "subtitle", label: "Sous-titre", type: "textarea" }
          ]
        }
      ]
    }
  },
  global: {
    header: {
      id: "nav",
      label: "Navigation",
      icon: "nav",
      selector: "header",
      fields: [
        { key: "newArrivals", label: "Nouveautés", type: "text" },
        { key: "collections", label: "Collections", type: "text" },
        { key: "lastChance", label: "Dernière chance", type: "text" }
      ]
    },
    footer: {
      id: "footer",
      label: "Pied de page",
      icon: "footer",
      selector: "footer",
      fields: [
        { key: "privacy", label: "Confidentialité", type: "text" },
        { key: "terms", label: "Conditions", type: "text" },
        { key: "shippingReturns", label: "Livraison & retours", type: "text" },
        { key: "contact", label: "Contact", type: "text" },
        { key: "rights", label: "Droits réservés", type: "text" }
      ]
    }
  },
  themeSettings: {
    label: "Réglages du thème",
    icon: "palette",
    groups: [
      {
        id: "colors",
        label: "Couleurs",
        fields: [
          { key: "ink900", label: "Texte principal", type: "color", cssVar: "--ld-ink-900", default: "#1C1917" },
          { key: "gold700", label: "Accent or", type: "color", cssVar: "--ld-gold-700", default: "#7E6028" },
          { key: "cream50", label: "Fond clair", type: "color", cssVar: "--ld-cream-50", default: "#FDFAF5" },
          { key: "cream100", label: "Fond secondaire", type: "color", cssVar: "--ld-cream-100", default: "#FAF5EC" }
        ]
      },
      {
        id: "typography",
        label: "Typographie",
        fields: [
          { key: "headingFont", label: "Police titres", type: "font", default: "Cormorant Garamond" },
          { key: "bodyFont", label: "Police corps", type: "font", default: "DM Sans" }
        ]
      }
    ]
  }
};

export function getSectionById(sectionId) {
  for (const page of Object.values(THEME_MANIFEST.pages)) {
    const s = page.sections.find((x) => x.id === sectionId);
    if (s) return s;
  }
  if (sectionId === "nav") return { ...THEME_MANIFEST.global.header, id: "nav" };
  if (sectionId === "footer") return { ...THEME_MANIFEST.global.footer, id: "footer" };
  if (sectionId === "theme") {
    return {
      id: "theme",
      label: THEME_MANIFEST.themeSettings.label,
      icon: THEME_MANIFEST.themeSettings.icon,
      groups: THEME_MANIFEST.themeSettings.groups
    };
  }
  return null;
}

export function listSectionsForPage(pageKey) {
  const page = THEME_MANIFEST.pages[pageKey];
  if (!page) return [];
  return page.sections.filter((s) => !s.global);
}

export function listGlobalSections() {
  return [
    { id: "nav", ...THEME_MANIFEST.global.header },
    { id: "footer", ...THEME_MANIFEST.global.footer }
  ];
}

const FIELD_TO_I18N = {
  hero: { tagline: "home.heroTagline", title: "home.heroTitle", ctaLabel: "home.heroCta" },
  manifesto: { eyebrow: "home.manifestoEyebrow", body: "home.manifesto" },
  bestSellers: { eyebrow: "home.bestSellersEyebrow", title: "home.bestSellers", viewAll: "home.viewAll" },
  instagram: { eyebrow: "home.instagramEyebrow", title: "home.instagramTitle", copy: "home.instagramCopy" },
  reviews: { eyebrow: "home.reviewsEyebrow", title: "home.reviewsTitle", intro: "home.reviewsIntro" },
  newsletter: {
    title: "home.newsletterTitle",
    copy: "home.newsletterCopy",
    placeholder: "home.newsletterPlaceholder",
    subscribe: "home.subscribe"
  },
  catalogHeader: { title: "catalog.title", subtitle: "catalog.subtitle" },
  nav: { newArrivals: "nav.newArrivals", collections: "nav.collections", lastChance: "nav.lastChance" },
  footer: {
    privacy: "footer.privacy",
    terms: "footer.terms",
    shippingReturns: "footer.shippingReturns",
    contact: "footer.contact",
    rights: "footer.rights"
  },
  promoPopup: { title: "promoPopup.title", body: "promoPopup.body", code: "promoPopup.code" },
  faq: {
    eyebrow: "faq.eyebrow",
    title: "faq.title",
    intro: "faq.intro",
    q1: "faq.q1",
    a1: "faq.a1",
    q2: "faq.q2",
    a2: "faq.a2",
    q3: "faq.q3",
    a3: "faq.a3",
    q4: "faq.q4",
    a4: "faq.a4",
    q5: "faq.q5",
    a5: "faq.a5",
    q6: "faq.q6",
    a6: "faq.a6"
  }
};

export function fieldToI18nKey(sectionId, fieldKey) {
  return FIELD_TO_I18N[sectionId]?.[fieldKey] || null;
}
