import { fetchNotes, createNote, fetchNote, updateNote, fetchNoteChanges } from "./api.js";

const els = {
  title: document.querySelector('[data-title]'),
  editor: document.querySelector('[data-editor]'),
  status: document.querySelector('[data-status]'),
  noteList: document.querySelector('[data-note-list]'),
  search: document.querySelector('[data-search]'),
  changes: document.querySelector('[data-changes]'),
  newBtn: document.querySelector('[data-action="new-note"]'),
  saveBtn: document.querySelector('[data-action="save-note"]'),
  refreshBtn: document.querySelector('[data-action="refresh-list"]'),
  pdfBtn: document.querySelector('[data-action="download-pdf"]'),
  drawer: document.querySelector('[data-notes-drawer]'),
  drawerToggle: document.querySelector('[data-action="toggle-drawer"]'),
};

const state = {
  selectedId: null,
  list: [],
  dirty: false,
};

function setStatus(msg) {
  if (els.status) els.status.textContent = msg || "";
}

function htmlSanitize(s) {
  return typeof s === "string" ? s : "";
}

async function loadList() {
  const q = els.search?.value?.trim();
  const { data } = await fetchNotes(q ? { q } : undefined);
  state.list = Array.isArray(data) ? data : [];
  renderList();
}

function renderList() {
  if (!els.noteList) return;
  els.noteList.innerHTML = "";
  for (const note of state.list) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${note.title}</span><span style="color:var(--color-muted);font-size:12px">${new Date(note.updatedAt).toLocaleString()}</span>`;
    li.addEventListener("click", () => selectNote(note.id));
    els.noteList.appendChild(li);
  }
}

async function selectNote(id) {
  try {
    setStatus("Loading note...");
    const { data } = await fetchNote(id);
    state.selectedId = data.id;
    els.title.value = data.title || "Untitled";
    els.editor.innerHTML = htmlSanitize(data.contentHtml || "");
    state.dirty = false;
    setStatus(`Loaded. Last updated ${new Date(data.updatedAt).toLocaleString()}`);
    await loadChanges(id);
    if (els.drawer) {
      els.drawer.classList.add('collapsed');
    }
  } catch (e) {
    console.error(e);
    setStatus(e.message || "Failed to load note");
  }
}

async function loadChanges(id) {
  if (!els.changes) return;
  els.changes.innerHTML = "";
  const { data } = await fetchNoteChanges(id);
  for (const item of data) {
    const li = document.createElement("li");
    li.textContent = `v${item.version} • ${new Date(item.changedAt).toLocaleString()} • ${item.summary || "Edited"}`;
    els.changes.appendChild(li);
  }
}

function exec(cmd, val = null) {
  document.execCommand(cmd, false, val);
  state.dirty = true;
}

async function doSave() {
  try {
    const title = els.title.value?.trim() || "Untitled";
    const contentHtml = els.editor.innerHTML;
    const summary = state.selectedId ? "Edited content" : "Created note";
    setStatus("Saving...");
    if (!state.selectedId) {
      const { data } = await createNote({ title, contentHtml });
      state.selectedId = data.id;
      setStatus("Saved.");
      await loadList();
      await loadChanges(data.id);
    } else {
      const { data } = await updateNote(state.selectedId, { title, contentHtml, summary });
      setStatus("Saved.");
      await loadList();
      await loadChanges(data.id);
    }
    state.dirty = false;
  } catch (e) {
    console.error(e);
    setStatus(e.message || "Save failed");
  }
}

function doNew() {
  state.selectedId = null;
  els.title.value = "Untitled";
  els.editor.innerHTML = "";
  state.dirty = false;
  setStatus("New note");
}

function setupToolbar() {
  document.querySelectorAll('[data-cmd]').forEach((el) => {
    const cmd = el.getAttribute('data-cmd');
    if (el.tagName === 'SELECT') {
      el.addEventListener('change', () => exec('formatBlock', `<${el.value}>`));
    } else {
      el.addEventListener('click', () => exec(cmd));
    }
  });
}

function setupButtons() {
  els.newBtn?.addEventListener('click', doNew);
  els.saveBtn?.addEventListener('click', doSave);
  els.refreshBtn?.addEventListener('click', loadList);
  els.pdfBtn?.addEventListener('click', () => window.print());
  els.drawerToggle?.addEventListener('click', () => {
    if (!els.drawer) return;
    els.drawer.classList.toggle('collapsed');
  });
}

async function init() {
  setupToolbar();
  setupButtons();
  if (els.drawer) {
    els.drawer.classList.remove('collapsed');
  }
  await loadList();
}

document.addEventListener('DOMContentLoaded', init);
