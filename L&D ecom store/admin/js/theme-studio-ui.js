import { escapeHtml } from "./ui.js";

const LS_LEFT = "ld-studio-panel-left";
const LS_RIGHT = "ld-studio-panel-right";

const SECTION_ICON_SVGS = {
  image: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="16" height="12" rx="1"/><circle cx="7" cy="9" r="1.5"/><path d="M2 14l4-4 3 3 4-5 5 6"/></svg>',
  text: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5h12M4 10h8M4 15h10"/></svg>',
  grid: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>',
  social: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="3"/><circle cx="10" cy="10" r="3"/><circle cx="14.5" cy="5.5" r="0.75" fill="currentColor"/></svg>',
  quote: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 8c0-2 1.5-3 3-3v2c-1 0-1.5.5-1.5 1.5H5zm8 0c0-2 1.5-3 3-3v2c-1 0-1.5.5-1.5 1.5H13z"/></svg>',
  faq: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><path d="M10 7v1M10 13h.01"/></svg>',
  mail: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="16" height="12" rx="1"/><path d="M2 6l8 5 8-5"/></svg>',
  popup: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="14" height="10" rx="1"/><path d="M7 5V4a3 3 0 016 0v1"/></svg>',
  nav: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h14M3 10h14M3 14h10"/></svg>',
  footer: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="12" width="16" height="5" rx="1"/><path d="M5 12V8h10v4"/></svg>',
  catalog: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z"/></svg>',
  palette: '<svg class="theme-studio-tree-btn__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="12" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/></svg>'
};

export function sectionIconSvg(iconKey) {
  return SECTION_ICON_SVGS[iconKey] || SECTION_ICON_SVGS.text;
}

export function eyeIconSvg(hidden) {
  if (hidden) {
    return `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 10s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="10" cy="10" r="2"/><line x1="4" y1="16" x2="16" y2="4"/></svg>`;
  }
  return `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 10s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="10" cy="10" r="2"/></svg>`;
}

export function getFieldsGrouped(def) {
  if (!def) return [];
  if (def.groups?.length) {
    return def.groups.map((g) => ({ id: g.id, label: g.label, fields: g.fields || [] }));
  }
  const fields = def.fields || [];
  if (!fields.length) return [];
  return [{ id: "content", label: "Contenu", fields }];
}

export function renderFieldHtml(f, v) {
  const help = f.help ? `<p class="studio-help">${escapeHtml(f.help)}</p>` : "";
  if (f.type === "checkbox") {
    return `<div class="theme-studio-field">
      <label class="theme-studio-toggle">
        <input type="checkbox" data-prop-field="${escapeHtml(f.key)}" ${v ? "checked" : ""}>
        <span class="theme-studio-toggle__track" aria-hidden="true"></span>
        <span>${escapeHtml(f.label)}</span>
      </label>
      ${help}
    </div>`;
  }
  if (f.type === "textarea" || f.type === "imageList") {
    const hint =
      f.type === "imageList"
        ? '<p class="studio-help">Une URL par ligne. Utilisez le bouton upload ci-dessous.</p>'
        : "";
    return `<div class="theme-studio-field">
      <label>${escapeHtml(f.label)}</label>
      <textarea data-prop-field="${escapeHtml(f.key)}" class="studio-textarea">${escapeHtml(String(v || ""))}</textarea>
      ${hint}
      ${help}
    </div>`;
  }
  if (f.type === "color") {
    const hex = v || f.default || "#000000";
    return `<div class="theme-studio-field">
      <label>${escapeHtml(f.label)}</label>
      <div class="theme-studio-color-row">
        <input type="color" class="theme-studio-color-swatch" data-prop-color-swatch="${escapeHtml(f.key)}" value="${escapeHtml(hex)}">
        <input type="text" class="studio-input theme-studio-color-hex" data-prop-field="${escapeHtml(f.key)}" value="${escapeHtml(hex)}" maxlength="7" pattern="#?[0-9A-Fa-f]{6}">
      </div>
      ${help}
    </div>`;
  }
  if (f.type === "font") {
    const fonts = ["Cormorant Garamond", "DM Sans", "Georgia", "system-ui"];
    return `<div class="theme-studio-field">
      <label>${escapeHtml(f.label)}</label>
      <select data-prop-field="${escapeHtml(f.key)}" class="studio-select">
        ${fonts.map((fn) => `<option value="${escapeHtml(fn)}" ${v === fn ? "selected" : ""}>${escapeHtml(fn)}</option>`).join("")}
      </select>
      ${help}
    </div>`;
  }
  return `<div class="theme-studio-field">
    <label>${escapeHtml(f.label)}</label>
    <input data-prop-field="${escapeHtml(f.key)}" class="studio-input" value="${escapeHtml(String(v ?? ""))}">
    ${help}
  </div>`;
}

