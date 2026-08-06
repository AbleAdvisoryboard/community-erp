import {
  fetchInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  fetchInventoryStock,
  adjustInventoryStock,
  updateInventoryStock,
  fetchInventoryCategories,
  createInventoryCategory,
  deleteInventoryCategory,
  fetchInventoryTypes,
  createInventoryType,
  deleteInventoryType,
  fetchLowStock,
  fetchAssets,
  createAsset,
  updateAsset,
  fetchContacts
} from "./api.js";

const state = {
  items: [],
  stock: [],
  lowStock: [],
  assets: [],
  contacts: [],
  categories: [],
  types: [],
  filters: { assetStatus: "InUse" },
  editingItemId: null,
};

const itemsBody = document.querySelector("[data-items-body]");
const itemCount = document.getElementById("item-count");
const itemForm = document.getElementById("item-form");
const itemFormMessage = document.getElementById("item-form-message");
const itemCategorySelect = document.getElementById("item-category-select");
const itemTypeSelect = document.getElementById("item-type-select");
const itemFilter = document.getElementById("item-filter");
const itemTypeFilter = document.getElementById("item-type-filter");
const itemFilterSearch = document.getElementById("item-filter-search");
const itemSearch = document.getElementById("item-search");
const addCategoryButton = document.getElementById("add-category-button");
const addTypeButton = document.getElementById("add-type-button");
const deleteCategoryButton = document.getElementById("delete-category-button");
const deleteTypeButton = document.getElementById("delete-type-button");
const addCategoryInline = document.getElementById("add-category-inline");
const addTypeInline = document.getElementById("add-type-inline");
const newCategoryName = document.getElementById("new-category-name");
const newTypeName = document.getElementById("new-type-name");
const saveCategoryButton = document.getElementById("save-category-button");
const saveTypeButton = document.getElementById("save-type-button");
const cancelCategoryButton = document.getElementById("cancel-category-button");
const cancelTypeButton = document.getElementById("cancel-type-button");
const stockBody = document.querySelector("[data-stock-body]");
const stockSummary = document.getElementById("stock-summary");
const stockForm = document.getElementById("stock-adjust-form");
const stockMessage = document.getElementById("stock-message");
const stockPositionSelect = document.getElementById("stock-position-select");
const initialLocationSelect = document.getElementById("initial-location-select");
const initialBinSelect = document.getElementById("initial-bin-select");
const initialLocationNew = document.getElementById("initial-location-new");
const initialBinNew = document.getElementById("initial-bin-new");
const stockLocationSelect = document.getElementById("stock-location-select");
const stockBinSelect = document.getElementById("stock-bin-select");
const stockLocationNew = document.getElementById("stock-location-new");
const stockBinNew = document.getElementById("stock-bin-new");
const lowStockBody = document.querySelector("[data-low-stock-body]");
const assetBody = document.querySelector("[data-assets-body]");
const assetSummary = document.getElementById("asset-summary");
const assetForm = document.getElementById("asset-form");
const assetMessage = document.getElementById("asset-message");
const itemSelectForStock = document.getElementById("stock-item-select");
const itemSelectForAsset = document.getElementById("asset-item-select");
const assetCustodianSelect = document.getElementById("asset-custodian-select");
const assetStatusSelect = document.getElementById("asset-status-select");
const assetStatusFilter = document.getElementById("asset-status-filter");

