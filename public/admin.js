const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const statusMessage = document.querySelector("#status-message");
const productForm = document.querySelector("#product-form");
const imageInput = document.querySelector("#product-image");
const saveButton = document.querySelector("#save-button");
const inventoryList = document.querySelector("#inventory-list");
let inventory = [];
let currentImageUrl = "";
let selectedPreviewUrl = "";

function showMessage(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = `notice notice-${type}`;
  statusMessage.hidden = false;
}

function displayPrice(value) {
  if (value === null || value === undefined || value === "") return "Ask for price";
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function categoryName(value) {
  return ({ charging: "Charging", cables: "Cables", accessories: "Accessories" })[value] || "Accessories";
}

function drawInventory() {
  inventoryList.replaceChildren();
  document.querySelector("#product-count").textContent = inventory.length;
  document.querySelector("#inventory-empty").hidden = inventory.length > 0;
  for (const product of inventory) {
    const row = document.createElement("article");
    row.className = "inventory-item";
    const image = document.createElement("img");
    image.src = product.image_url;
    image.alt = "";
    image.loading = "lazy";
    const copy = document.createElement("div");
    copy.className = "inventory-copy";
    const name = document.createElement("strong");
    name.textContent = product.name;
    const info = document.createElement("small");
    const published = product.is_published !== false && product.is_published !== 0;
    info.textContent = `${categoryName(product.category)} · ${displayPrice(product.price_ngn)} · ${published ? "Published" : "Hidden"}`;
    copy.append(name, info);
    const actions = document.createElement("div");
    actions.className = "inventory-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.dataset.action = "edit";
    edit.dataset.id = product.id;
    const publish = document.createElement("button");
    publish.type = "button";
    publish.textContent = published ? "Hide" : "Show";
    publish.className = published ? "" : "is-hidden";
    publish.dataset.action = "publish";
    publish.dataset.id = product.id;
    actions.append(edit, publish);
    row.append(image, copy, actions);
    inventoryList.append(row);
  }
}

function showImagePreview(src, name) {
  document.querySelector("#preview-image").src = src;
  document.querySelector("#preview-name").textContent = name;
  document.querySelector("#image-preview").hidden = false;
}

function clearForm() {
  productForm.reset();
  document.querySelector("#product-id").value = "";
  document.querySelector("#product-stock").value = "1";
  document.querySelector("#product-available").checked = true;
  document.querySelector("#product-published").checked = true;
  document.querySelector("#form-title").textContent = "Add a product";
  document.querySelector("#cancel-edit").hidden = true;
  document.querySelector("#image-preview").hidden = true;
  currentImageUrl = "";
  imageInput.required = true;
  if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
  selectedPreviewUrl = "";
}

function editProduct(product) {
  document.querySelector("#product-id").value = product.id;
  document.querySelector("#product-name").value = product.name;
  document.querySelector("#product-category").value = product.category;
  document.querySelector("#product-sku").value = product.sku || "";
  document.querySelector("#product-detail").value = product.detail;
  document.querySelector("#product-price").value = product.price_ngn ?? "";
  document.querySelector("#product-stock").value = product.stock_quantity ?? 0;
  document.querySelector("#product-brand").value = product.brand || "";
  document.querySelector("#product-compatibility").value = product.compatibility || "";
  document.querySelector("#product-available").checked = product.is_available !== false && product.is_available !== 0;
  document.querySelector("#product-published").checked = product.is_published !== false && product.is_published !== 0;
  document.querySelector("#form-title").textContent = "Edit product";
  document.querySelector("#cancel-edit").hidden = false;
  currentImageUrl = product.image_url;
  imageInput.required = false;
  imageInput.value = "";
  showImagePreview(product.image_url, "Current photo · choose another to replace it");
  document.querySelector("#product-name").focus();
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(new Error("Could not read that photo.")), { once: true });
    reader.readAsDataURL(file);
  });
}

async function loadCatalog(confirmDiscard = true) {
  if (confirmDiscard && !window.confirm("Reload the published catalog? Any edits in this tab will be lost.")) return;
  try {
    const response = await fetch(`catalog.json?reload=${Date.now()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("The published catalog could not be loaded.");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("The published catalog file is not a valid product list.");
    inventory = data;
    clearForm();
    drawInventory();
    showMessage("Loaded the published catalog. Your edits are only a draft until you download and publish the file.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function exportCatalog() {
  const blob = new Blob([`${JSON.stringify(inventory, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "catalog.json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("Downloaded catalog.json. Replace public/catalog.json in GitHub to publish these changes.");
}

productForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!productForm.reportValidity()) return;
  const file = imageInput.files[0];
  if (file && (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES)) {
    showMessage("Choose a JPG, PNG or WebP photo up to 2 MB.", "error");
    return;
  }
  saveButton.disabled = true;
  saveButton.textContent = file ? "Reading photo…" : "Saving draft…";
  try {
    const id = document.querySelector("#product-id").value;
    const existing = inventory.find(product => product.id === id);
    const product = {
      id: id || (crypto.randomUUID ? crypto.randomUUID() : `product-${Date.now()}`),
      name: document.querySelector("#product-name").value.trim(),
      category: document.querySelector("#product-category").value,
      tag: categoryName(document.querySelector("#product-category").value),
      sku: document.querySelector("#product-sku").value.trim() || null,
      detail: document.querySelector("#product-detail").value.trim(),
      brand: document.querySelector("#product-brand").value.trim() || null,
      compatibility: document.querySelector("#product-compatibility").value.trim() || null,
      price_ngn: document.querySelector("#product-price").value === "" ? null : Number(document.querySelector("#product-price").value),
      stock_quantity: Number(document.querySelector("#product-stock").value),
      is_available: document.querySelector("#product-available").checked,
      is_published: document.querySelector("#product-published").checked,
      image_url: file ? await readImage(file) : currentImageUrl,
      created_at: existing?.created_at || new Date().toISOString()
    };
    if (id) inventory = inventory.map(item => item.id === id ? product : item);
    else inventory.unshift(product);
    clearForm();
    drawInventory();
    showMessage("Saved to this tab’s draft. Download catalog.json when you’re ready to publish.");
  } catch (error) {
    showMessage(error.message || "Could not save the product draft.", "error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save to draft ↗";
  }
});

inventoryList.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = inventory.find(item => item.id === button.dataset.id);
  if (!product) return;
  if (button.dataset.action === "edit") {
    editProduct(product);
    return;
  }
  const published = product.is_published !== false && product.is_published !== 0;
  product.is_published = !published;
  drawInventory();
  showMessage(published ? "Product hidden in this draft." : "Product shown in this draft.");
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
  selectedPreviewUrl = URL.createObjectURL(file);
  showImagePreview(selectedPreviewUrl, file.name);
});
document.querySelector("#cancel-edit").addEventListener("click", clearForm);
document.querySelector("#export-button").addEventListener("click", exportCatalog);
document.querySelector("#reload-button").addEventListener("click", () => loadCatalog(true));
loadCatalog(false);
