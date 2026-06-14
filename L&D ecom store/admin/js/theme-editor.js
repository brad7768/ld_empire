import { escapeHtml, emptyState, toast, setStickyBar } from "./ui.js";
import { createEditorBridge } from "./editor-bridge.js";
import {
  THEME_MANIFEST,
  HOME_SECTION_ORDER,
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
  updateUndoRedoButtons
} from "./theme-studio-ui.js";

const STORAGE_BUCKET = "product-media";
const DRAFT_ID = "draft";
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

  function renderTreeSectionBtn(s, opts = {}) {
    const hidden = sectionsMeta.hidden?.includes(s.id);
    const selected = s.id === activeSectionId && treeView === "sections";
    const draggable = opts.draggable ? ' draggable="true"' : "";
    return `<button type="button" data-tree-section="${s.id}" class="theme-studio-tree-btn ${selected ? "is-selected" : ""} ${hidden ? "is-hidden-section" : ""}"${draggable}>
      ${sectionIconSvg(s.icon)}
      <span class="theme-studio-tree-btn__label">${escapeHtml(s.label)}</span>
      ${opts.showEye ? `<span role="button" tabindex="0" class="theme-studio-eye" data-toggle-hidden="${s.id}" title="Visibilité" aria-label="Visibilité">${eyeIconSvg(hidden)}</span>` : ""}
    </button>`;
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

  function bindTreeDragDrop(tree) {
    let dragId = null;
    tree.querySelectorAll("[data-tree-section][draggable]").forEach((btn) => {
      btn.addEventListener("dragstart", (e) => {
        dragId = btn.dataset.treeSection;
        btn.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragId);
      });
      btn.addEventListener("dragend", () => {
        btn.classList.remove("is-dragging");
        tree.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
        dragId = null;
      });
      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (btn.dataset.treeSection !== dragId) btn.classList.add("is-drag-over");
      });
      btn.addEventListener("dragleave", () => btn.classList.remove("is-drag-over"));
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        btn.classList.remove("is-drag-over");
        const targetId = btn.dataset.treeSection;
        if (!dragId || dragId === targetId) return;
        const order = [...(sectionsMeta.order || HOME_SECTION_ORDER)];
        const from = order.indexOf(dragId);
        const to = order.indexOf(targetId);
        if (from < 0 || to < 0) return;
        pushHistory();
        order.splice(from, 1);
        order.splice(to, 0, dragId);
        sectionsMeta.order = order;
        bridge?.patchSectionsMeta(sectionsMeta);
        markDirty();
        renderTree();
      });
    });
  }

  function renderTree() {
    const tree = document.getElementById("theme-editor-tree");
    if (!tree) return;

    const def = getSectionById(activeSectionId);
    if (treeView === "blocks" && def) {
      renderBlocksView(def);
      return;
    }

    document.getElementById("theme-studio-tree-breadcrumb")?.classList.add("hidden");

    const pageSections = listSectionsForPage(activePage);
    const globalSections = listGlobalSections();
    const order = sectionsMeta.order || HOME_SECTION_ORDER;

    const sorted = [...pageSections].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    let html = `<p class="theme-studio-section-label">Page</p>`;
    html += sorted
      .filter((s) => matchesSearch(s.label))
      .map((s) => renderTreeSectionBtn(s, { showEye: true, draggable: activePage === "home" && HOME_SECTION_ORDER.includes(s.id) }))
      .join("");

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

    if (activePage === "home") {
      const promo = pageSections.find((x) => x.id === "promoPopup");
      if (promo && matchesSearch(promo.label) && !sorted.some((s) => s.id === "promoPopup")) {
        html += renderTreeSectionBtn(promo);
      }
    }

    tree.innerHTML = html;

    tree.querySelectorAll("[data-tree-section]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest("[data-toggle-hidden]")) return;
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

    bindTreeDragDrop(tree);
  }

  function selectSection(sectionId, opts = {}) {
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
      ${activePage === "home" && HOME_SECTION_ORDER.includes(def.id) ? `<div class="flex gap-2 mt-4 pt-4" style="border-top:1px solid var(--studio-border)">
        <button type="button" data-section-move="up" class="theme-studio-btn-ghost" style="flex:1">Monter</button>
        <button type="button" data-section-move="down" class="theme-studio-btn-ghost" style="flex:1">Descendre</button>
      </div>` : ""}
    `;

    bindInspectorInputs(panel, def, (key, val) => setSectionValue(def.id, key, val));

    document.getElementById("theme-preview-promo")?.addEventListener("click", () => {
      const iframe = document.getElementById("theme-editor-preview");
      try {
        const o = new URL(iframe.src, window.location.href).origin;
        iframe.contentWindow?.postMessage({ source: "ld-admin", type: "SHOW_PROMO" }, o);
      } catch (_) {}
    });

    panel.querySelectorAll("[data-section-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const order = [...(sectionsMeta.order || HOME_SECTION_ORDER)];
        const idx = order.indexOf(def.id);
        if (idx < 0) return;
        pushHistory();
        const dir = btn.dataset.sectionMove === "up" ? -1 : 1;
        const ni = idx + dir;
        if (ni < 0 || ni >= order.length) return;
        [order[idx], order[ni]] = [order[ni], order[idx]];
        sectionsMeta.order = order;
        bridge?.patchSectionsMeta(sectionsMeta);
        markDirty();
        renderTree();
      });
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
    document.getElementById("cms-classic-view")?.classList.add("hidden");
    showThemeStudio(true);
    setStickyBar({ visible: false });

    renderTree();
    selectSection(activeSectionId);
    initPreview();
    clearDirty();
    setPreviewDeviceUi(previewDevice);
    updatePublishBadge();
  }

  function hideEditor() {
    showThemeStudio(false);
    document.getElementById("cms-classic-view")?.classList.remove("hidden");
    if (bridge) {
      bridge.destroy();
      bridge = null;
    }
    setStickyBar({ visible: false });
    treeView = "sections";
  }

  function isEditorRoute(route) {
    return route?.tab === "cms" && route?.sub === "editor";
  }

  async function refresh(route) {
    const inEditor = isEditorRoute(route);
    if (inEditor) {
      await loadDraft();
      renderEditorChrome();
      await updatePublishBadge();
    } else {
      hideEditor();
      await refreshCmsKeysTable();
    }
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
    const { data: cmsRows } = await ctx.sb
      .from("cms_content")
      .select("id,key,locale,value,is_published")
      .order("updated_at", { ascending: false })
      .limit(200);
    ctx.state.cmsCache = cmsRows || [];
    const tbody = document.getElementById("cms-tbody");
    if (!tbody) return;
    if (!ctx.state.cmsCache.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-6">${emptyState({
        title: "Aucune clé CMS",
        body: "Textes légaux ou pages statiques hors éditeur visuel."
      })}</td></tr>`;
    } else {
      tbody.innerHTML = ctx.state.cmsCache
        .map(
          (r) => `
        <tr class="border-t border-stone-100">
          <td class="px-4 py-3 font-medium text-[13px]">${escapeHtml(r.key)}</td>
          <td class="px-4 py-3 text-[12px]">${escapeHtml(r.locale)}</td>
          <td class="px-4 py-3 text-[12px] text-stone-600 max-w-md truncate">${escapeHtml((r.value || "").slice(0, 80))}</td>
          <td class="px-4 py-3">${r.is_published ? "Oui" : "Non"}</td>
        </tr>`
        )
        .join("");
    }
  }

  function bindEvents() {
    initThemeStudioChrome();

    document.getElementById("cms-open-editor")?.addEventListener("click", () => {
      location.hash = "#/cms/editor";
    });
    document.getElementById("theme-studio-back")?.addEventListener("click", () => {
      if (dirty && !confirm("Quitter sans enregistrer le brouillon ?")) return;
      location.hash = "#/cms";
    });
    document.getElementById("theme-editor-publish")?.addEventListener("click", publishSite);
    document.getElementById("theme-studio-save")?.addEventListener("click", saveDraft);
    document.getElementById("theme-studio-discard")?.addEventListener("click", () => {
      if (!dirty) return;
      if (!confirm("Annuler toutes les modifications non enregistrées ?")) return;
      discardDraft();
    });
    document.getElementById("theme-studio-undo")?.addEventListener("click", undo);
    document.getElementById("theme-studio-redo")?.addEventListener("click", redo);
    document.getElementById("theme-studio-link-cms")?.addEventListener("click", () => {
      if (dirty && !confirm("Quitter l'éditeur sans enregistrer ?")) return;
      location.hash = "#/cms";
    });
    document.getElementById("theme-editor-page-select")?.addEventListener("change", (e) => {
      activePage = e.target.value;
      treeView = "sections";
      const sections = listSectionsForPage(activePage);
      if (sections[0]) selectSection(sections[0].id);
      bridge?.navigate(activePage);
      renderTree();
    });
    document.getElementById("theme-editor-locale")?.addEventListener("change", async (e) => {
      locale = e.target.value;
      await loadDraft();
      initPreview();
      treeView = "sections";
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
      if (treeView === "sections") renderTree();
    });
    document.getElementById("cms-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        key: document.getElementById("cms-key").value.trim(),
        locale: document.getElementById("cms-locale").value,
        value: document.getElementById("cms-value").value.trim(),
        is_published: document.getElementById("cms-published").checked
      };
      const { error } = await ctx.sb.from("cms_content").upsert(payload, { onConflict: "key,locale" });
      if (error) return toast(error.message, "error");
      e.target.reset();
      document.getElementById("cms-published").checked = true;
      toast("Clé CMS enregistrée", "success");
      await refreshCmsKeysTable();
      ctx.renderOnboarding?.();
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