function setMessage(el, text, tone = "info") {
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.style.display = "block";
  el.style.color =
    tone === "error" ? "var(--color-danger)" :
    tone === "success" ? "var(--color-success)" :
    "var(--color-muted)";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resetSaveConfirmation(button) {
  if (!button) return;
  if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  delete button.dataset.confirmSave;
  delete button.dataset.originalText;
}

function confirmSave(button, messageEl) {
  if (!button) return true;
  if (button.dataset.confirmSave === "true") {
    resetSaveConfirmation(button);
    return true;
  }
  button.dataset.confirmSave = "true";
  button.dataset.originalText = button.textContent;
  button.textContent = "Confirm Save";
  setMessage(messageEl, "Are you sure? Click Confirm Save to finish.", "info");
  return false;
}

function confirmAction(button, messageEl, confirmText, message) {
  if (!button) return true;
  if (button.dataset.confirmSave === "true") {
    resetSaveConfirmation(button);
    return true;
  }
  button.dataset.confirmSave = "true";
  button.dataset.originalText = button.textContent;
  button.textContent = confirmText;
  setMessage(messageEl, message, "info");
  return false;
}

function assetStatusLabel(status) {
  const labels = {
    InUse: "In Use",
    InStock: "Back in Stock",
    InRepair: "In Repair",
    Disposed: "Disposed",
    Reserved: "Reserved",
    InService: "In Use",
  };
  return labels[status] || status || "-";
}

function renderItemEditRow(item) {
  const stockRows = stockRowsForItem(item.id);
  const typeOptions = state.types.length
    ? state.types.map((type) => `<option value="${escapeHtml(type.name)}" ${type.name === item.type ? "selected" : ""}>${escapeHtml(type.name)}</option>`).join("")
    : `<option value="${escapeHtml(item.type)}" selected>${escapeHtml(item.type)}</option>`;
  const categoryOptions = ['<option value="">Uncategorized</option>']
    .concat(state.categories.map((category) => (
      `<option value="${category.id}" ${Number(category.id) === Number(item.categoryId) ? "selected" : ""}>${escapeHtml(category.name)}</option>`
    )))
    .join("");

  return `
    <tr data-item-edit-row="${item.id}">
      <td colspan="13">
        <form data-item-edit-form="${item.id}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end;">
          <div style="grid-column:1 / -1;">
            <span>Edit</span>
            <div class="table-wrapper" style="overflow:auto;margin-top:8px;">
              <table class="table" style="margin:0;min-width:760px;">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>UOM</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><input type="text" name="sku" value="${escapeHtml(item.sku)}" required /></td>
                    <td><input type="text" name="name" value="${escapeHtml(item.name)}" required /></td>
                    <td><select name="type" required>${typeOptions}</select></td>
                    <td><select name="categoryId">${categoryOptions}</select></td>
                    <td><input type="text" name="uom" value="${escapeHtml(item.uom || "each")}" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style="grid-column:1 / -1;">
            <span>Low Stock Alert Qty</span>
            <div class="table-wrapper" style="overflow:auto;margin-top:8px;">
              <table class="table" style="margin:0;">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Bin</th>
                    <th style="text-align:right;">Alert Qty</th>
                  </tr>
                </thead>
                <tbody>
              ${stockRows.length ? stockRows.map((stock) => `
                  <tr>
                    <td>${escapeHtml(stock.location || "-")}</td>
                    <td>${escapeHtml(stock.bin || "-")}</td>
                    <td style="text-align:right;">
                      <input type="number" step="0.01" min="0" name="minQty-${stock.id}" value="${Number(stock.minQty || 0)}" required style="max-width:120px;text-align:right;" />
                    </td>
                  </tr>
              `).join("") : '<tr><td colspan="3">No stock positions yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="button" type="submit" data-save-item-edit>Save</button>
            <button class="button secondary" type="button" data-cancel-item-edit>Cancel</button>
          </div>
        </form>
      </td>
    </tr>`;
}

function setItemSearchFilter(value) {
  state.filters.search = value ? value.trim() || undefined : undefined;
  if (itemSearch && itemSearch.value !== (value || "")) itemSearch.value = value || "";
  if (itemFilterSearch && itemFilterSearch.value !== (value || "")) itemFilterSearch.value = value || "";
}

function stockSummaryForItem(itemId) {
  const rows = state.stock.filter((row) => Number(row.itemId) === Number(itemId));
  if (!rows.length) {
    return {
      locations: "-",
      bins: "-",
      onHand: "0.00",
      available: "0.00",
    };
  }
  return {
    locations: rows.map((row) => row.location || "-").join(" / "),
    bins: rows.map((row) => row.bin || "-").join(" / "),
    onHand: rows
      .map((row) => `${Number(row.qtyOnHand || 0).toFixed(2)} ${row.uom || ""}`.trim())
      .join(" / "),
    available: rows
      .map((row) => `${Number(row.qtyAvailable ?? ((row.qtyOnHand || 0) - (row.qtyAllocated || 0))).toFixed(2)} ${row.uom || ""}`.trim())
      .join(" / "),
  };
}

function selectedStockItemId() {
  return itemSelectForStock ? Number(itemSelectForStock.value || 0) : 0;
}

function stockRowsForItem(itemId) {
  return state.stock.filter((row) => Number(row.itemId) === Number(itemId));
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => (value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function setSelectOptions(select, values, { emptyLabel = "Select", newLabel = "Add new" } = {}) {
  if (!select) return;
  const current = select.value;
  const options = [
    `<option value="">${emptyLabel}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
    `<option value="__new">${newLabel}</option>`,
  ];
  select.innerHTML = options.join("");
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function toggleNewField(select, input) {
  if (!select || !input) return;
  const show = select.value === "__new";
  input.style.display = show ? "block" : "none";
  if (show) {
    input.focus();
  } else {
    input.value = "";
  }
}

function resolveSelectValue(select, input) {
  if (!select) return "";
  return select.value === "__new" ? (input?.value || "").trim() : (select.value || "").trim();
}

function updateLocationAndBinOptions() {
  const rows = state.stock;
  const locations = uniqueSorted(rows.map((row) => row.location));
  setSelectOptions(stockLocationSelect, locations, { emptyLabel: "Select location", newLabel: "Add new location" });
  setSelectOptions(initialLocationSelect, locations, { emptyLabel: "Select location", newLabel: "Add new location" });

  const stockLocation = resolveSelectValue(stockLocationSelect, stockLocationNew);
  const initialLocation = resolveSelectValue(initialLocationSelect, initialLocationNew);
  const stockBins = uniqueSorted(
    (stockLocation
      ? rows.filter((row) => String(row.location || "").toLowerCase() === stockLocation.toLowerCase())
      : rows
    ).map((row) => row.bin)
  );
  const initialBins = uniqueSorted(
    (initialLocation
      ? rows.filter((row) => String(row.location || "").toLowerCase() === initialLocation.toLowerCase())
      : rows
    ).map((row) => row.bin)
  );
  setSelectOptions(stockBinSelect, stockBins, { emptyLabel: "No bin", newLabel: "Add new bin" });
  setSelectOptions(initialBinSelect, initialBins, { emptyLabel: "No bin", newLabel: "Add new bin" });
  toggleNewField(stockLocationSelect, stockLocationNew);
  toggleNewField(stockBinSelect, stockBinNew);
  toggleNewField(initialLocationSelect, initialLocationNew);
  toggleNewField(initialBinSelect, initialBinNew);
}

function updateStockPositionOptions() {
  if (!stockPositionSelect) return;
  const itemId = selectedStockItemId();
  const rows = stockRowsForItem(itemId);
  stockPositionSelect.innerHTML = [
    '<option value="new">New location/bin</option>',
    ...rows.map((row) => (
      `<option value="${row.id}">${escapeHtml(row.location)}${row.bin ? ` / ${escapeHtml(row.bin)}` : ""} (${Number(row.qtyOnHand || 0).toFixed(2)} ${escapeHtml(row.uom)})</option>`
    )),
  ].join("");
}

function contactDisplayName(contact) {
  return `${contact.firstName || ""} ${contact.lastName || ""}`.trim()
    || contact.preferredName
    || contact.email
    || `Contact #${contact.id}`;
}

function renderAssetCustodianOptions(selectedId = "") {
  if (!assetCustodianSelect) return;
  const options = ['<option value="">Unassigned</option>']
    .concat(state.contacts.map((contact) => (
      `<option value="${contact.id}">${escapeHtml(contactDisplayName(contact))}</option>`
    )));
  assetCustodianSelect.innerHTML = options.join("");
  if (selectedId) assetCustodianSelect.value = String(selectedId);
}

function applySelectedStockPosition() {
  if (!stockForm || !stockPositionSelect) return;
  const locationInput = stockForm.elements.location;
  const binInput = stockForm.elements.bin;
  const stockId = stockPositionSelect.value;
  const row = state.stock.find((entry) => String(entry.id) === String(stockId));
  if (!row) {
    locationInput.value = "";
    binInput.value = "";
    locationInput.disabled = false;
    binInput.disabled = false;
    updateLocationAndBinOptions();
    return;
  }
  locationInput.value = row.location || "";
  binInput.value = row.bin || "";
  locationInput.disabled = true;
  binInput.disabled = true;
  updateLocationAndBinOptions();
}

function bindLiveSearch(input) {
  if (!input) return;
  let debounce;
  input.addEventListener("input", (event) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      setItemSearchFilter(event.target.value);
      loadItems();
    }, 250);
  });
}

async function loadCategories(selectedCategoryId) {
  try {
    const { data } = await fetchInventoryCategories();
    state.categories = data;
    if (itemCategorySelect) {
      const options = ['<option value="">Uncategorized</option>']
        .concat(data.map((category) => `<option value="${category.id}">${category.name}</option>`));
      itemCategorySelect.innerHTML = options.join("");
      if (selectedCategoryId) itemCategorySelect.value = String(selectedCategoryId);
    }
  } catch (error) {
    console.error("Failed to load categories", error);
  }
}

async function loadTypes(selectedType) {
  try {
    const { data } = await fetchInventoryTypes();
    state.types = data;
    const typeOptions = data.map((type) => `<option value="${type.name}">${type.name}</option>`);
    if (itemTypeSelect) {
      itemTypeSelect.innerHTML = typeOptions.join("");
      if (selectedType) itemTypeSelect.value = selectedType;
    }
    if (itemTypeFilter) {
      itemTypeFilter.innerHTML = ['<option value="">All types</option>', ...typeOptions].join("");
      if (state.filters.type) itemTypeFilter.value = state.filters.type;
    }
  } catch (error) {
    console.error("Failed to load inventory types", error);
  }
}

function renderItems(items) {
  if (!itemsBody) return;
  if (!items.length) {
    itemsBody.innerHTML = '<tr><td colspan="13">No items found.</td></tr>';
    if (itemCount) itemCount.textContent = "0 items";
    return;
  }
  itemsBody.innerHTML = items
    .map((item) => {
      const stock = stockSummaryForItem(item.id);
      return `
        <tr>
          <td>${escapeHtml(item.sku)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.type)}</td>
          <td>${escapeHtml(item.categoryName || "-")}</td>
          <td>${escapeHtml(stock.locations)}</td>
          <td>${escapeHtml(stock.bins)}</td>
          <td style="text-align:right;">${escapeHtml(stock.onHand)}</td>
          <td style="text-align:right;">${escapeHtml(stock.available)}</td>
          <td>${formatDate(item.createdAt)}</td>
          <td>${formatDate(item.updatedAt)}</td>
          <td>${escapeHtml(item.uom)}</td>
          <td>${item.standardCost != null ? `$${Number(item.standardCost).toFixed(2)}` : "-"}</td>
          <td><button class="button secondary" type="button" data-edit-item="${item.id}">${Number(state.editingItemId) === Number(item.id) ? "Close" : "Edit"}</button></td>
        </tr>
        ${Number(state.editingItemId) === Number(item.id) ? renderItemEditRow(item) : ""}`;
    })
    .join("");
  if (itemCount) itemCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

  const optionsHtml = ['<option value="">Select item</option>']
    .concat(items.map((item) => `<option value="${item.id}">${item.sku} - ${item.name}</option>`));
  if (itemSelectForStock) itemSelectForStock.innerHTML = optionsHtml.join("");
  updateStockPositionOptions();
  updateLocationAndBinOptions();
  if (itemSelectForAsset) {
    const equipmentOptions = items
      .filter((item) => item.type === "Equipment")
      .map((item) => `<option value="${item.id}">${item.sku} - ${item.name}</option>`);
    itemSelectForAsset.innerHTML = ['<option value="">Select equipment item</option>', ...equipmentOptions].join("");
  }
}

function renderStock(rows) {
  if (!stockBody) return;
  if (!rows.length) {
    stockBody.innerHTML = '<tr><td colspan="7">No stock entries yet.</td></tr>';
    if (stockSummary) stockSummary.textContent = "0 locations";
    return;
  }
  stockBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.sku)} - ${escapeHtml(row.itemName)}</td>
        <td>${escapeHtml(row.location)}</td>
        <td>${escapeHtml(row.bin || "-")}</td>
        <td style="text-align:right;">${Number(row.qtyOnHand || 0).toFixed(2)} ${escapeHtml(row.uom)}</td>
        <td style="text-align:right;">${Number(row.qtyAvailable ?? ((row.qtyOnHand || 0) - (row.qtyAllocated || 0))).toFixed(2)} ${escapeHtml(row.uom)}</td>
        <td style="text-align:right;">${Number(row.minQty || 0).toFixed(2)}</td>
        <td style="text-align:right;">${row.maxQty != null ? Number(row.maxQty).toFixed(2) : "-"}</td>
      </tr>`)
    .join("");
  if (stockSummary) stockSummary.textContent = `${rows.length} location${rows.length === 1 ? "" : "s"}`;
}

function renderLowStock(rows) {
  if (!lowStockBody) return;
  if (!rows.length) {
    lowStockBody.innerHTML = '<tr><td colspan="5">All stock levels are healthy.</td></tr>';
    return;
  }
  lowStockBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${row.sku} - ${row.name}</td>
        <td>${row.location}${row.bin ? ` / ${row.bin}` : ""}</td>
        <td style="text-align:right;">${Number(row.qty_on_hand || 0).toFixed(2)} ${row.uom}</td>
        <td style="text-align:right;">${Number(row.min_qty || 0).toFixed(2)}</td>
        <td style="text-align:right;">${Number(row.qty_needed || 0).toFixed(2)}</td>
      </tr>`)
    .join("");
}

