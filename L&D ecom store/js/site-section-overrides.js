/**
 * Shared mapping: site_settings.sections JSON -> dict i18n keys (fr/en).
 * Loaded by vitrine (editor-mode) and admin theme editor.
 */
(function (global) {
  function setNested(obj, path, value) {
    if (value === undefined || value === null || value === "") return;
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function applySectionsToDict(dict, locale, sections) {
    if (!dict || !sections || typeof sections !== "object") return;
    const loc = dict[locale];
    if (!loc) return;
    const s = sections;

    if (s.hero) {
      if (s.hero.tagline) loc.home.heroTagline = s.hero.tagline;
      if (s.hero.title) loc.home.heroTitle = s.hero.title;
      if (s.hero.ctaLabel) loc.home.heroCta = s.hero.ctaLabel;
    }
    if (s.manifesto) {
      if (s.manifesto.eyebrow) loc.home.manifestoEyebrow = s.manifesto.eyebrow;
      if (s.manifesto.body) loc.home.manifesto = s.manifesto.body;
    }
    if (s.bestSellers) {
      if (s.bestSellers.eyebrow) loc.home.bestSellersEyebrow = s.bestSellers.eyebrow;
      if (s.bestSellers.title) loc.home.bestSellers = s.bestSellers.title;
      if (s.bestSellers.viewAll) loc.home.viewAll = s.bestSellers.viewAll;
    }
    if (s.instagram) {
      if (s.instagram.eyebrow) loc.home.instagramEyebrow = s.instagram.eyebrow;
      if (s.instagram.title) loc.home.instagramTitle = s.instagram.title;
      if (s.instagram.copy) loc.home.instagramCopy = s.instagram.copy;
    }
    if (s.reviews) {
      if (s.reviews.eyebrow) loc.home.reviewsEyebrow = s.reviews.eyebrow;
      if (s.reviews.title) loc.home.reviewsTitle = s.reviews.title;
      if (s.reviews.intro) loc.home.reviewsIntro = s.reviews.intro;
    }
    if (s.newsletter) {
      if (s.newsletter.title) loc.home.newsletterTitle = s.newsletter.title;
      if (s.newsletter.copy) loc.home.newsletterCopy = s.newsletter.copy;
      if (s.newsletter.placeholder) loc.home.newsletterPlaceholder = s.newsletter.placeholder;
      if (s.newsletter.subscribe) loc.home.subscribe = s.newsletter.subscribe;
    }
    if (s.faq) {
      const f = s.faq;
      if (f.eyebrow) loc.faq.eyebrow = f.eyebrow;
      if (f.title) loc.faq.title = f.title;
      if (f.intro) loc.faq.intro = f.intro;
      for (let i = 1; i <= 6; i++) {
        if (f[`q${i}`]) loc.faq[`q${i}`] = f[`q${i}`];
        if (f[`a${i}`]) loc.faq[`a${i}`] = f[`a${i}`];
      }
    }
    if (s.catalogHeader) {
      if (s.catalogHeader.title) loc.catalog.title = s.catalogHeader.title;
      if (s.catalogHeader.subtitle) loc.catalog.subtitle = s.catalogHeader.subtitle;
    }
    if (s.nav) {
      if (s.nav.newArrivals) loc.nav.newArrivals = s.nav.newArrivals;
      if (s.nav.collections) loc.nav.collections = s.nav.collections;
      if (s.nav.lastChance) loc.nav.lastChance = s.nav.lastChance;
    }
    if (s.footer) {
      if (s.footer.privacy) loc.footer.privacy = s.footer.privacy;
      if (s.footer.terms) loc.footer.terms = s.footer.terms;
      if (s.footer.shippingReturns) loc.footer.shippingReturns = s.footer.shippingReturns;
      if (s.footer.contact) loc.footer.contact = s.footer.contact;
      if (s.footer.rights) loc.footer.rights = s.footer.rights;
    }
    if (s.promoPopup && loc.promoPopup) {
      if (s.promoPopup.title) loc.promoPopup.title = s.promoPopup.title;
      if (s.promoPopup.body) loc.promoPopup.body = s.promoPopup.body;
      if (s.promoPopup.code) loc.promoPopup.code = s.promoPopup.code;
    }
  }

  /** Map section field edits to i18n key for PATCH_I18N */
  const FIELD_TO_I18N = {
    hero: {
      tagline: "home.heroTagline",
      title: "home.heroTitle",
      ctaLabel: "home.heroCta"
    },
    manifesto: { eyebrow: "home.manifestoEyebrow", body: "home.manifesto" },
    bestSellers: {
      eyebrow: "home.bestSellersEyebrow",
      title: "home.bestSellers",
      viewAll: "home.viewAll"
    },
    instagram: {
      eyebrow: "home.instagramEyebrow",
      title: "home.instagramTitle",
      copy: "home.instagramCopy",
      handle: null
    },
    reviews: {
      eyebrow: "home.reviewsEyebrow",
      title: "home.reviewsTitle",
      intro: "home.reviewsIntro"
    },
    newsletter: {
      title: "home.newsletterTitle",
      copy: "home.newsletterCopy",
      placeholder: "home.newsletterPlaceholder",
      subscribe: "home.subscribe"
    },
    catalogHeader: { title: "catalog.title", subtitle: "catalog.subtitle" },
    nav: {
      newArrivals: "nav.newArrivals",
      collections: "nav.collections",
      lastChance: "nav.lastChance"
    },
    footer: {
      privacy: "footer.privacy",
      terms: "footer.terms",
      shippingReturns: "footer.shippingReturns",
      contact: "footer.contact",
      rights: "footer.rights"
    },
    promoPopup: {
      title: "promoPopup.title",
      body: "promoPopup.body",
      code: "promoPopup.code"
    },
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

  function fieldToI18nKey(sectionId, fieldKey) {
    return FIELD_TO_I18N[sectionId]?.[fieldKey] || null;
  }

  global.LD_SECTION_OVERRIDES = {
    applySectionsToDict,
    fieldToI18nKey,
    setNested
  };
})(typeof window !== "undefined" ? window : globalThis);
