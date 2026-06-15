import { escapeHtml, toast, setStickyBar } from "./ui.js";
import { createEditorBridge } from "./editor-bridge.js";
import {
  THEME_MANIFEST,
  HOME_SECTION_ORDER,
  STATIC_PAGES,
  getSectionById,
  listSectionsForPage,
  listGlobalSections,
  fieldToI18nKey
} from "./theme-manifest.js";
import { sanitizeMediaFilename } from "./media.js";
import {
  sectionIconSvg,
  eyeIconSvg,
  getFieldsGrouped,
  renderFieldHtml,
  bindInspectorInputs,
  highlightInspectorField,
  setStudioDirty,
  setDraftBadge,
  setPreviewDeviceUi,
  showThemeStudio,
  initThemeStudioChrome,
  updateUndoRedoButtons,
  orderArrowSvg
} from "./theme-studio-ui.js";

const STORAGE_BUCKET = "product-media";
const DRAFT_ID = "draft";
const STATIC_PAGE_KEYS = new Set(STATIC_PAGES.map((p) => p.cmsKey));
const PUBLISHED_ID = "published";
const UNDO_MAX = 20;

export function createThemeEditor(ctx) {
  let locale = "fr";
  let draftSections = {};
  let draftTheme = {};
  let sectionsMeta = { order: [...HOME_SECTION_ORDER], hidden: [] };
  let dirty = false;
  let activePage = "home";
  let activeSectionId = "hero";
  let activeStaticPageId = null;
  let activeCmsKey = null;
  let activeFieldKey = null;
  let treeView = "sections";
  let sectionSearch = "";
  let bridge = null;
  let previewDevice = "desktop";
  let undoStack = [];
  let redoStack = [];
  let suppressHistory = false;

  function snapshotState() {
    return {
      draftSections: JSON.parse(JSON.stringify(draftSections)),
      draftTheme: JSON.parse(JSON.stringify(draftTheme)),
      sectionsMeta: JSON.parse(JSON.stringify(sectionsMeta))
    };
  }

  function pushHistory() {
    if (suppressHistory) return;
    undoStack.push(snapshotState());
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack = [];
    syncUndoRedoUi();
  }

  function restoreState(snap) {
    suppressHistory = true;
    draftSections = JSON.parse(JSON.stringify(snap.draftSections));
    draftTheme = JSON.parse(JSON.stringify(snap.draftTheme));
    sectionsMeta = JSON.parse(JSON.stringify(snap.sectionsMeta));
    ctx.state.siteSettingsSections = { ...draftSections };
    ctx.state.siteSettingsTheme = { ...draftTheme };
    bridge?.patchSectionsMeta(sectionsMeta);
    if (Object.keys(draftTheme).length) bridge?.patchTheme(draftTheme);
    const heroImgs = draftSections.hero?.images;
    if (heroImgs?.length) bridge?.patchHeroImages(heroImgs);
    renderTree();
    renderProperties(getSectionById(activeSectionId));
    suppressHistory = false;
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshotState());
    const prev = undoStack.pop();
    restoreState(prev);
    markDirty();
    syncUndoRedoUi();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshotState());
    const next = redoStack.pop();
    restoreState(next);
    markDirty();
    syncUndoRedoUi();
  }

  function syncUndoRedoUi() {
    updateUndoRedoButtons(
      document.getElementById("theme-studio-undo"),
      document.getElementById("theme-studio-redo"),
      undoStack.length > 0,
      redoStack.length > 0
    );
  }

  function markDirty() {
    dirty = true;
    setStudioDirty(true);
    updatePublishBadge();
  }

  function clearDirty() {
    dirty = false;
    setStudioDirty(false);
    updatePublishBadge();
  }

  async function loadDraft() {
    const { data, error } = await ctx.sb
      .from("site_settings")
      .select("sections,theme,updated_at")
      .eq("id", DRAFT_ID)
      .eq("locale", locale)
      .maybeSingle();

    if (error && !String(error.message).includes("does not exist")) {
      console.warn(error);
    }

    if (!data) {
      const { data: pub } = await ctx.sb
        .from("site_settings")
        .select("sections,theme")
        .eq("id", PUBLISHED_ID)
        .eq("locale", locale)
        .maybeSingle();
      const { data: legacy } = await ctx.sb
        .from("site_settings")
        .select("sections,theme")
        .eq("id", "default")
        .eq("locale", locale)
        .maybeSingle();
      const src = pub || legacy;
      draftSections = src?.sections && typeof src.sections === "object" ? { ...src.sections } : {};
      draftTheme = src?.theme && typeof src.theme === "object" ? { ...src.theme } : {};
    } else {
      draftSections = data.sections && typeof data.sections === "object" ? { ...data.sections } : {};
      draftTheme = data.theme && typeof data.theme === "object" ? { ...data.theme } : {};
    }

    if (draftSections._meta) {
      sectionsMeta = {
        order: draftSections._meta.order || [...HOME_SECTION_ORDER],
        hidden: draftSections._meta.hidden || []
      };
      delete draftSections._meta;
    }

    ctx.state.siteSettingsSections = { ...draftSections };
    ctx.state.siteSettingsTheme = { ...draftTheme };
    dirty = false;
    undoStack = [];
    redoStack = [];
    syncUndoRedoUi();
  }

  function getSectionValues(sectionId) {
    if (sectionId === "theme") {
      const colors = draftTheme.colors || {};
      const typo = draftTheme.typography || {};
      return {
        ink900: colors.ink900 || "#1C1917",
        gold700: colors.gold700 || "#7E6028",
        cream50: colors.cream50 || "#FDFAF5",
        cream100: colors.cream100 || "#FAF5EC",
        headingFont: typo.headingFont || typo.heading || "Cormorant Garamond",
        bodyFont: typo.bodyFont || typo.body || "DM Sans"
      };
    }
    if (sectionId === "nav" || sectionId === "footer") {
      return draftSections[sectionId] || {};
    }
    const block = draftSections[sectionId] || {};
    if (sectionId === "hero" && block.images) {
      return { ...block, images: Array.isArray(block.images) ? block.images.join("\n") : block.images || "" };
    }
    return block;
  }

  function setSectionValue(sectionId, fieldKey, value, recordHistory = true) {
    if (recordHistory) pushHistory();

    if (sectionId === "theme") {
      if (!draftTheme.colors) draftTheme.colors = {};
      if (!draftTheme.typography) draftTheme.typography = {};
      if (["ink900", "gold700", "cream50", "cream100"].includes(fieldKey)) {
        draftTheme.colors[fieldKey] = value;
        bridge?.patchTheme(draftTheme);
      } else if (fieldKey === "headingFont") {
        draftTheme.typography.headingFont = value;
        bridge?.patchTheme(draftTheme);
      } else if (fieldKey === "bodyFont") {
        draftTheme.typography.bodyFont = value;
        bridge?.patchTheme(draftTheme);
      }
      markDirty();
      return;
    }

    if (!draftSections[sectionId]) draftSections[sectionId] = {};
    if (fieldKey === "images" && sectionId === "hero") {
      const urls = String(value)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      draftSections[sectionId].images = urls;
      bridge?.patchHeroImages(urls);
      markDirty();
      return;
    }

    draftSections[sectionId][fieldKey] = value;

    const i18nKey = fieldToI18nKey(sectionId, fieldKey);

    if (i18nKey) {
      bridge?.debouncedPatch(() => bridge.patchI18n(i18nKey, value));
    } else {
      bridge?.debouncedPatch(() => bridge.patchSection(sectionId, fieldKey, value));
    }
    markDirty();
  }

  function matchesSearch(label) {
    if (!sectionSearch.trim()) return true;
    return label.toLowerCase().includes(sectionSearch.trim().toLowerCase());
  }

  function getAdvancedCmsKeys() {
    return (ctx.state.cmsCache || [])
      .filter((r) => r.locale === locale && !STATIC_PAGE_KEYS.has(r.key))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  function renderTreeSectionBtn(s, opts = {}) {
    const hidden = sectionsMeta.hidden?.includes(s.id);
    const selected = s.id === activeSectionId && treeView === "sections" && !activeStaticPageId && !activeCmsKey;
    return `<button type="button" data-tree-section="${s.id}" class="theme-studio-tree-btn ${selected ? "is-selected" : ""} ${hidden ? "is-hidden-section" : ""}">
      ${sectionIconSvg(s.icon)}
      <span class="theme-studio-tree-btn__label">${escapeHtml(s.label)}</span>
      ${opts.showEye ? `<span role="button" tabindex="0" class="theme-studio-eye" data-toggle-hidden="${s.id}" title="Visibilité" aria-label="Visibilité">${eyeIconSvg(hidden)}</span>` : ""}
    </button>`;
  }

  /**
   * Ligne section accueil avec flèches ▲/▼ (layout → sections._meta.order).
   * @param {object} s
   * @param {number} index
   * @param {number} total
   */
  function renderHomeSectionRow(s, index, total) {
    const hidden = sectionsMeta.hidden?.includes(s.id);
    const selected = s.id === activeSectionId && !activeStaticPageId && !activeCmsKey;
    const canUp = index > 0;
    const canDown = index < total - 1;

    return `<div class="theme-studio-tree-row ${selected ? "is-selected" : ""} ${hidden ? "is-hidden-section" : ""}" data-tree-row="${s.id}">
      <button type="button" data-tree-section="${s.id}" class="theme-studio-tree-btn">
        ${sectionIconSvg(s.icon)}
        <span class="theme-studio-tree-btn__label">${escapeHtml(s.label)}</span>
      </button>
      <div class="theme-studio-tree-controls">
        <button type="button" class="theme-studio-order-btn" data-section-move="up" data-section-id="${s.id}" aria-label="Monter ${escapeHtml(s.label)}" ${canUp ? "" : "disabled"}>${orderArrowSvg("up")}</button>
        <button type="button" class="theme-studio-order-btn" data-section-move="down" data-section-id="${s.id}" aria-label="Descendre ${escapeHtml(s.label)}" ${canDown ? "" : "disabled"}>${orderArrowSvg("down")}</button>
        <button type="button" class="theme-studio-eye" data-toggle-hidden="${s.id}" title="Visibilité" aria-label="Visibilité">${eyeIconSvg(hidden)}</button>
      </div>
    </div>`;
  }

  /**
   * Déplace une section accueil dans sections._meta.order (persisté dans site_settings.sections).
   * @param {string} sectionId
   * @param {"up"|"down"} direction
   */
  function moveHomeSection(sectionId, direction) {
    const order = [...(sectionsMeta.order || HOME_SECTION_ORDER)];
    const idx = order.indexOf(sectionId);
    if (idx < 0) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= order.length) return;

    pushHistory();
    [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
    sectionsMeta.order = order;
    bridge?.patchSectionsMeta(sectionsMeta);
    markDirty();

    const tree = document.getElementById("theme-editor-tree");
    const row = tree?.querySelector(`[data-tree-row="${sectionId}"]`);
    row?.classList.add("is-reordering");
    renderTree();
    requestAnimationFrame(() => {
      tree?.querySelector(`[data-tree-row="${sectionId}"]`)?.classList.remove("is-reordering");
    });
  }

  function renderStaticPageRow(page) {
    const selected = activeStaticPageId === page.id;
    return `<button type="button" class="theme-studio-static-btn ${selected ? "is-selected" : ""}" data-static-page="${page.id}">
      ${sectionIconSvg(page.icon || "text")}
      <span class="theme-studio-tree-btn__label">${escapeHtml(page.label)}</span>
    </button>`;
  }

  async function renderStaticPageEditor(pageId) {
    const panel = document.getElementById("theme-editor-props");
    const page = STATIC_PAGES.find((p) => p.id === pageId);
    if (!panel || !page) return;

    panel.innerHTML = `
      <h3 class="theme-studio-inspector__title">${escapeHtml(page.label)}</h3>
      <p class="theme-studio-inspector__hint">Contenu Markdown · enregistré dans cms_content</p>
      <div class="theme-studio-field">
        <label for="static-page-body">Corps de la page</label>
        <textarea id="static-page-body" class="studio-textarea" rows="14" placeholder="Titres (#), listes, paragraphes…"></textarea>
        <p class="studio-help">Clé CMS : <code>${escapeHtml(page.cmsKey)}</code></p>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button type="button" id="static-page-save" class="theme-studio-btn-primary">Enregistrer</button>
        <a href="${escapeHtml(page.href)}" target="_blank" rel="noopener noreferrer" class="theme-studio-btn-ghost" style="display:inline-flex;align-items:center;text-decoration:none">Aperçu ↗</a>
      </div>
    `;

    const { data, error } = await ctx.sb
      .from("cms_content")
      .select("value")
      .eq("key", page.cmsKey)
      .eq("locale", locale)
      .maybeSingle();

    if (error) toast(error.message, "error");

    const ta = document.getElementById("static-page-body");
    if (ta) ta.value = data?.value || "";

    document.getElementById("static-page-save")?.addEventListener("click", async () => {
      const value = document.getElementById("static-page-body")?.value.trim() || "";
      const { error: saveErr } = await ctx.sb.from("cms_content").upsert(
        {
          key: page.cmsKey,
          locale,
          value,
          is_published: true,
          updated_at: new Date().toISOString()
        },
        { onConflict: "key,locale" }
      );
      if (saveErr) return toast(saveErr.message, "error");
      toast("Page enregistrée", "success");
      await refreshCmsKeysTable();
    });
  }

  function selectStaticPage(pageId) {
    activeStaticPageId = pageId;
    activeCmsKey = null;
    activeSectionId = null;
    treeView = "sections";
    renderTree();
    renderStaticPageEditor(pageId);
    bridge?.highlight(null);
  }

  function renderCmsKeyRow(row) {
    const selected = activeCmsKey === row.key;
    return `<button type="button" class="theme-studio-static-btn ${selected ? "is-selected" : ""}" data-cms-key="${escapeHtml(row.key)}">
      ${sectionIconSvg("text")}
      <span class="theme-studio-tree-btn__label">${escapeHtml(row.key)}</span>
    </button>`;
  }

  async function renderCmsKeyEditor(key, { isNew = false } = {}) {
    const panel = document.getElementById("theme-editor-props");
    if (!panel) return;

    let row = !isNew ? getAdvancedCmsKeys().find((r) => r.key === key) : null;
    if (!isNew && key) {
      const { data, error } = await ctx.sb
        .from("cms_content")
        .select("value,is_published")
        .eq("key", key)
        .eq("locale", locale)
        .maybeSingle();
      if (error) toast(error.message, "error");
      else if (data) row = { key, ...data };
    }

    panel.innerHTML = `
      <h3 class="theme-studio-inspector__title">${isNew ? "Nouvelle clé CMS" : escapeHtml(key)}</h3>
      <p class="theme-studio-inspector__hint">Textes avancés · enregistré dans cms_content (${escapeHtml(locale.toUpperCase())})</p>
      <div class="theme-studio-field">
        <label for="cms-key-edit">Clé</label>
        <input id="cms-key-edit" class="studio-input" ${isNew ? "" : "readonly"} value="${escapeHtml(key || "")}" placeholder="ex. legal.notice">
      </div>
      <div class="theme-studio-field">
        <label for="cms-value-edit">Contenu</label>
        <textarea id="cms-value-edit" class="studio-textarea" rows="12" placeholder="Texte ou Markdown…">${escapeHtml(row?.value || "")}</textarea>
      </div>
      <label class="flex items-center gap-2 text-[12px] text-stone-600 mb-3">
        <input id="cms-published-edit" type="checkbox" class="rounded" ${row?.is_published !== false ? "checked" : ""}>
        Publié sur la boutique
      </label>
      <div class="flex flex-wrap gap-2">
        <button type="button" id="cms-key-save" class="theme-studio-btn-primary">Enregistrer</button>
        ${isNew ? "" : `<button type="button" id="cms-key-delete" class="theme-studio-btn-ghost">Supprimer</button>`}
      </div>
    `;

    document.getElementById("cms-key-save")?.addEventListener("click", async () => {
      const nextKey = document.getElementById("cms-key-edit")?.value.trim();
      const value = document.getElementById("cms-value-edit")?.value.trim() || "";
      const isPublished = document.getElementById("cms-published-edit")?.checked ?? true;
      if (!nextKey) return toast("Clé requise", "error");

      const { error } = await ctx.sb.from("cms_content").upsert(
        {
          key: nextKey,
          locale,
          value,
          is_published: isPublished,
          updated_at: new Date().toISOString()
        },
        { onConflict: "key,locale" }
      );
      if (error) return toast(error.message, "error");
      toast("Clé CMS enregistrée", "success");
      await refreshCmsKeysTable();
      selectCmsKey(nextKey);
      ctx.renderOnboarding?.();
    });

    document.getElementById("cms-key-delete")?.addEventListener("click", async () => {
      if (!key || !confirm(`Supprimer la clé « ${key} » (${locale}) ?`)) return;
      const { error } = await ctx.sb.from("cms_content").delete().eq("key", key).eq("locale", locale);
      if (error) return toast(error.message, "error");
      toast("Clé supprimée", "success");
      await refreshCmsKeysTable();
      activeCmsKey = null;
      selectSection(activeSectionId || "hero");
      ctx.renderOnboarding?.();
    });
  }

  function selectCmsKey(key, opts = {}) {
    activeStaticPageId = null;
    activeSectionId = null;
    activeCmsKey = opts.isNew ? "__new__" : key;
    treeView = "sections";
    renderTree();
    renderCmsKeyEditor(key, opts);
    bridge?.highlight(null);
  }

  function renderBlocksView(def) {
    const tree = document.getElementById("theme-editor-tree");
    const breadcrumb = document.getElementById("theme-studio-tree-breadcrumb");
    if (!tree || !def) return;

    breadcrumb?.classList.remove("hidden");
    if (breadcrumb) {
      breadcrumb.innerHTML = `<button type="button" id="theme-tree-back-sections">← ${escapeHtml(def.label)}</button>`;
      breadcrumb.querySelector("#theme-tree-back-sections")?.addEventListener("click", () => {
        treeView = "sections";
        activeFieldKey = null;
        renderTree();
      });
    }

    const groups = getFieldsGrouped(def);
    let html = "";
    for (const g of groups) {
      for (const f of g.fields) {
        const selected = activeFieldKey === f.key;
        html += `<button type="button" class="theme-studio-block-btn ${selected ? "is-selected" : ""}" data-tree-block="${f.key}">
          <span>${escapeHtml(f.label)}</span>
        </button>`;
      }
    }
    tree.innerHTML = html || `<p class="theme-studio-inspector__hint px-2">Aucun bloc pour cette section.</p>`;

    tree.querySelectorAll("[data-tree-block]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFieldKey = btn.dataset.treeBlock;
        renderTree();
        highlightInspectorField(activeFieldKey);
      });
    });
  }

  function renderTree() {
    const tree = document.getElementById("theme-editor-tree");
    if (!tree) return;

    const def = getSectionById(activeSectionId);
    if (treeView === "blocks" && def && !activeStaticPageId && !activeCmsKey) {
      renderBlocksView(def);
      return;
    }

    document.getElementById("theme-studio-tree-breadcrumb")?.classList.add("hidden");

    const pageSections = listSectionsForPage(activePage);
    const globalSections = listGlobalSections();
    const order = sectionsMeta.order || HOME_SECTION_ORDER;

    const sorted = [...pageSections]
      .filter((s) => !s.global && HOME_SECTION_ORDER.includes(s.id))
      .sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });

    let html = `<p class="theme-studio-section-label">Sections de l'Accueil</p>`;
    if (activePage === "home") {
      const visible = sorted.filter((s) => matchesSearch(s.label));
      html += visible
        .map((s) => renderHomeSectionRow(s, order.indexOf(s.id), order.length))
        .join("");
      if (!visible.length) {
        html += `<p class="theme-studio-inspector__hint px-2">Aucune section.</p>`;
      }
    } else {
      html += pageSections
        .filter((s) => matchesSearch(s.label))
        .map((s) => renderTreeSectionBtn(s))
        .join("");
    }

    html += `<p class="theme-studio-section-label">Pages Statiques &amp; Légales</p>`;
    html += STATIC_PAGES.filter((p) => matchesSearch(p.label))
      .map((p) => renderStaticPageRow(p))
      .join("");

    html += `<p class="theme-studio-section-label">Textes avancés (clés CMS)</p>`;
    const advancedKeys = getAdvancedCmsKeys().filter((r) => matchesSearch(r.key));
    html += advancedKeys.map((r) => renderCmsKeyRow(r)).join("");
    if (!advancedKeys.length && !sectionSearch.trim()) {
      html += `<p class="theme-studio-inspector__hint px-2">Clés personnalisées hors éditeur visuel.</p>`;
    }
    html += `<button type="button" id="cms-tree-new-key" class="theme-studio-tree-add-btn">+ Nouvelle clé CMS</button>`;

    html += `<p class="theme-studio-section-label">Global</p>`;
    html += globalSections
      .filter((s) => matchesSearch(s.label))
      .map((s) => renderTreeSectionBtn(s))
      .join("");

    html += `<p class="theme-studio-section-label">Thème</p>`;
    html += renderTreeSectionBtn(
      { id: "theme", label: THEME_MANIFEST.themeSettings.label, icon: THEME_MANIFEST.themeSettings.icon },
      {}
    );

    tree.innerHTML = html;

    tree.querySelectorAll("[data-tree-section]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest("[data-toggle-hidden]") || e.target.closest("[data-section-move]")) return;
        activeStaticPageId = null;
        activeCmsKey = null;
        const id = btn.dataset.treeSection;
        const sectionDef = getSectionById(id);
        const groups = getFieldsGrouped(sectionDef);
        const fieldCount = groups.reduce((n, g) => n + g.fields.length, 0);
        activeSectionId = id;
        if (fieldCount > 1) {
          treeView = "blocks";
          activeFieldKey = null;
        } else {
          treeView = "sections";
        }
        selectSection(id, { skipTreeViewReset: true });
      });
    });

    tree.querySelectorAll("[data-static-page]").forEach((btn) => {
      btn.addEventListener("click", () => selectStaticPage(btn.dataset.staticPage));
    });

    tree.querySelectorAll("[data-cms-key]").forEach((btn) => {
      btn.addEventListener("click", () => selectCmsKey(btn.dataset.cmsKey));
    });

    document.getElementById("cms-tree-new-key")?.addEventListener("click", () => selectCmsKey(null, { isNew: true }));

    tree.querySelectorAll("[data-section-move]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        moveHomeSection(btn.dataset.sectionId, btn.dataset.sectionMove);
      });
    });

    tree.querySelectorAll("[data-toggle-hidden]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggleHidden;
        pushHistory();
        const hidden = sectionsMeta.hidden || [];
        const idx = hidden.indexOf(id);
        if (idx >= 0) hidden.splice(idx, 1);
        else hidden.push(id);
        sectionsMeta.hidden = hidden;
        bridge?.patchSectionsMeta(sectionsMeta);
        markDirty();
        renderTree();
      });
    });
  }

  function selectSection(sectionId, opts = {}) {
    activeStaticPageId = null;
    activeCmsKey = null;
    activeSectionId = sectionId;
    const def = getSectionById(sectionId);
    if (!opts.skipTreeViewReset && treeView === "blocks") {
      /* keep blocks view */
    }
    renderTree();
    renderProperties(def);
    if (def?.selector) bridge?.highlight(def.selector);
    const defPage = def?.page;
    if (defPage && defPage !== activePage) {
      activePage = defPage;
      const sel = document.getElementById("theme-editor-page-select");
      if (sel) sel.value = activePage;
      bridge?.navigate(activePage);
    }
  }

  function renderProperties(def) {
    const panel = document.getElementById("theme-editor-props");
    if (!panel || !def) return;

    const values = getSectionValues(def.id);
    const groups = getFieldsGrouped(def);

    let fieldsHtml = "";
    for (const g of groups) {
      const inner = (g.fields || []).map((f) => renderFieldHtml(f, values[f.key])).join("");
      if (groups.length === 1 && g.id === "content") {
        fieldsHtml += inner;
      } else {
        fieldsHtml += `<details class="studio-accordion" open>
          <summary>${escapeHtml(g.label)}</summary>
          <div class="theme-studio-accordion__body">${inner}</div>
        </details>`;
      }
    }

    panel.innerHTML = `
      <h3 class="theme-studio-inspector__title">${escapeHtml(def.label)}</h3>
      <p class="theme-studio-inspector__hint">Modifications en direct dans l'aperçu</p>
      ${fieldsHtml}
      ${def.id === "hero" ? `<div class="theme-studio-field"><label>Upload images hero</label><input type="file" id="hero-upload-input" accept="image/*" multiple class="text-[12px]"><p id="hero-upload-status" class="studio-help hidden"></p></div>` : ""}
      ${def.id === "promoPopup" ? `<button type="button" id="theme-preview-promo" class="theme-studio-btn-ghost" style="margin-bottom:0.75rem">Aperçu popup dans l'iframe</button>` : ""}
    `;

    bindInspectorInputs(panel, def, (key, val) => setSectionValue(def.id, key, val));

    document.getElementById("theme-preview-promo")?.addEventListener("click", () => {
      const iframe = document.getElementById("theme-editor-preview");
      try {
        const o = new URL(iframe.src, window.location.href).origin;
        iframe.contentWindow?.postMessage({ source: "ld-admin", type: "SHOW_PROMO" }, o);
      } catch (_) {}
    });

    const heroInput = document.getElementById("hero-upload-input");
    heroInput?.addEventListener("change", () => uploadHeroImages(heroInput.files));

    if (activeFieldKey) highlightInspectorField(activeFieldKey);
  }

  async function uploadHeroImages(fileList) {
    const status = document.getElementById("hero-upload-status");
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    status?.classList.remove("hidden");
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (status) status.textContent = `Envoi ${i + 1}/${files.length}…`;
      const path = `site/hero/${crypto.randomUUID()}-${sanitizeMediaFilename(file.name)}`;
      const { error } = await ctx.sb.storage.from(STORAGE_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg"
      });
      if (error) {
        toast(error.message, "error");
        continue;
      }
      const { data } = ctx.sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    if (urls.length) {
      pushHistory();
      const existing = getSectionValues("hero").images || "";
      const lines = String(existing)
        .split(/\r?\n/)
        .filter(Boolean);
      const merged = [...lines, ...urls].join("\n");
      setSectionValue("hero", "images", merged, false);
      const ta = document.querySelector('[data-prop-field="images"]');
      if (ta) ta.value = merged;
      toast(`${urls.length} image(s) ajoutée(s)`, "success");
    }
    if (status) {
      status.textContent = "Terminé.";
      setTimeout(() => status.classList.add("hidden"), 3000);
    }
  }

  function initPreview() {
    const iframe = document.getElementById("theme-editor-preview");
    if (!iframe) return;
    if (bridge) bridge.destroy();
    bridge = createEditorBridge(iframe);
    bridge.onSelected = ({ sectionId }) => {
      if (sectionId) {
        treeView = "sections";
        selectSection(sectionId);
      }
    };
    iframe.src = `../index/index.html?preview=1&editor=1&_=${Date.now()}`;
    bridge.whenReady(() => {
      bridge.patchSectionsMeta(sectionsMeta);
      if (Object.keys(draftTheme).length) bridge.patchTheme(draftTheme);
      const heroImgs = draftSections.hero?.images;
      if (heroImgs?.length) bridge.patchHeroImages(heroImgs);
      bridge.setPreviewDevice(previewDevice);
      selectSection(activeSectionId);
    });
  }

  function setDevice(device) {
    previewDevice = device;
    setPreviewDeviceUi(device);
    bridge?.setPreviewDevice(device);
  }

  async function saveDraft() {
    const payload = {
      ...draftSections,
      _meta: sectionsMeta
    };
    const { error } = await ctx.sb.from("site_settings").upsert(
      {
        id: DRAFT_ID,
        locale,
        sections: payload,
        theme: draftTheme,
        is_published: false,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id,locale" }
    );
    if (error) return toast(error.message, "error");
    toast("Brouillon enregistré", "success");
    clearDirty();
    undoStack = [];
    redoStack = [];
    syncUndoRedoUi();
    ctx.renderOnboarding?.();
  }

  async function publishSite() {
    if (dirty) await saveDraft();
    const payload = {
      ...draftSections,
      _meta: sectionsMeta
    };
    const row = {
      id: PUBLISHED_ID,
      locale,
      sections: payload,
      theme: draftTheme,
      is_published: true,
      updated_at: new Date().toISOString()
    };
    const { error } = await ctx.sb.from("site_settings").upsert(row, { onConflict: "id,locale" });
    if (error) return toast(error.message, "error");
    toast("Boutique publiée", "success");
    ctx.state.siteSettingsPublished = true;
    ctx.renderOnboarding?.();
    updatePublishBadge();
  }

  async function discardDraft() {
    await loadDraft();
    initPreview();
    treeView = "sections";
    renderTree();
    selectSection(activeSectionId);
    clearDirty();
    toast("Modifications annulées", "success");
  }

  function renderEditorChrome() {
    showThemeStudio(true);
    setStickyBar({ visible: false });

    if (ctx.state.pendingCmsKey) {
      const pending = ctx.state.pendingCmsKey;
      ctx.state.pendingCmsKey = null;
      const staticPage = STATIC_PAGES.find((p) => p.cmsKey === pending);
      if (staticPage) selectStaticPage(staticPage.id);
      else selectCmsKey(pending);
    } else if (activeCmsKey === "__new__") {
      selectCmsKey(null, { isNew: true });
    } else if (activeCmsKey) {
      selectCmsKey(activeCmsKey);
    } else if (activeStaticPageId) {
      selectStaticPage(activeStaticPageId);
    } else {
      selectSection(activeSectionId);
    }
    initPreview();
    clearDirty();
    setPreviewDeviceUi(previewDevice);
    updatePublishBadge();
  }

  function hideEditor() {
    showThemeStudio(false);
    if (bridge) {
      bridge.destroy();
      bridge = null;
    }
    setStickyBar({ visible: false });
    treeView = "sections";
    activeCmsKey = null;
  }

  function isEditorRoute(route) {
    return route?.tab === "cms";
  }

  async function refresh(route) {
    if (!isEditorRoute(route)) {
      hideEditor();
      return;
    }
    await loadDraft();
    await refreshCmsKeysTable();
    renderEditorChrome();
    await updatePublishBadge();
  }

  async function updatePublishBadge() {
    const { data: pub } = await ctx.sb
      .from("site_settings")
      .select("updated_at")
      .eq("id", PUBLISHED_ID)
      .eq("locale", locale)
      .maybeSingle();
    const { data: dr } = await ctx.sb
      .from("site_settings")
      .select("updated_at")
      .eq("id", DRAFT_ID)
      .eq("locale", locale)
      .maybeSingle();
    const hasDraft = dr && pub && dr.updated_at !== pub.updated_at;
    setDraftBadge(hasDraft, dirty);
  }

  async function refreshCmsKeysTable() {
    const { data: cmsRows, error } = await ctx.sb
      .from("cms_content")
      .select("id,key,locale,value,is_published")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) console.warn(error);
    ctx.state.cmsCache = cmsRows || [];
  }

  function bindEvents() {
    initThemeStudioChrome();

    document.getElementById("theme-editor-publish")?.addEventListener("click", publishSite);
    document.getElementById("theme-studio-save")?.addEventListener("click", saveDraft);
    document.getElementById("theme-studio-discard")?.addEventListener("click", () => {
      if (!dirty) return;
      if (!confirm("Annuler toutes les modifications non enregistrées ?")) return;
      discardDraft();
    });
    document.getElementById("theme-studio-undo")?.addEventListener("click", undo);
    document.getElementById("theme-studio-redo")?.addEventListener("click", redo);
    document.getElementById("theme-editor-page-select")?.addEventListener("change", (e) => {
      activePage = e.target.value;
      treeView = "sections";
      activeCmsKey = null;
      activeStaticPageId = null;
      const sections = listSectionsForPage(activePage);
      if (sections[0]) selectSection(sections[0].id);
      bridge?.navigate(activePage);
      renderTree();
    });
    document.getElementById("theme-editor-locale")?.addEventListener("change", async (e) => {
      locale = e.target.value;
      await loadDraft();
      await refreshCmsKeysTable();
      initPreview();
      treeView = "sections";
      activeCmsKey = null;
      activeStaticPageId = null;
      renderTree();
      selectSection(activeSectionId);
      updatePublishBadge();
    });
    document.querySelectorAll(".theme-studio-segmented button").forEach((btn) => {
      btn.addEventListener("click", () => setDevice(btn.dataset.device || "desktop"));
    });
    document.getElementById("theme-editor-refresh")?.addEventListener("click", initPreview);
    document.getElementById("theme-section-search")?.addEventListener("input", (e) => {
      sectionSearch = e.target.value;
      if (sectionSearch.trim()) treeView = "sections";
      renderTree();
    });
  }

  return {
    refresh,
    bindEvents,
    loadDraft,
    isEditorRoute,
    hideEditor,
    publishSite,
    get locale() {
      return locale;
    }
  };
}

/** Piliers catalogue — alignés sur data/copywriting.json */
export const PRODUCT_PILLARS = [
  { id: "silhouettes", label: "Les Silhouettes", category: "Les Silhouettes" },
  { id: "signatures", label: "Les Signatures Olfactives", category: "Les Signatures Olfactives" },
  { id: "finitions", label: "Les Finitions", category: "Les Finitions" },
];

/**
 * Insère un produit + variante par défaut + stock initial via Supabase.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {object} payload
 * @returns {Promise<{ id: string }>}
 */
export async function insertProductWithInventory(sb, payload) {
  const { data: product, error: pErr } = await sb
    .from("products")
    .insert({
      name: payload.name,
      slug: payload.slug,
      category: payload.category,
      description: payload.description || "",
      image_urls: payload.image_urls || [],
      active: payload.active !== false,
      updated_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (pErr) throw pErr;

  const sku = `LD-${payload.slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || product.id.slice(0, 8)}`;
  const { data: variant, error: vErr } = await sb
    .from("product_variants")
    .insert({
      product_id: product.id,
      sku,
      size: "Unique",
      color: "Standard",
      price_cents: payload.price_cents,
      low_stock_threshold: 3,
      active: true,
      updated_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (vErr) throw vErr;

  const { error: iErr } = await sb.from("inventory").upsert({
    variant_id: variant.id,
    on_hand: Math.max(0, payload.stock || 0),
    updated_at: new Date().toISOString()
  });

  if (iErr) throw iErr;

  return product;
}

/**
 * Désactive un produit (soft delete).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} productId
 */
export async function deactivateProductRecord(sb, productId) {
  const { error } = await sb
    .from("products")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw error;
}

/**
 * Lie le formulaire produit admin à Supabase (insert / toast).
 * @param {{ sb: import('@supabase/supabase-js').SupabaseClient, onSaved?: () => Promise<void> }} opts
 */
export function bindProductAdminForm(opts) {
  const previewWrap = document.getElementById("pf-image-preview-wrap");
  const previewImg = document.getElementById("pf-image-preview");
  const urlInput = document.getElementById("pf-image-url");

  function updatePreview() {
    const url = (urlInput?.value || "").trim();
    if (!previewWrap || !previewImg) return;
    if (!url) {
      previewWrap.classList.add("hidden");
      previewImg.removeAttribute("src");
      return;
    }
    previewWrap.classList.remove("hidden");
    previewImg.src = url;
    previewImg.onerror = () => previewWrap.classList.add("hidden");
  }

  urlInput?.addEventListener("input", updatePreview);

  document.getElementById("product-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("pf-id")?.value;
    if (id) return;

    const name = document.getElementById("pf-name")?.value.trim();
    const category = document.getElementById("pf-category")?.value.trim();
    const priceCad = Number(document.getElementById("pf-price")?.value);
    const stock = Number(document.getElementById("pf-stock")?.value) || 0;
    let slug = document.getElementById("pf-slug")?.value.trim();

    if (!name || !category || !(priceCad > 0)) {
      toast("Nom, catégorie et prix valides requis", "error");
      return;
    }

    if (!slug) {
      slug = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      document.getElementById("pf-slug").value = slug;
    }

    const primaryUrl = (urlInput?.value || "").trim();
    const extraUrls = (document.getElementById("pf-image-urls")?.value || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const image_urls = [...new Set([primaryUrl, ...extraUrls].filter(Boolean))];

    const submitBtn = document.getElementById("product-form-submit");
    submitBtn?.classList.add("is-loading");

    try {
      const { data: dup } = await opts.sb.from("products").select("id").eq("slug", slug).maybeSingle();
      if (dup) {
        toast("Ce slug est déjà utilisé", "error");
        return;
      }

      await insertProductWithInventory(opts.sb, {
        name,
        slug,
        category,
        description: document.getElementById("pf-description")?.value.trim() || "",
        price_cents: Math.round(priceCad * 100),
        stock,
        image_urls,
        active: document.getElementById("pf-active")?.checked !== false
      });

      toast("Produit ajouté avec succès", "success");
      document.getElementById("pf-id").value = "";
      e.target.reset();
      updatePreview();
      await opts.onSaved?.();
    } catch (err) {
      toast(err.message || "Erreur lors de l'insertion", "error");
    } finally {
      submitBtn?.classList.remove("is-loading");
    }
  });
}