function renderAssets(assets) {
  if (!assetBody) return;
  if (!assets.length) {
    assetBody.innerHTML = '<tr><td colspan="6">No assets recorded.</td></tr>';
    if (assetSummary) assetSummary.textContent = "0 assets";
    return;
  }
  assetBody.innerHTML = assets
    .map((asset) => `
      <tr>
        <td>${asset.assetTag || "-"}</td>
        <td>${asset.sku} - ${asset.itemName}</td>
        <td>${asset.location || "-"}</td>
        <td>${assetStatusLabel(asset.status)}</td>
        <td>${asset.custodianName || "-"}</td>
        <td style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="button secondary" type="button" data-unassign-asset="${asset.id}" ${asset.status === "InUse" || asset.status === "InService" || asset.custodianContactId ? "" : "disabled"}>
            Back in Stock
          </button>
          <button class="button secondary" type="button" data-dispose-asset="${asset.id}" ${asset.status === "Disposed" ? "disabled" : ""}>
            Dispose
          </button>
        </td>
      </tr>`)
    .join("");
  if (assetSummary) assetSummary.textContent = `${assets.length} asset${assets.length === 1 ? "" : "s"}`;
}

async function loadItems() {
  try {
    const params = {
      type: state.filters.type,
      search: state.filters.search,
    };
    const { data } = await fetchInventoryItems(params);
    state.items = data;
    renderItems(data);
  } catch (error) {
    console.error("Failed to load items", error);
    if (itemsBody) itemsBody.innerHTML = `<tr><td colspan="13">${error.message}</td></tr>`;
  }
}

