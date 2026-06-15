/**
 * Storefront editor mode (?editor=1) — postMessage bridge with admin
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get("editor") !== "1") return;

  document.documentElement.classList.add("ld-editor-mode");
  document.body.classList.add("ld-editor-mode");

  const isPreview = params.get("preview") === "1";
  let parentOrigin = null;
  let highlightEl = null;

  function getParentOrigin() {
    if (parentOrigin) return parentOrigin;
    try {
      if (document.referrer) parentOrigin = new URL(document.referrer).origin;
    } catch (_) {}
    return parentOrigin;
  }

  function postToParent(msg) {
    const o = getParentOrigin();
    if (!o || !window.parent || window.parent === window) return;
    window.parent.postMessage({ source: "ld-storefront", ...msg }, o);
  }

  function setNested(obj, path, value) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function patchI18nKey(key, value) {
    if (typeof dict === "undefined" || typeof state === "undefined") return;
    setNested(dict[state.locale], key, value);
    if (typeof applyI18n === "function") applyI18n();
    if (key === "promoPopup.code") {
      const codeEl = document.querySelector("[data-promo-code]");
      if (codeEl) codeEl.textContent = value;
    }
  }

  function patchSectionDom(sectionId, field, value) {
    if (sectionId === "hero" && field === "ctaHref") {
      const link = document.getElementById("hero-cta-link");
      if (link && value) {
        if (value === "catalog") link.setAttribute("onclick", "navigate('catalog'); return false;");
        else link.href = value;
      }
    }
    if (sectionId === "instagram" && field === "handle") {
      const el = document.querySelector("[data-instagram-handle]");
      if (el) el.textContent = value.startsWith("@") ? value : `@${value}`;
    }
    if (sectionId === "instagram" && field === "profileUrl") {
      const el = document.querySelector("[data-instagram-handle]");
      if (el && value) el.href = value;
    }
    if (sectionId === "promoPopup" && field === "enabled") {
      window.__ldPromoEnabled = !!value;
    }
  }

  function applyThemeOverrides(theme) {
    if (!theme || typeof theme !== "object") return;
    const colors = theme.colors || theme;
    const typo = theme.typography || theme;
    let css = ":root {\n";
    if (colors.ink900) css += `  --ld-ink-900: ${colors.ink900};\n`;
    if (colors.gold700) css += `  --ld-gold-700: ${colors.gold700};\n`;
    if (colors.cream50) css += `  --ld-cream-50: ${colors.cream50};\n`;
    if (colors.cream100) css += `  --ld-cream-100: ${colors.cream100};\n`;
    css += "}\n";
    if (colors.cream50) css += `body { background-color: ${colors.cream50} !important; }\n`;
    if (colors.ink900) css += `body { color: ${colors.ink900} !important; }\n`;
    const hf = typo.headingFont || colors.headingFont;
    const bf = typo.bodyFont || colors.bodyFont;
    if (hf) css += `.serif { font-family: '${hf}', serif !important; }\n`;
    if (bf) css += `body { font-family: '${bf}', sans-serif !important; }\n`;
    let el = document.getElementById("ld-theme-overrides");
    if (!el) {
      el = document.createElement("style");
      el.id = "ld-theme-overrides";
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function applyHeroImages(urls) {
    if (!Array.isArray(urls) || !urls.length) return;
    const slides = document.querySelectorAll("[data-hero-slide]");
    urls.forEach((url, i) => {
      if (slides[i] && url) slides[i].src = url;
    });
  }

  function updateEditorPageFill() {
    document.querySelectorAll(".ld-editor-fill-last").forEach((el) => el.classList.remove("ld-editor-fill-last"));
    document.getElementById("page-catalog")?.classList.remove("ld-editor-fill-page");
  }

  function applySectionsMeta(meta) {
    if (!meta || typeof meta !== "object") return;
    const hidden = meta.hidden || [];
    const order = meta.order || [];
    hidden.forEach((id) => {
      const el = document.querySelector(`[data-editor-section="${id}"]`);
      if (el) el.style.display = "none";
    });
    document.querySelectorAll("[data-editor-section]").forEach((el) => {
      const id = el.getAttribute("data-editor-section");
      if (!hidden.includes(id)) el.style.display = "";
    });
    if (order.length && document.getElementById("page-home")) {
      const home = document.getElementById("page-home");
      order.forEach((id) => {
        const el = document.querySelector(`[data-editor-section="${id}"]`);
        if (el && el.parentNode === home) home.appendChild(el);
      });
    }
    updateEditorPageFill();
  }

  function clearHighlight() {
    if (highlightEl) {
      highlightEl.classList.remove("ld-editor-highlight");
      highlightEl = null;
    }
  }

  function doHighlight(selector) {
    clearHighlight();
    const el = selector ? document.querySelector(selector) : null;
    if (!el) return;
    el.classList.add("ld-editor-highlight");
    highlightEl = el;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  window.addEventListener("message", (ev) => {
    const o = getParentOrigin();
    if (!o || ev.origin !== o) return;
    const data = ev.data;
    if (!data || data.source !== "ld-admin") return;

    switch (data.type) {
      case "PATCH_I18N":
        patchI18nKey(data.key, data.value);
        break;
      case "PATCH_SECTION": {
        const ov = window.LD_SECTION_OVERRIDES;
        const key = ov?.fieldToI18nKey?.(data.sectionId, data.field);
        if (key) patchI18nKey(key, data.value);
        patchSectionDom(data.sectionId, data.field, data.value);
        break;
      }
      case "PATCH_THEME":
        applyThemeOverrides(data.theme);
        break;
      case "PATCH_HERO_IMAGES":
        applyHeroImages(data.urls);
        break;
      case "PATCH_SECTIONS_META":
        applySectionsMeta(data.meta);
        break;
      case "NAVIGATE":
        if (typeof navigate === "function") navigate(data.page || "home");
        requestAnimationFrame(updateEditorPageFill);
        break;
      case "HIGHLIGHT":
        doHighlight(data.selector);
        break;
      case "PREVIEW_DEVICE": {
        document.documentElement.classList.toggle("ld-preview-mobile", data.mode === "mobile");
        break;
      }
      case "SHOW_PROMO":
        if (typeof window.__ldShowPromoForEditor === "function") window.__ldShowPromoForEditor();
        break;
      default:
        break;
    }
  });

  document.addEventListener("click", (e) => {
    const sec = e.target.closest("[data-editor-section]");
    if (!sec) return;
    e.preventDefault();
    e.stopPropagation();
    postToParent({ type: "SELECTED", sectionId: sec.getAttribute("data-editor-section") });
    doHighlight(`[data-editor-section="${sec.getAttribute("data-editor-section")}"]`);
  }, true);

  const style = document.createElement("style");
  style.textContent = `
    .ld-editor-highlight { outline: 2px solid #2563eb !important; outline-offset: 4px; }
    [data-editor-section] { cursor: pointer; }
    .ld-preview-mobile body { max-width: 390px; margin: 0 auto; }
  `;
  document.head.appendChild(style);

  window.__ldUpdateEditorPageFill = updateEditorPageFill;

  window.__ldEditorInit = function () {
    postToParent({ type: "READY", preview: isPreview });
    if (isPreview && window.__ldSectionsMeta) applySectionsMeta(window.__ldSectionsMeta);
    else updateEditorPageFill();
    if (window.__ldThemeDraft) applyThemeOverrides(window.__ldThemeDraft);
  };

  window.__ldShowPromoForEditor = function () {
    if (typeof showWelcomePromoPopup === "function") {
      localStorage.removeItem("ld-welcome-dismissed-at");
      localStorage.removeItem("ld-welcome-promo-seen");
      showWelcomePromoPopup();
    }
  };
})();
