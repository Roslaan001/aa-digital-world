const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const loginPanel = document.querySelector("#login-panel");
const adminPanel = document.querySelector("#admin-panel");
const logoutButton = document.querySelector("#logout-button");
const statusMessage = document.querySelector("#status-message");
const productForm = document.querySelector("#product-form");
const imageInput = document.querySelector("#product-image");
const videoInput = document.querySelector("#product-video");
const saveButton = document.querySelector("#save-button");
const inventoryList = document.querySelector("#inventory-list");
let inventory = [];
let currentImageUrl = "";
let currentVideoUrl = "";
let removeVideoRequested = false;
let selectedPreviewUrl = "";
let selectedVideoPreviewUrl = "";

function showMessage(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = `notice notice-${type}`;
  statusMessage.hidden = false;
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => { statusMessage.hidden = true; }, 6500);
}

async function api(path, { method = "GET", body, raw = false, contentType = "" } = {}) {
  const headers = {};
  if (body && !raw) headers["Content-Type"] = "application/json";
  if (raw && contentType) headers["Content-Type"] = contentType;
  const response = await fetch(path, {
    method,
    headers,
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    credentials: "same-origin"
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function displayPrice(value) {
  if (value === null || value === undefined || value === "") return "Price not set";
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function categoryName(value) {
  return ({ charging: "Charging", cables: "Cables", accessories: "Accessories" })[value] || String(value || "Other").replace(/-/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function categoryLabel(product) {
  return product.category_name || categoryName(product.category);
}

function clearSession() {
  adminPanel.hidden = true;
  logoutButton.hidden = true;
  loginPanel.hidden = false;
}

function drawInventory() {
  inventoryList.replaceChildren();
  document.querySelector("#product-count").textContent = inventory.length;
  document.querySelector("#inventory-empty").hidden = inventory.length > 0;
  const categoryOptions = document.querySelector("#category-options");
  const categoryValues = new Set(["Charging", "Cables", "Accessories"]);
  for (const product of inventory) categoryValues.add(categoryLabel(product));
  categoryOptions.replaceChildren(...[...categoryValues].map(value => {
    const option = document.createElement("option");
    option.value = value;
    return option;
  }));
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
    const published = Boolean(product.is_published);
    const stock = product.stock_quantity == null ? "Stock not tracked" : product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : "Out of stock";
    const availability = product.is_available === false ? "Unavailable" : "Available";
    info.textContent = `${categoryLabel(product)} · ${displayPrice(product.price_ngn)} · ${stock} · ${availability} · ${published ? "Published" : "Hidden"}`;
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
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.className = "delete-product";
    remove.dataset.action = "delete";
    remove.dataset.id = product.id;
    actions.append(edit, publish, remove);
    row.append(image, copy, actions);
    inventoryList.append(row);
  }
}

function showImagePreview(src, name) {
  document.querySelector("#preview-image").src = src;
  document.querySelector("#preview-name").textContent = name;
  document.querySelector("#image-preview").hidden = false;
}

function showVideoPreview(src, name) {
  const video = document.querySelector("#preview-video");
  video.src = src;
  video.load();
  document.querySelector("#video-preview-name").textContent = name;
  document.querySelector("#video-preview").hidden = false;
}

function clearForm() {
  productForm.reset();
  document.querySelector("#product-id").value = "";
  document.querySelector("#product-stock").value = "";
  document.querySelector("#product-available").checked = true;
  document.querySelector("#product-published").checked = true;
  document.querySelector("#form-title").textContent = "Add a product";
  document.querySelector("#cancel-edit").hidden = true;
  document.querySelector("#image-preview").hidden = true;
  document.querySelector("#video-preview").hidden = true;
  const previewVideo = document.querySelector("#preview-video");
  previewVideo.pause();
  previewVideo.removeAttribute("src");
  previewVideo.load();
  currentImageUrl = "";
  currentVideoUrl = "";
  removeVideoRequested = false;
  imageInput.required = true;
  videoInput.value = "";
  if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
  if (selectedVideoPreviewUrl) URL.revokeObjectURL(selectedVideoPreviewUrl);
  selectedPreviewUrl = "";
  selectedVideoPreviewUrl = "";
}

function editProduct(product) {
  document.querySelector("#product-id").value = product.id;
  document.querySelector("#product-name").value = product.name;
  document.querySelector("#product-category").value = categoryLabel(product);
  document.querySelector("#product-sku").value = product.sku || "";
  document.querySelector("#product-detail").value = product.detail;
  document.querySelector("#product-price").value = product.price_ngn ?? "";
  document.querySelector("#product-stock").value = product.stock_quantity ?? "";
  document.querySelector("#product-brand").value = product.brand || "";
  document.querySelector("#product-compatibility").value = product.compatibility || "";
  document.querySelector("#product-available").checked = Boolean(product.is_available);
  document.querySelector("#product-published").checked = Boolean(product.is_published);
  document.querySelector("#form-title").textContent = "Edit product";
  document.querySelector("#cancel-edit").hidden = false;
  currentImageUrl = product.image_url;
  currentVideoUrl = product.video_url || "";
  removeVideoRequested = false;
  imageInput.required = false;
  imageInput.value = "";
  showImagePreview(product.image_url, "Current photo · choose another to replace it");
  if (currentVideoUrl) showVideoPreview(currentVideoUrl, "Current product video · choose another to replace it");
  else document.querySelector("#video-preview").hidden = true;
  document.querySelector("#product-name").focus();
}

async function openAdmin() {
  try {
    const health = await api("/api/health");
    if (!health.ok) throw new Error("The catalog service is unavailable.");
    inventory = await api("/api/admin/products");
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    logoutButton.hidden = false;
    drawInventory();
  } catch (error) {
    clearSession();
    if (error.message.includes("Sign in") || error.message.includes("session has expired")) return;
    loginPanel.hidden = true;
    adminPanel.hidden = true;
    logoutButton.hidden = true;
    const message = location.hostname.endsWith(".github.io")
      ? "Catalog administration is only available on the Cloudflare Pages site. This static GitHub Pages copy cannot sign in or upload products."
      : "Catalog administration is not ready on this site. Check the Pages Function and R2 setup, then redeploy.";
    showMessage(message, "error");
  }
}

async function uploadImage(file) {
  return api("/api/admin/images", { method: "POST", body: file, raw: true, contentType: file.type });
}

async function uploadVideo(file) {
  return api("/api/admin/videos", { method: "POST", body: file, raw: true, contentType: file.type });
}

async function deleteVideo(videoUrl) {
  if (!videoUrl) return;
  const path = new URL(videoUrl, location.origin).pathname;
  const prefix = "/api/videos/";
  if (!path.startsWith(prefix)) return;
  const key = path.slice(prefix.length).split("/").map(encodeURIComponent).join("/");
  await api(`/api/admin/videos/${key}`, { method: "DELETE" });
}

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: {
        email: document.querySelector("#login-email").value.trim(),
        password: document.querySelector("#login-password").value
      }
    });
    document.querySelector("#login-password").value = "";
    await openAdmin();
    if (!adminPanel.hidden) showMessage(`Signed in as ${result.email}.`);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

productForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!productForm.reportValidity()) return;
  const file = imageInput.files[0];
  const videoFile = videoInput.files[0];
  if (file && (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES)) {
    showMessage("Choose a JPG, PNG or WebP photo up to 5 MB.", "error");
    return;
  }
  if (videoFile && (!VIDEO_TYPES.has(videoFile.type) || videoFile.size > MAX_VIDEO_BYTES)) {
    showMessage("Choose an MP4 or WebM video up to 25 MB.", "error");
    return;
  }
  saveButton.disabled = true;
  saveButton.textContent = file && videoFile ? "Uploading media…" : file ? "Uploading photo…" : videoFile ? "Uploading video…" : "Saving product…";
  let uploaded = null;
  let uploadedVideo = null;
  const previousVideoUrl = currentVideoUrl;
  try {
    if (file) uploaded = await uploadImage(file);
    if (videoFile) uploadedVideo = await uploadVideo(videoFile);
    const id = document.querySelector("#product-id").value;
    const product = {
      name: document.querySelector("#product-name").value.trim(),
      category: document.querySelector("#product-category").value,
      category_name: document.querySelector("#product-category").value.trim(),
      sku: document.querySelector("#product-sku").value.trim(),
      detail: document.querySelector("#product-detail").value.trim(),
      price_ngn: document.querySelector("#product-price").value || null,
      stock_quantity: document.querySelector("#product-stock").value === "" ? null : Number(document.querySelector("#product-stock").value),
      brand: document.querySelector("#product-brand").value.trim(),
      compatibility: document.querySelector("#product-compatibility").value.trim(),
      is_available: document.querySelector("#product-available").checked,
      is_published: document.querySelector("#product-published").checked,
      image_url: uploaded?.imageUrl || currentImageUrl,
      video_url: removeVideoRequested ? null : uploadedVideo?.videoUrl || currentVideoUrl || null
    };
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
      method: id ? "PATCH" : "POST", body: product
    });
    if (uploaded && currentImageUrl.startsWith("/api/images/")) {
      const oldKey = currentImageUrl.slice("/api/images/".length);
      await api(`/api/admin/images/${oldKey.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" }).catch(() => {});
    }
    if (previousVideoUrl && previousVideoUrl !== product.video_url) await deleteVideo(previousVideoUrl).catch(() => {});
    clearForm();
    inventory = await api("/api/admin/products");
    drawInventory();
    showMessage("Product saved. The live catalog is updated.");
  } catch (error) {
    if (uploaded?.key) {
      const encodedKey = uploaded.key.split("/").map(encodeURIComponent).join("/");
      await api(`/api/admin/images/${encodedKey}`, { method: "DELETE" }).catch(() => {});
    }
    if (uploadedVideo?.key) await deleteVideo(uploadedVideo.videoUrl).catch(() => {});
    showMessage(error.message, "error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save product ↗";
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
  if (button.dataset.action === "delete") {
    if (!window.confirm(`Delete “${product.name}” from the catalog? This cannot be undone.`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      if (document.querySelector("#product-id").value === product.id) clearForm();
      inventory = await api("/api/admin/products");
      drawInventory();
      showMessage(`“${product.name}” was deleted from the catalog.`);
    } catch (error) {
      button.disabled = false;
      showMessage(error.message, "error");
    }
    return;
  }
  button.disabled = true;
  try {
    await api(`/api/admin/products/${encodeURIComponent(product.id)}`, {
      method: "PATCH", body: { ...product, is_published: !product.is_published }
    });
    inventory = await api("/api/admin/products");
    drawInventory();
    showMessage(product.is_published ? "Product hidden from the public catalog." : "Product shown in the public catalog.");
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
videoInput.addEventListener("change", () => {
  const file = videoInput.files[0];
  if (!file) return;
  if (!VIDEO_TYPES.has(file.type) || file.size > MAX_VIDEO_BYTES) {
    videoInput.value = "";
    showMessage("Choose an MP4 or WebM video up to 25 MB.", "error");
    return;
  }
  if (selectedVideoPreviewUrl) URL.revokeObjectURL(selectedVideoPreviewUrl);
  selectedVideoPreviewUrl = URL.createObjectURL(file);
  removeVideoRequested = false;
  showVideoPreview(selectedVideoPreviewUrl, file.name);
});
document.querySelector("#remove-video").addEventListener("click", () => {
  const previewVideo = document.querySelector("#preview-video");
  previewVideo.pause();
  previewVideo.removeAttribute("src");
  previewVideo.load();
  document.querySelector("#video-preview").hidden = true;
  videoInput.value = "";
  removeVideoRequested = true;
  if (selectedVideoPreviewUrl) URL.revokeObjectURL(selectedVideoPreviewUrl);
  selectedVideoPreviewUrl = "";
  showMessage("Product video will be removed when you save this item.");
});
document.querySelector("#cancel-edit").addEventListener("click", clearForm);
document.querySelector("#export-catalog").addEventListener("click", () => {
  const backup = {
    format: "aa-digital-world-catalog",
    version: 1,
    exported_at: new Date().toISOString(),
    products: inventory
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aa-digital-world-catalog-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("Catalog backup downloaded.");
});

document.querySelector("#restore-catalog").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showMessage("Choose a catalog backup smaller than 5 MB.", "error");
    return;
  }
  try {
    const backup = JSON.parse(await file.text());
    if (backup.format !== "aa-digital-world-catalog" || backup.version !== 1 || !Array.isArray(backup.products)) {
      throw new Error("This is not an AA Digital World catalog backup.");
    }
    if (!window.confirm(`Restore ${backup.products.length} products? This replaces the current live catalog.`)) return;
    const restored = await api("/api/admin/products", { method: "PUT", body: backup });
    clearForm();
    inventory = restored;
    drawInventory();
    showMessage(`Catalog restored from ${file.name}.`);
  } catch (error) {
    showMessage(error.message || "Could not read this backup file.", "error");
  }
});

logoutButton.addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST" }); } catch {}
  inventory = [];
  clearForm();
  clearSession();
  showMessage("You are signed out.");
});
openAdmin();