async function loadStock() {
  try {
    const { data } = await fetchInventoryStock();
    state.stock = data;
    renderStock(data);
    renderItems(state.items);
    updateStockPositionOptions();
    applySelectedStockPosition();
    updateLocationAndBinOptions();
  } catch (error) {
    console.error("Failed to load stock", error);
    if (stockBody) stockBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
  }
}

async function loadLowStock() {
  try {
    const { data } = await fetchLowStock();
    state.lowStock = data;
    renderLowStock(data);
  } catch (error) {
    console.error("Failed to load low stock", error);
  }
}

async function loadAssets() {
  try {
    const { data } = await fetchAssets({ status: state.filters.assetStatus });
    state.assets = data;
    renderAssets(data);
  } catch (error) {
    console.error("Failed to load assets", error);
    if (assetBody) assetBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
  }
}

async function loadContacts() {
  try {
    const { data } = await fetchContacts({ limit: 200 });
    state.contacts = data || [];
    renderAssetCustodianOptions();
  } catch (error) {
    console.error("Failed to load contacts", error);
  }
}

if (itemsBody) {
  itemsBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-item]");
    if (!button) return;
    if (!window.__ERP_USER__) {
      setMessage(itemFormMessage, "Sign in to edit items.", "error");
      return;
    }
    const itemId = Number(button.dataset.editItem);
    state.editingItemId = Number(state.editingItemId) === itemId ? null : itemId;
    renderItems(state.items);
  });

  itemsBody.addEventListener("click", (event) => {
    if (!event.target.closest("[data-cancel-item-edit]")) return;
    state.editingItemId = null;
    renderItems(state.items);
  });

  itemsBody.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-item-edit-form]");
    if (!form) return;
    event.preventDefault();
    const itemId = Number(form.dataset.itemEditForm);
    const data = new FormData(form);
    const payload = {
      sku: (data.get("sku") || "").trim(),
      name: (data.get("name") || "").trim(),
      type: (data.get("type") || "").trim(),
      categoryId: data.get("categoryId") ? Number(data.get("categoryId")) : null,
      uom: (data.get("uom") || "each").trim(),
    };
    const stockUpdates = stockRowsForItem(itemId).map((stock) => ({
      stock,
      minQty: Number(data.get(`minQty-${stock.id}`)),
    }));
    if (!payload.sku || !payload.name || !payload.type) {
      setMessage(itemFormMessage, "SKU, name, and type are required.", "error");
      return;
    }
    if (stockUpdates.some((entry) => !Number.isFinite(entry.minQty) || entry.minQty < 0)) {
      setMessage(itemFormMessage, "Low stock alert quantities must be 0 or higher.", "error");
      return;
    }
    if (!confirmSave(form.querySelector("[data-save-item-edit]"), itemFormMessage)) return;
    try {
      await updateInventoryItem(itemId, payload);
      await Promise.all(stockUpdates.map(({ stock, minQty }) => updateInventoryStock(stock.id, {
        location: stock.location,
        bin: stock.bin || null,
        minQty,
        maxQty: stock.maxQty ?? null,
      })));
      state.editingItemId = null;
      setMessage(itemFormMessage, "Item updated.", "success");
      await loadTypes(payload.type);
      await loadItems();
      await loadStock();
      await loadLowStock();
      await loadAssets();
    } catch (error) {
      setMessage(itemFormMessage, error.message || "Failed to update item.", "error");
    }
  });
}