export function bindInspectorInputs(panel, def, onChange) {
  panel.querySelectorAll("[data-prop-field]").forEach((el) => {
    const ev = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(ev, () => {
      const key = el.dataset.propField;
      let val = el.type === "checkbox" ? el.checked : el.value;
      if (el.classList.contains("theme-studio-color-hex")) {
        val = val.startsWith("#") ? val : `#${val}`;
      }
      onChange(key, val);
    });
  });
  panel.querySelectorAll("[data-prop-color-swatch]").forEach((sw) => {
    sw.addEventListener("input", () => {
      const key = sw.dataset.propColorSwatch;
      const hex = sw.value;
      const hexInput = panel.querySelector(`[data-prop-field="${key}"].theme-studio-color-hex`);
      if (hexInput) hexInput.value = hex;
      onChange(key, hex);
    });
  });
}

export function highlightInspectorField(fieldKey) {
  const el = document.querySelector(`[data-prop-field="${fieldKey}"]`);
  if (!el) return;
  const field = el.closest(".theme-studio-field");
  const accordion = el.closest(".studio-accordion");
  if (accordion && !accordion.open) accordion.open = true;
  field?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  field?.classList.add("theme-studio-field--flash");
  setTimeout(() => field?.classList.remove("theme-studio-field--flash"), 1200);
}

export function setStudioDirty(dirty) {
  const hint = document.getElementById("theme-studio-dirty");
  const save = document.getElementById("theme-studio-save");
  hint?.classList.toggle("is-visible", dirty);
  if (save) save.disabled = !dirty;
}

export function setDraftBadge(hasDraft, dirty) {
  const badge = document.getElementById("theme-draft-badge");
  if (!badge) return;
  const isDraft = hasDraft || dirty;
  badge.textContent = isDraft ? "Brouillon" : "Publié";
  badge.className = `theme-studio-status ${isDraft ? "theme-studio-status--draft" : "theme-studio-status--published"}`;
}

export function setPreviewDeviceUi(device) {
  const wrap = document.getElementById("theme-editor-preview-wrap");
  const label = document.getElementById("theme-canvas-label");
  const isMobile = device === "mobile";
  wrap?.classList.toggle("is-mobile", isMobile);
  if (label) label.textContent = isMobile ? "Aperçu · Mobile" : "Aperçu · Desktop";
  document.querySelectorAll(".theme-studio-segmented button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.device === device);
  });
}

export function showThemeStudio(active) {
  const mount = document.getElementById("theme-studio-mount");
  const dash = document.getElementById("dashboard");
  if (active) {
    mount?.classList.add("is-active");
    mount?.setAttribute("aria-hidden", "false");
    dash?.classList.add("theme-studio-active");
    document.body.classList.add("theme-studio-active");
  } else {
    mount?.classList.remove("is-active");
    mount?.setAttribute("aria-hidden", "true");
    dash?.classList.remove("theme-studio-active");
    document.body.classList.remove("theme-studio-active");
  }
}

function applyPanelState(side, collapsed) {
  const body = document.body;
  if (side === "left") {
    body.classList.toggle("studio-left-collapsed", collapsed);
    try {
      localStorage.setItem(LS_LEFT, collapsed ? "1" : "0");
    } catch (_) {}
  } else {
    body.classList.toggle("studio-right-collapsed", collapsed);
    try {
      localStorage.setItem(LS_RIGHT, collapsed ? "1" : "0");
    } catch (_) {}
  }
}

export function initThemeStudioChrome() {
  try {
    if (localStorage.getItem(LS_LEFT) === "1") document.body.classList.add("studio-left-collapsed");
    if (localStorage.getItem(LS_RIGHT) === "1") document.body.classList.add("studio-right-collapsed");
  } catch (_) {}

  document.getElementById("theme-studio-collapse-left")?.addEventListener("click", () => {
    applyPanelState("left", !document.body.classList.contains("studio-left-collapsed"));
  });
  document.getElementById("theme-studio-collapse-right")?.addEventListener("click", () => {
    applyPanelState("right", !document.body.classList.contains("studio-right-collapsed"));
  });
  document.getElementById("theme-studio-expand-left")?.addEventListener("click", () => applyPanelState("left", false));
  document.getElementById("theme-studio-expand-right")?.addEventListener("click", () => applyPanelState("right", false));

  const menuBtn = document.getElementById("theme-studio-menu-btn");
  const menu = document.getElementById("theme-studio-menu");
  menuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu?.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", () => {
    menu?.classList.remove("is-open");
    menuBtn?.setAttribute("aria-expanded", "false");
  });
  menu?.addEventListener("click", (e) => e.stopPropagation());
}

export function updateUndoRedoButtons(undoBtn, redoBtn, canUndo, canRedo) {
  if (undoBtn) undoBtn.disabled = !canUndo;
  if (redoBtn) redoBtn.disabled = !canRedo;
}
