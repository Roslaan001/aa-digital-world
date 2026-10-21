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
let productImages = [];
let currentImageUrl = "";
let currentVideoUrl = "";
let removeVideoRequested = false;
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

const DEFAULT_CATEGORIES = ["Charging", "Cables", "Accessories", "Gadgets"];
const STORAGE_KEY_CATEGORIES = "aa-admin-custom-categories";
let customCategories = [];
let selectedInventoryCategory = "all";

function loadStoredCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) customCategories = parsed.filter(item => typeof item === "string" && item.trim());
    }
  } catch {}
}

function saveStoredCategories() {
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(customCategories));
  } catch {}
}

function getAllCategories() {
  const set = new Set(DEFAULT_CATEGORIES);
  for (const cat of customCategories) {
    if (cat && typeof cat === "string" && cat.trim()) set.add(cat.trim());
  }
  for (const product of inventory) {
    const label = categoryLabel(product);
    if (label) set.add(label);
  }
  return Array.from(set);
}

function displayPrice(value) {
  if (value === null || value === undefined || value === "") return "Price not set";
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function categoryName(value) {
  return ({ charging: "Charging", cables: "Cables", accessories: "Accessories", gadgets: "Gadgets" })[value] || String(value || "Other").replace(/-/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function categoryLabel(product) {
  return product.category_name || categoryName(product.category);
}

function clearSession() {
  adminPanel.hidden = true;
  logoutButton.hidden = true;
  loginPanel.hidden = false;
}

function renderCategories() {
  const all = getAllCategories();
  const categoryCount = document.querySelector("#category-count");
  if (categoryCount) categoryCount.textContent = all.length;

  const categoryOptions = document.querySelector("#category-options");
  if (categoryOptions) {
    categoryOptions.replaceChildren(...all.map(val => {
      const option = document.createElement("option");
      option.value = val;
      return option;
    }));
  }

  const chips = document.querySelector("#categories-chips");
  if (chips) {
    chips.replaceChildren(...all.map(cat => {
      const count = inventory.filter(p => categoryLabel(p).toLowerCase() === cat.toLowerCase()).length;
      const chip = document.createElement("div");
      chip.className = "category-chip is-clickable";
      chip.title = `Click to set "${cat}" for product`;

      const label = document.createElement("span");
      label.textContent = cat;
      chip.append(label);

      const countBadge = document.createElement("span");
      countBadge.className = "category-chip-count";
      countBadge.textContent = count;
      chip.append(countBadge);

      const isDefault = DEFAULT_CATEGORIES.some(d => d.toLowerCase() === cat.toLowerCase());
      if (!isDefault) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "category-chip-delete";
        deleteBtn.innerHTML = "&times;";
        deleteBtn.title = count > 0 ? "Cannot delete category with products assigned" : `Delete category "${cat}"`;
        deleteBtn.addEventListener("click", e => {
          e.stopPropagation();
          if (count > 0) {
            showMessage(`Cannot remove “${cat}” because ${count} product(s) are in this category.`, "error");
            return;
          }
          customCategories = customCategories.filter(c => c.toLowerCase() !== cat.toLowerCase());
          saveStoredCategories();
          renderCategories();
          drawInventory();
          showMessage(`Category “${cat}” removed.`);
        });
        chip.append(deleteBtn);
      }

      chip.addEventListener("click", () => {
        const catInput = document.querySelector("#product-category");
        catInput.value = cat;
        catInput.focus();
      });

      return chip;
    }));
  }

  const inventoryFilter = document.querySelector("#inventory-filter");
  if (inventoryFilter) {
    const previous = selectedInventoryCategory;
    inventoryFilter.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = `All categories (${inventory.length})`;
    inventoryFilter.append(allOption);

    for (const cat of all) {
      const count = inventory.filter(p => categoryLabel(p).toLowerCase() === cat.toLowerCase()).length;
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = `${cat} (${count})`;
      inventoryFilter.append(opt);
    }
    inventoryFilter.value = all.includes(previous) ? previous : "all";
    selectedInventoryCategory = inventoryFilter.value;
  }
}

function drawInventory() {
  inventoryList.replaceChildren();
  document.querySelector("#product-count").textContent = inventory.length;

  const filtered = selectedInventoryCategory === "all"
    ? inventory
    : inventory.filter(p => categoryLabel(p).toLowerCase() === selectedInventoryCategory.toLowerCase());

  const emptyEl = document.querySelector("#inventory-empty");
  emptyEl.hidden = filtered.length > 0;
  if (filtered.length === 0 && inventory.length > 0) {
    emptyEl.textContent = "No products found in this category.";
  } else if (inventory.length === 0) {
    emptyEl.textContent = "No products yet. Add the first item using the form.";
  }

  renderCategories();

  for (const product of filtered) {
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
    const availability = product.is_available === false ? "Unavailable" : "Available";
    info.textContent = `${categoryLabel(product)} · ${displayPrice(product.price_ngn)} · ${availability} · ${published ? "Published" : "Hidden"}`;

    const stockRow = document.createElement("div");
    stockRow.className = "inventory-stock-row";
    const stockControls = document.createElement("div");
    stockControls.className = "inventory-stock-controls";

    const isUntracked = product.stock_quantity == null;
    const isOut = !isUntracked && Number(product.stock_quantity) <= 0;
    const currentQty = isUntracked ? null : Number(product.stock_quantity);

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = "stock-btn";
    decBtn.textContent = "−";
    decBtn.title = isUntracked ? "Track stock and set to 0" : "Decrease stock by 1";
    decBtn.dataset.action = "stock-dec";
    decBtn.dataset.id = product.id;

    const badge = document.createElement("span");
    badge.className = `stock-badge ${isUntracked ? "untracked" : isOut ? "out-of-stock" : "in-stock"}`;
    badge.textContent = isUntracked ? "Stock untracked" : isOut ? "Out of stock (0)" : `${currentQty} in stock`;

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.className = "stock-btn";
    incBtn.textContent = "+";
    incBtn.title = isUntracked ? "Track stock and set to 1" : "Increase stock by 1";
    incBtn.dataset.action = "stock-inc";
    incBtn.dataset.id = product.id;

    const setBtn = document.createElement("button");
    setBtn.type = "button";
    setBtn.className = "stock-btn set-btn";
    setBtn.textContent = "Set";
    setBtn.title = "Set exact stock quantity";
    setBtn.dataset.action = "stock-set";
    setBtn.dataset.id = product.id;

    stockControls.append(decBtn, badge, incBtn, setBtn);
    stockRow.append(stockControls);
    copy.append(name, info, stockRow);
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

function renderPhotoGallery() {
  const container = document.querySelector("#image-preview");
  const grid = document.querySelector("#gallery-grid");
  const countEl = document.querySelector("#photo-count");
  if (!container || !grid) return;

  if (productImages.length === 0) {
    container.hidden = true;
    imageInput.required = !document.querySelector("#product-id").value;
    return;
  }

  container.hidden = false;
  imageInput.required = false;
  if (countEl) countEl.textContent = productImages.length;

  grid.replaceChildren(...productImages.map((item, index) => {
    const card = document.createElement("div");
    card.className = `gallery-item${index === 0 ? " is-cover" : ""}`;

    const img = document.createElement("img");
    img.className = "gallery-thumb";
    img.src = item.previewUrl || item.url;
    img.alt = `Product photo ${index + 1}`;
    card.append(img);

    if (index === 0) {
      const badge = document.createElement("span");
      badge.className = "gallery-cover-badge";
      badge.textContent = "Cover";
      card.append(badge);
    }

    const actions = document.createElement("div");
    actions.className = "gallery-item-actions";

    if (index > 0) {
      const coverBtn = document.createElement("button");
      coverBtn.type = "button";
      coverBtn.className = "gallery-action-btn";
      coverBtn.textContent = "Make cover";
      coverBtn.title = "Make this the main photo";
      coverBtn.addEventListener("click", () => {
        const [chosen] = productImages.splice(index, 1);
        productImages.unshift(chosen);
        renderPhotoGallery();
      });
      actions.append(coverBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "gallery-action-btn delete-btn";
    removeBtn.textContent = "Remove";
    removeBtn.title = "Remove this photo";
    removeBtn.addEventListener("click", () => {
      if (item.previewUrl && item.file) URL.revokeObjectURL(item.previewUrl);
      productImages.splice(index, 1);
      renderPhotoGallery();
    });
    actions.append(removeBtn);

    card.append(actions);
    return card;
  }));
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
  document.querySelector("#video-preview").hidden = true;
  const previewVideo = document.querySelector("#preview-video");
  previewVideo.pause();
  previewVideo.removeAttribute("src");
  previewVideo.load();
  currentImageUrl = "";
  currentVideoUrl = "";
  removeVideoRequested = false;
  imageInput.required = true;
  imageInput.value = "";
  videoInput.value = "";
  for (const item of productImages) {
    if (item.previewUrl && item.file) URL.revokeObjectURL(item.previewUrl);
  }
  productImages = [];
  renderPhotoGallery();
  if (selectedVideoPreviewUrl) URL.revokeObjectURL(selectedVideoPreviewUrl);
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

  for (const item of productImages) {
    if (item.previewUrl && item.file) URL.revokeObjectURL(item.previewUrl);
  }
  productImages = [];
  const existingImages = Array.isArray(product.images) && product.images.length
    ? product.images
    : (product.image_url ? [product.image_url] : []);
  for (const url of existingImages) {
    productImages.push({ url, file: null, previewUrl: url });
  }
  renderPhotoGallery();

  if (currentVideoUrl) showVideoPreview(currentVideoUrl, "Current product video · choose another to replace it");
  else document.querySelector("#video-preview").hidden = true;
  document.querySelector("#product-name").focus();
}

async function openAdmin() {
  try {
    const health = await api("/api/health");
    if (!health.ok) throw new Error("The catalog service is unavailable.");
    loadStoredCategories();
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
  if (productImages.length === 0) {
    showMessage("Please choose at least one product photo.", "error");
    return;
  }
  const videoFile = videoInput.files[0];
  if (videoFile && (!VIDEO_TYPES.has(videoFile.type) || videoFile.size > MAX_VIDEO_BYTES)) {
    showMessage("Choose an MP4 or WebM video up to 25 MB.", "error");
    return;
  }
  const filesToUpload = productImages.filter(item => item.file);
  saveButton.disabled = true;
  saveButton.textContent = filesToUpload.length > 0 && videoFile
    ? `Uploading ${filesToUpload.length} photo(s) & video…`
    : filesToUpload.length > 0
    ? `Uploading ${filesToUpload.length} photo(s)…`
    : videoFile ? "Uploading video…" : "Saving product…";

  const newlyUploadedKeys = [];
  let uploadedVideo = null;
  const previousVideoUrl = currentVideoUrl;
  try {
    for (const item of productImages) {
      if (item.file) {
        const uploaded = await uploadImage(item.file);
        item.url = uploaded.imageUrl;
        item.file = null;
        newlyUploadedKeys.push(uploaded.key);
      }
    }
    if (videoFile) uploadedVideo = await uploadVideo(videoFile);

    const finalImageUrls = productImages.map(item => item.url).filter(Boolean);
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
      image_url: finalImageUrls[0] || "",
      images: finalImageUrls,
      video_url: removeVideoRequested ? null : uploadedVideo?.videoUrl || currentVideoUrl || null
    };
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
      method: id ? "PATCH" : "POST", body: product
    });
    if (previousVideoUrl && previousVideoUrl !== product.video_url) await deleteVideo(previousVideoUrl).catch(() => {});
    const enteredCategory = document.querySelector("#product-category").value.trim();
    if (enteredCategory && !getAllCategories().some(c => c.toLowerCase() === enteredCategory.toLowerCase())) {
      customCategories.push(enteredCategory);
      saveStoredCategories();
    }
    clearForm();
    inventory = await api("/api/admin/products");
    drawInventory();
    showMessage("Product saved. The live catalog is updated.");
  } catch (error) {
    for (const key of newlyUploadedKeys) {
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
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

  if (button.dataset.action === "stock-dec" || button.dataset.action === "stock-inc" || button.dataset.action === "stock-set") {
    let nextStock = product.stock_quantity == null ? null : Number(product.stock_quantity);
    if (button.dataset.action === "stock-dec") {
      if (nextStock == null) nextStock = 0;
      else if (nextStock > 0) nextStock -= 1;
      else {
        showMessage(`“${product.name}” is already out of stock.`);
        return;
      }
    } else if (button.dataset.action === "stock-inc") {
      if (nextStock == null) nextStock = 1;
      else nextStock += 1;
    } else if (button.dataset.action === "stock-set") {
      const input = window.prompt(`Enter stock quantity for “${product.name}”\n(Leave blank if not tracking quantity):`, nextStock ?? "");
      if (input === null) return;
      const trimmed = input.trim();
      if (trimmed === "") {
        nextStock = null;
      } else {
        const parsed = Number(trimmed);
        if (!Number.isInteger(parsed) || parsed < 0) {
          showMessage("Enter a whole number of 0 or more.", "error");
          return;
        }
        nextStock = parsed;
      }
    }

    button.disabled = true;
    try {
      await api(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: { ...product, stock_quantity: nextStock }
      });
      product.stock_quantity = nextStock;
      drawInventory();
      const stockMsg = nextStock == null ? "Stock is no longer tracked." : nextStock === 0 ? "Marked as out of stock." : `Stock updated to ${nextStock}.`;
      showMessage(`“${product.name}”: ${stockMsg}`);
    } catch (error) {
      button.disabled = false;
      showMessage(error.message, "error");
    }
    return;
  }

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
  const files = Array.from(imageInput.files || []);
  if (!files.length) return;

  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
      showMessage(`“${file.name}” exceeds 5 MB or is not a JPG, PNG or WebP image.`, "error");
      continue;
    }
    const previewUrl = URL.createObjectURL(file);
    productImages.push({ url: "", file, previewUrl });
  }
  imageInput.value = "";
  renderPhotoGallery();
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
    categories: getAllCategories(),
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
    if (Array.isArray(backup.categories)) {
      for (const cat of backup.categories) {
        if (typeof cat === "string" && cat.trim() && !customCategories.some(c => c.toLowerCase() === cat.trim().toLowerCase())) {
          customCategories.push(cat.trim());
        }
      }
      saveStoredCategories();
    }
    clearForm();
    inventory = restored;
    drawInventory();
    showMessage(`Catalog restored from ${file.name}.`);
  } catch (error) {
    showMessage(error.message || "Could not read this backup file.", "error");
  }
});

const categoryForm = document.querySelector("#category-form");
if (categoryForm) {
  categoryForm.addEventListener("submit", event => {
    event.preventDefault();
    const input = document.querySelector("#new-category-name");
    const name = input.value.trim();
    if (!name) return;
    if (name.length < 2 || name.length > 40) {
      showMessage("Enter a category name between 2 and 40 characters.", "error");
      return;
    }
    const existing = getAllCategories();
    if (existing.some(c => c.toLowerCase() === name.toLowerCase())) {
      showMessage(`Category “${name}” already exists.`, "error");
      return;
    }
    customCategories.push(name);
    saveStoredCategories();
    input.value = "";
    renderCategories();
    document.querySelector("#product-category").value = name;
    showMessage(`Category “${name}” added. You can now use it for products.`);
  });
}

document.querySelector("#inventory-filter")?.addEventListener("change", event => {
  selectedInventoryCategory = event.target.value;
  drawInventory();
});

document.querySelector("#form-stock-dec")?.addEventListener("click", () => {
  const input = document.querySelector("#product-stock");
  const current = input.value === "" ? 0 : Number(input.value);
  input.value = Math.max(0, current - 1);
});

document.querySelector("#form-stock-inc")?.addEventListener("click", () => {
  const input = document.querySelector("#product-stock");
  const current = input.value === "" ? 0 : Number(input.value);
  input.value = current + 1;
});

document.querySelectorAll(".stock-preset-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.querySelector("#product-stock");
    const preset = btn.dataset.preset;
    if (preset === "0") {
      input.value = "0";
    } else if (preset.startsWith("+")) {
      const add = Number(preset.slice(1));
      const current = input.value === "" ? 0 : Number(input.value);
      input.value = current + add;
    }
  });
});

logoutButton.addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST" }); } catch {}
  inventory = [];
  clearForm();
  clearSession();
  showMessage("You are signed out.");
});
openAdmin();