if (assetBody) {
  assetBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-unassign-asset], [data-dispose-asset]");
    if (!button) return;
    if (!window.__ERP_USER__) {
      setMessage(assetMessage, "Sign in to update assets.", "error");
      return;
    }
    const isDispose = Boolean(button.dataset.disposeAsset);
    if (isDispose) {
      if (!confirmAction(button, assetMessage, "Confirm Dispose", "Are you sure? Click Confirm Dispose to remove this asset from stock and financial statements.")) return;
      try {
        await updateAsset(Number(button.dataset.disposeAsset), { custodianContactId: null, status: "Disposed" });
        resetSaveConfirmation(button);
        setMessage(assetMessage, "Asset disposed and removed from inventory value.", "success");
        await loadAssets();
        await loadStock();
        await loadLowStock();
      } catch (error) {
        resetSaveConfirmation(button);
        setMessage(assetMessage, error.message || "Failed to dispose asset.", "error");
      }
      return;
    }
    if (!confirmAction(button, assetMessage, "Confirm Back", "Are you sure? Click Confirm Back to mark this asset back in stock.")) return;
    try {
      await updateAsset(Number(button.dataset.unassignAsset), { custodianContactId: null, status: "InStock" });
      resetSaveConfirmation(button);
      setMessage(assetMessage, "Asset marked back in stock.", "success");
      await loadAssets();
      await loadStock();
    } catch (error) {
      resetSaveConfirmation(button);
      setMessage(assetMessage, error.message || "Failed to unassign asset.", "error");
    }
  });
}

