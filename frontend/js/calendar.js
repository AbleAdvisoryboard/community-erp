import { fetchEvents } from "./api.js";

const els = {
  monthLabel: document.getElementById("calendar-month-label"),
  grid: document.getElementById("calendar-grid"),
  upcomingBody: document.getElementById("calendar-upcoming-body"),
  itemForm: document.getElementById("calendar-item-form"),
  itemMessage: document.getElementById("calendar-item-message"),
  search: document.getElementById("calendar-search"),
};

const LOCAL_KEY = "calendar-extra-items:v1";

const state = {
  currentMonth: new Date(), // any date in current view month
  events: [],
  extraItems: [],
  search: "",
};

function getItemColor(item) {
  if (item.source === "Event") {
    return "var(--color-primary)";
  }
  const kind = (item.kind || "").toLowerCase();
  if (kind === "meeting") return "var(--color-success)";
  if (kind === "task") return "#000000";
  if (kind === "reminder") return "var(--color-danger)";
  if (kind === "other") return "#ff9800";
  return "var(--color-warning)";
}

function loadExtraItems() {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveExtraItems(items) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function setMessage(text, tone = "info") {
  if (!els.itemMessage) return;
  if (!text) {
    els.itemMessage.style.display = "none";
    els.itemMessage.textContent = "";
    return;
  }
  els.itemMessage.style.display = "block";
  els.itemMessage.textContent = text;
  let color = "var(--color-muted)";
  if (tone === "success") color = "var(--color-success)";
  if (tone === "error") color = "var(--color-danger)";
  els.itemMessage.style.color = color;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function getMonthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

function normalizeItemsForView() {
  const { start, end } = getMonthRange(state.currentMonth);
  const startMs = start.getTime();
  const endMs = end.getTime() + 24 * 60 * 60 * 1000 - 1;

  const items = [];

  for (const ev of state.events) {
    if (!ev.startAt) continue;
    const startDate = new Date(ev.startAt);
    if (startDate.getTime() < startMs || startDate.getTime() > endMs) continue;
    items.push({
      id: `event-${ev.id}`,
      title: ev.name || ev.code || "Event",
      kind: "Event",
      source: "Event",
      date: startDate,
      timeLabel: startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    });
  }

  for (const item of state.extraItems) {
    const date = new Date(item.date);
    if (date.getTime() < startMs || date.getTime() > endMs) continue;
    items.push({
      id: item.id,
      title: item.title,
      kind: item.kind,
      source: "Calendar",
      date,
      timeLabel: item.time
        ? new Date(`${item.date}T${item.time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "",
    });
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  return items;
}

function renderMonth() {
  if (!els.grid || !els.monthLabel) return;

  const monthDate = state.currentMonth;
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const monthName = monthDate.toLocaleString(undefined, { month: "long", year: "numeric" });
  els.monthLabel.textContent = monthName;

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const items = normalizeItemsForView();
  const itemsByDay = new Map();
  for (const item of items) {
    const key = formatDateKey(item.date);
    if (!itemsByDay.has(key)) itemsByDay.set(key, []);
    itemsByDay.get(key).push(item);
  }

  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push("");
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(String(d));
  }
  while (cells.length % 7 !== 0) {
    cells.push("");
  }

  const todayKey = formatDateKey(new Date());
  const rows = [];

  for (let row = 0; row < cells.length / 7; row++) {
    const tds = [];
    for (let col = 0; col < 7; col++) {
      const idx = row * 7 + col;
      const cellDay = cells[idx];
      if (!cellDay) {
        tds.push("<td class=\"is-empty\"></td>");
        continue;
      }
      const date = new Date(year, month, Number(cellDay));
      const key = formatDateKey(date);
      const dayItems = itemsByDay.get(key) || [];
      const isToday = key === todayKey;
      const itemsHtml = dayItems
        .map((item) => {
          const color = getItemColor(item);
          const time = item.timeLabel ? `${item.timeLabel} · ` : "";
          return `<div style="margin-top:2px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};margin-right:4px;"></span>
              <span>${time}${item.title}</span>
            </div>`;
        })
        .join("");

      tds.push(
        `<td style="vertical-align:top;padding:6px 4px;" class="${isToday ? "is-selected" : ""}">
          <div style="font-size:12px;font-weight:600;">${cellDay}</div>
          ${itemsHtml}
        </td>`
      );
    }
    rows.push(`<tr>${tds.join("")}</tr>`);
  }

  els.grid.innerHTML = rows.join("");
}

function renderUpcoming() {
  if (!els.upcomingBody) return;
  const allItems = normalizeItemsForView();
  const now = new Date();

  const filtered = allItems.filter((item) => item.date.getTime() >= now.getTime());

  const search = state.search.trim().toLowerCase();
  const list = search
    ? filtered.filter((item) => item.title.toLowerCase().includes(search))
    : filtered;

  if (!list.length) {
    els.upcomingBody.innerHTML = `<tr><td colspan="4">No upcoming items in this month.</td></tr>`;
    return;
  }

  els.upcomingBody.innerHTML = list
    .slice(0, 50)
    .map((item) => {
      const whenLabel = item.date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `<tr>
        <td>${whenLabel}</td>
        <td>${item.title}</td>
        <td>${item.kind}</td>
        <td>${item.source}</td>
      </tr>`;
    })
    .join("");
}

async function loadEvents() {
  try {
    const { data } = await fetchEvents();
    state.events = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Failed to load events for calendar", error);
    state.events = [];
  }
}

function handleNavClick(direction) {
  const current = state.currentMonth;
  const month = current.getMonth();
  const year = current.getFullYear();
  if (direction === "prev") {
    state.currentMonth = new Date(year, month - 1, 1);
  } else if (direction === "next") {
    state.currentMonth = new Date(year, month + 1, 1);
  } else if (direction === "today") {
    state.currentMonth = new Date();
  }
  renderMonth();
  renderUpcoming();
}

function setupNav() {
  document
    .querySelectorAll("[data-calendar-nav]")
    .forEach((el) => {
      const dir = el.getAttribute("data-calendar-nav");
      el.addEventListener("click", () => handleNavClick(dir));
    });
}

function setupForm() {
  if (!els.itemForm) return;
  els.itemForm.addEventListener("submit", (evt) => {
    evt.preventDefault();
    const form = new FormData(els.itemForm);
    const title = (form.get("title") || "").toString().trim();
    const dateStr = (form.get("date") || "").toString();
    const timeStr = (form.get("time") || "").toString();
    const kind = (form.get("kind") || "Meeting").toString();
    if (!title || !dateStr) {
      setMessage("Title and date are required.", "error");
      return;
    }
    const id = `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item = {
      id,
      title,
      date: dateStr,
      time: timeStr || null,
      kind,
    };
    state.extraItems.push(item);
    saveExtraItems(state.extraItems);
    setMessage("Item added to calendar.", "success");
    els.itemForm.reset();

    const createdDate = new Date(dateStr);
    state.currentMonth = createdDate;
    renderMonth();
    renderUpcoming();
  });
}

function setupSearch() {
  if (!els.search) return;
  els.search.addEventListener("input", () => {
    state.search = els.search.value || "";
    renderUpcoming();
  });
}

async function init() {
  state.extraItems = loadExtraItems();
  setupNav();
  setupForm();
  setupSearch();
  await loadEvents();
  renderMonth();
  renderUpcoming();
}

document.addEventListener("DOMContentLoaded", init);
