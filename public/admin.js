const config = window.AA_DIGITAL_CONFIG || {};
const apiBase = String(config.apiBaseUrl || "").replace(/\/+$/, "");
const setupNotice = document.querySelector("#setup-notice");
const loginPanel = document.querySelector("#login-panel");
const adminPanel = document.querySelector("#admin-panel");
const logoutButton = document.querySelector("#logout-button");
const statusMessage = document.querySelector("#status-message");
const productForm = document.querySelector("#product-form");
const imageInput = document.querySelector("#product-image");
const saveButton = document.querySelector("#save-button");
const inventoryList = document.querySelector("#inventory-list");
let sessionToken = sessionStorage.getItem("aa-admin-token") || "";
let inventory = [];
let currentImageUrl = "";
let selectedPreviewUrl = "";

function showMessage(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = `notice notice-${type}`;
  statusMessage.hidden = false;
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => { statusMessage.hidden = true; }, 6000);
}

async function api(path, { method = "GET", body, token = sessionToken, raw = false, contentType = "" } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers["Content-Type"] = "application/json";
  if (raw && contentType) headers["Content-Type"] = contentType;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body ? (raw ? body : JSON.stringify(body)) : undefined
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) clearSession();
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return result;
}

function clearSession() {
  sessionToken = "";
  sessionStorage.removeItem("aa-admin-token");
  adminPanel.hidden = true;
  logoutButton.hidden = true;
  loginPanel.hidden = false;
}

async function openAdmin() {
  try {
    inventory = await api("/api/admin/products");
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    logoutButton.hidden = false;
    drawInventory();
  } catch {
    clearSession();
  }
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
    info.textContent = `${categoryName(product.category)} · ${displayPrice(product.price_ngn)} · ${product.is_published ? "Published" : "Hidden"}`;
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
    publish.textContent = product.is_published ? "Hide" : "Publish";
    publish.className = product.is_published ? "" : "is-hidden";
    publish.dataset.action = "publish";
    publish.dataset.id = product.id;
    actions.append(edit, publish);
    row.append(image, copy, actions);
    inventoryList.append(row);
  }
}

function showImagePreview(src, name) {
  const preview = document.querySelector("#image-preview");
  document.querySelector("#preview-image").src = src;
  document.querySelector("#preview-name").textContent = name;
  preview.hidden = false;
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
  document.querySelector("#product-stock").value = product.stock_quantity;
  document.querySelector("#product-brand").value = product.brand || "";
  document.querySelector("#product-compatibility").value = product.compatibility || "";
  document.querySelector("#product-available").checked = Boolean(product.is_available);
  document.querySelector("#product-published").checked = Boolean(product.is_published);
  document.querySelector("#form-title").textContent = "Edit product";
  document.querySelector("#cancel-edit").hidden = false;
  currentImageUrl = product.image_url;
  imageInput.required = false;
  imageInput.value = "";
  showImagePreview(product.image_url, "Current product photo · choose another to replace it");
  document.querySelector("#product-name").focus();
}

async function uploadImage(file) {
  return api("/api/admin/images", { method: "POST", body: file, raw: true, contentType: file.type });
}

productForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!productForm.reportValidity()) return;
  const file = imageInput.files[0];
  if (file && (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
    showMessage("Choose a JPG, PNG or WebP image no larger than 5 MB.", "error");
    return;
  }
  saveButton.disabled = true;
  saveButton.firstChild.textContent = file ? "Uploading… " : "Saving… ";
  let uploaded = null;
  try {
    if (file) uploaded = await uploadImage(file);
    const id = document.querySelector("#product-id").value;
    const body = {
      name: document.querySelector("#product-name").value.trim(),
      category: document.querySelector("#product-category").value,
      sku: document.querySelector("#product-sku").value.trim(),
      detail: document.querySelector("#product-detail").value.trim(),
      price_ngn: document.querySelector("#product-price").value || null,
      stock_quantity: Number(document.querySelector("#product-stock").value),
      brand: document.querySelector("#product-brand").value.trim(),
      compatibility: document.querySelector("#product-compatibility").value.trim(),
      is_available: document.querySelector("#product-available").checked,
      is_published: document.querySelector("#product-published").checked,
      image_url: uploaded?.imageUrl || currentImageUrl
    };
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
      method: id ? "PATCH" : "POST", body
    });
    if (uploaded && currentImageUrl.includes("/api/images/products/")) {
      const oldKey = currentImageUrl.split("/api/images/")[1];
      if (oldKey) await api(`/api/admin/images/${encodeURIComponent(oldKey)}`, { method: "DELETE" }).catch(() => {});
    }
    clearForm();
    inventory = await api("/api/admin/products");
    drawInventory();
    showMessage("Product saved. The public catalog is updated.");
  } catch (error) {
    if (uploaded?.key) await api(`/api/admin/images/${encodeURIComponent(uploaded.key)}`, { method: "DELETE" }).catch(() => {});
    showMessage(error.message, "error");
  } finally {
    saveButton.disabled = false;
    saveButton.firstChild.textContent = "Save product ";
  }
});

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api("/api/admin/login", {
      method: "POST", token: "",
      body: {
        email: document.querySelector("#login-email").value.trim(),
        password: document.querySelector("#login-password").value
      }
    });
    sessionToken = result.token;
    sessionStorage.setItem("aa-admin-token", sessionToken);
    document.querySelector("#login-password").value = "";
    await openAdmin();
    if (sessionToken) showMessage(`Signed in as ${result.email}.`);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

inventoryList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = inventory.find(item => item.id === button.dataset.id);
  if (!product) return;
  if (button.dataset.action === "edit") {
    editProduct(product);
    return;
  }
  button.disabled = true;
  try {
    await api(`/api/admin/products/${encodeURIComponent(product.id)}`, {
      method: "PATCH", body: { ...product, is_published: !product.is_published }
    });
    inventory = await api("/api/admin/products");
    drawInventory();
    showMessage(product.is_published ? "Product hidden from the public catalog." : "Product published to the catalog.");
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, "error");
  }
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
  selectedPreviewUrl = URL.createObjectURL(file);
  showImagePreview(selectedPreviewUrl, file.name);
});
document.querySelector("#cancel-edit").addEventListener("click", clearForm);
logoutButton.addEventListener("click", () => {
  clearSession();
  showMessage("You are signed out.");
});

if (!apiBase) {
  setupNotice.hidden = false;
} else {
  loginPanel.hidden = false;
  if (sessionToken) openAdmin();
}