if (assetStatusFilter) {
  assetStatusFilter.value = state.filters.assetStatus;
  assetStatusFilter.addEventListener("change", () => {
    state.filters.assetStatus = assetStatusFilter.value || undefined;
    loadAssets();
  });
}

if (assetStatusSelect) {
  assetStatusSelect.addEventListener("change", () => {
    if (assetStatusSelect.value === "InStock" && assetCustodianSelect) {
      assetCustodianSelect.value = "";
    }
  });
}

if (assetCustodianSelect) {
  assetCustodianSelect.addEventListener("change", () => {
    if (assetCustodianSelect.value && assetStatusSelect?.value === "InStock") {
      assetStatusSelect.value = "InUse";
    }
  });
}

if (itemForm) {
  itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(itemFormMessage, "Sign in to add items.", "error");
      return;
    }
    const data = new FormData(itemForm);
    const initialLocation = resolveSelectValue(initialLocationSelect, initialLocationNew);
    const initialBin = resolveSelectValue(initialBinSelect, initialBinNew);
    const initialQty = Number(data.get("initialQty"));
    const initialMinQty = data.get("initialMinQty") === "" ? 0 : Number(data.get("initialMinQty"));
    const payload = {
      sku: (data.get("sku") || "").trim(),
      name: (data.get("name") || "").trim(),
      type: data.get("type") || "Consumable",
      categoryId: data.get("categoryId") ? Number(data.get("categoryId")) : null,
      uom: (data.get("uom") || "each").trim(),
      standardCost: data.get("standardCost") ? Number(data.get("standardCost")) : undefined,
      initialStock: [
        {
          location: initialLocation,
          bin: initialBin || null,
          qtyOnHand: initialQty,
          minQty: initialMinQty,
        },
      ],
    };
    if (!payload.sku || !payload.name) {
      setMessage(itemFormMessage, "SKU and Name are required.", "error");
      return;
    }
    if (!initialLocation || !Number.isFinite(initialQty)) {
      setMessage(itemFormMessage, "Location and starting quantity are required.", "error");
      return;
    }
    if (!Number.isFinite(initialMinQty) || initialMinQty < 0) {
      setMessage(itemFormMessage, "Low stock alert quantity must be 0 or higher.", "error");
      return;
    }
    try {
      await createInventoryItem(payload);
      setMessage(itemFormMessage, "Item created.", "success");
      itemForm.reset();
      loadCategories();
      loadItems();
      loadStock();
      loadLowStock();
    } catch (error) {
      setMessage(itemFormMessage, error.message || "Failed to create item.", "error");
    }
  });
}

