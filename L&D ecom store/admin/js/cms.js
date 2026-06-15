import { createThemeEditor } from "./theme-editor.js";

export function createCmsModule(ctx) {
  const editor = createThemeEditor(ctx);

  async function refreshCmsTab() {
    const route = ctx.getRoute?.() || { tab: "cms", sub: null };
    await editor.refresh(route);
  }

  function bindCmsEvents() {
    editor.bindEvents();
  }

  return {
    refreshCmsTab,
    bindCmsEvents,
    loadSiteSettings: () => editor.loadDraft(),
    isEditorRoute: (route) => editor.isEditorRoute(route),
    hideEditor: () => editor.hideEditor()
  };
}