if (addCategoryButton) {
  addCategoryButton.addEventListener("click", () => {
    if (!window.__ERP_USER__) {
      setMessage(itemFormMessage, "Sign in to add categories.", "error");
      return;
    }
    if (addCategoryInline) addCategoryInline.style.display = "grid";
    newCategoryName?.focus();
  });
}

if (addTypeButton) {
  addTypeButton.addEventListener("click", () => {
    if (!window.__ERP_USER__) {
      setMessage(itemFormMessage, "Sign in to add types.", "error");
      return;
    }
    if (addTypeInline) addTypeInline.style.display = "grid";
    newTypeName?.focus();
  });
}

if (deleteCategoryButton) {
  deleteCategoryButton.addEventListener("click", async () => {
    if (!window.__ERP_USER__) {
      setMessage(itemFormMessage, "Sign in to delete categories.", "error");
      return;
    }
    const categoryId = Number(itemCategorySelect?.value || 0);
    const category = state.categories.find((item) => Number(item.id) === categoryId);
    if (!category) {
      setMessage(itemFormMessage, "Choose a category to delete.", "error");
      return;
    }
    if (!window.confirm(`Delete category ${category.name}? Items using it will become Uncategorized.`)) {
      return;
    }
    try {
      await deleteInventoryCategory(categoryId);
      setMessage(itemFormMessage, "Category deleted.", "success");
      await loadCategories();
      await loadItems();
    } catch (error) {
      setMessage(itemFormMessage, error.message || "Failed to delete category.", "error");
    }
  });
}

if (deleteTypeButton) {
  deleteTypeButton.addEventListener("click", async () => {
    if (!window.__ERP_USER__) {
      setMessage(itemFormMessage, "Sign in to delete types.", "error");
      return;
    }
    const typeName = itemTypeSelect?.value || "";
    if (!typeName) {
      setMessage(itemFormMessage, "Choose a type to delete.", "error");
      return;
    }
    if (!window.confirm(`Delete type ${typeName} from the picker? Existing items keep their type.`)) {
      return;
    }
    try {
      await deleteInventoryType(typeName);
      setMessage(itemFormMessage, "Type deleted.", "success");
      await loadTypes();
      await loadItems();
    } catch (error) {
      setMessage(itemFormMessage, error.message || "Failed to delete type.", "error");
    }
  });
}

if (cancelCategoryButton) {
  cancelCategoryButton.addEventListener("click", () => {
    resetSaveConfirmation(saveCategoryButton);
    if (addCategoryInline) addCategoryInline.style.display = "none";
    if (newCategoryName) newCategoryName.value = "";
  });
}

if (cancelTypeButton) {
  cancelTypeButton.addEventListener("click", () => {
    resetSaveConfirmation(saveTypeButton);
    if (addTypeInline) addTypeInline.style.display = "none";
    if (newTypeName) newTypeName.value = "";
  });
}

if (saveCategoryButton) {
  saveCategoryButton.addEventListener("click", async () => {
    const trimmedName = (newCategoryName?.value || "").trim();
    if (!trimmedName) {
      setMessage(itemFormMessage, "Category name is required.", "error");
      return;
    }
    if (!confirmSave(saveCategoryButton, itemFormMessage)) return;
    try {
      const { data } = await createInventoryCategory({ name: trimmedName });
      await loadCategories(data.id);
      resetSaveConfirmation(saveCategoryButton);
      if (addCategoryInline) addCategoryInline.style.display = "none";
      if (newCategoryName) newCategoryName.value = "";
      setMessage(itemFormMessage, "Category added.", "success");
    } catch (error) {
      setMessage(itemFormMessage, error.message || "Failed to add category.", "error");
    }
  });
}

if (saveTypeButton) {
  saveTypeButton.addEventListener("click", async () => {
    const trimmedName = (newTypeName?.value || "").trim();
    if (!trimmedName) {
      setMessage(itemFormMessage, "Type name is required.", "error");
      return;
    }
    if (!confirmSave(saveTypeButton, itemFormMessage)) return;
    try {
      const { data } = await createInventoryType({ name: trimmedName });
      await loadTypes(data.name);
      resetSaveConfirmation(saveTypeButton);
      if (addTypeInline) addTypeInline.style.display = "none";
      if (newTypeName) newTypeName.value = "";
      setMessage(itemFormMessage, "Type added.", "success");
    } catch (error) {
      setMessage(itemFormMessage, error.message || "Failed to add type.", "error");
    }
  });
}

if (newCategoryName) {
  newCategoryName.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveCategoryButton?.click();
  });
}

if (newTypeName) {
  newTypeName.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveTypeButton?.click();
  });
}

if (itemFilter) {
  itemFilter.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(itemFilter);
    state.filters.type = data.get("type") || undefined;
    setItemSearchFilter(data.get("search") || "");
    loadItems();
  });
}

if (itemTypeFilter) {
  itemTypeFilter.addEventListener("change", () => {
    state.filters.type = itemTypeFilter.value || undefined;
    loadItems();
  });
}

bindLiveSearch(itemSearch);
bindLiveSearch(itemFilterSearch);

if (itemSelectForStock) {
  itemSelectForStock.addEventListener("change", () => {
    updateStockPositionOptions();
    updateLocationAndBinOptions();
    applySelectedStockPosition();
  });
}

if (stockPositionSelect) {
  stockPositionSelect.addEventListener("change", applySelectedStockPosition);
}

if (stockLocationSelect) {
  stockLocationSelect.addEventListener("change", () => {
    updateLocationAndBinOptions();
    toggleNewField(stockLocationSelect, stockLocationNew);
  });
}

if (stockBinSelect) {
  stockBinSelect.addEventListener("change", () => toggleNewField(stockBinSelect, stockBinNew));
}

if (initialLocationSelect) {
  initialLocationSelect.addEventListener("change", () => {
    updateLocationAndBinOptions();
    toggleNewField(initialLocationSelect, initialLocationNew);
  });
}

if (initialBinSelect) {
  initialBinSelect.addEventListener("change", () => toggleNewField(initialBinSelect, initialBinNew));
}

if (stockForm) {
  stockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(stockMessage, "Sign in to adjust stock.", "error");
      return;
    }
    const data = new FormData(stockForm);
    const rawQty = Number(data.get("qtyDelta"));
    const direction = data.get("adjustmentDirection") || "add";
    const selectedPosition = state.stock.find((entry) => String(entry.id) === String(stockPositionSelect?.value));
    const location = selectedPosition?.location || resolveSelectValue(stockLocationSelect, stockLocationNew);
    const bin = selectedPosition ? (selectedPosition.bin || "") : resolveSelectValue(stockBinSelect, stockBinNew);
    const payload = {
      itemId: Number(data.get("itemId")),
      location,
      bin: bin || null,
      qtyDelta: direction === "remove" ? -Math.abs(rawQty) : Math.abs(rawQty),
      reason: (data.get("reason") || "").trim() || null,
    };
    if (!payload.itemId || !payload.location) {
      setMessage(stockMessage, "Select an item and location.", "error");
      return;
    }
    if (!Number.isFinite(rawQty) || rawQty <= 0) {
      setMessage(stockMessage, "Quantity must be greater than 0.", "error");
      return;
    }
    try {
      await adjustInventoryStock(payload);
      setMessage(stockMessage, "Stock updated.", "success");
      stockForm.reset();
      updateStockPositionOptions();
      applySelectedStockPosition();
      await loadStock();
      await loadLowStock();
    } catch (error) {
      setMessage(stockMessage, error.message || "Failed to adjust stock.", "error");
    }
  });
}

if (assetForm) {
  assetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(assetMessage, "Sign in to add assets.", "error");
      return;
    }
    const data = new FormData(assetForm);
    const payload = {
      itemId: Number(data.get("itemId")),
      assetTag: (data.get("assetTag") || "").trim() || null,
      serialNumber: (data.get("serialNumber") || "").trim() || null,
      location: (data.get("location") || "").trim() || null,
      custodianContactId: data.get("custodianContactId") ? Number(data.get("custodianContactId")) : null,
      status: data.get("status") || (data.get("custodianContactId") ? "InUse" : "InStock"),
    };
    if (!payload.itemId) {
      setMessage(assetMessage, "Choose an equipment item.", "error");
      return;
    }
    if (payload.status === "InUse" && !payload.custodianContactId) {
      setMessage(assetMessage, "Choose a custodian when the asset is In Use.", "error");
      return;
    }
    if (payload.status === "InStock") {
      payload.custodianContactId = null;
    }
    try {
      await createAsset(payload);
      setMessage(assetMessage, "Asset added.", "success");
      assetForm.reset();
      await loadAssets();
      await loadStock();
    } catch (error) {
      setMessage(assetMessage, error.message || "Failed to add asset.", "error");
    }
  });
}

function init() {
  const onReady = () => {
    loadCategories();
    loadTypes();
    loadItems();
    loadStock();
    loadLowStock();
    loadAssets();
    loadContacts();
  };
  if (!window.__ERP_USER__) {
    document.addEventListener("auth:ready", onReady, { once: true });
  } else {
    onReady();
  }
}

init();

