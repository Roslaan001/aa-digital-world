let products = [];
const grid = document.querySelector("#product-grid");
const search = document.querySelector("#product-search");
const empty = document.querySelector("#empty-state");
let activeFilter = "all";

function whatsappUrl(name, restock = false) {
  const message = restock
    ? `Hi AA Digital World! I'm interested in the ${name}. Please let me know if it is available or when it is back in stock.`
    : `Hi AA Digital World! I'm interested in the ${name}. Is it available? I'd like to order.`;
  return `https://wa.me/2348025816245?text=${encodeURIComponent(message)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function productPrice(value) {
  if (value === null || value === undefined || value === "") return "";
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function categoryName(value) {
  return ({ charging: "Charging", cables: "Cables", accessories: "Accessories", gadgets: "Gadgets" })[value]
    || String(value || "Other").replace(/-/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function refreshCategoryFilters(published) {
  const filters = document.querySelector(".filters");
  const categories = new Map();
  for (const product of published) {
    const key = product.category;
    if (!key) continue;
    const category = categories.get(key) || { label: product.category_name || categoryName(key), count: 0 };
    category.count += 1;
    categories.set(key, category);
  }

  filters.querySelectorAll("[data-custom-filter]").forEach(button => button.remove());
  for (const [key, category] of categories) {
    if (["charging", "cables", "accessories"].includes(key)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter";
    button.dataset.filter = key;
    button.dataset.customFilter = "true";
    button.setAttribute("aria-pressed", "false");
    button.append(document.createTextNode(category.label));
    button.append(document.createElement("span"));
    filters.append(button);
  }

  for (const button of filters.querySelectorAll(".filter")) {
    const count = button.querySelector("span");
    if (count) count.textContent = button.dataset.filter === "all"
      ? published.length
      : categories.get(button.dataset.filter)?.count || 0;
  }
  if (activeFilter !== "all" && !categories.has(activeFilter)) activeFilter = "all";
  for (const button of filters.querySelectorAll(".filter")) {
    const active = button.dataset.filter === activeFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function render() {
  const term = search.value.trim().toLowerCase();
  const published = products.filter(product => product.is_published !== false && product.is_published !== 0);
  refreshCategoryFilters(published);
  const visible = published.filter(product => (activeFilter === "all" || product.category === activeFilter) && `${product.name} ${product.detail} ${product.tag || ""}`.toLowerCase().includes(term));
  document.querySelector("#all-count").textContent = published.length;
  grid.innerHTML = visible.map((product, index) => {
    const outOfStock = product.stock_quantity !== null && product.stock_quantity !== undefined && Number(product.stock_quantity) <= 0;
    const available = product.is_available !== false && !outOfStock;
    const statusMarkup = outOfStock
      ? '<p class="product-status is-unavailable">Out of stock</p>'
      : !available ? '<p class="product-status is-unavailable">Currently unavailable</p>' : "";
    const price = productPrice(product.price_ngn);
    const link = whatsappUrl(product.name, !available);
    const tag = escapeHtml(product.tag || ({charging:"Charging",cables:"Cables",accessories:"Accessories",gadgets:"Gadgets"}[product.category] || categoryName(product.category)));
    const images = Array.isArray(product.images) && product.images.length
      ? product.images
      : (product.image_url ? [product.image_url] : []);
    const coverImage = images[0] || product.image_url;
    const mediaMarkup = product.video_url
      ? `<div class="product-image product-video-frame"><video class="product-video" controls playsinline preload="metadata" poster="${escapeHtml(coverImage)}" aria-label="Video of ${escapeHtml(product.name)}"><source src="${escapeHtml(product.video_url)}" type="${product.video_url.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4"}"></video><span class="product-tag">${tag}</span></div>`
      : images.length > 1
      ? `<div class="product-image product-gallery" data-index="0"><a class="product-gallery-link" href="${link}" target="_blank" rel="noopener" aria-label="Ask about ${escapeHtml(product.name)} on WhatsApp">${images.map((imgUrl, i) => `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" class="gallery-slide${i === 0 ? " is-active" : ""}">`).join("")}<span class="product-tag">${tag}</span><span class="product-arrow" aria-hidden="true">↗</span></a><div class="product-gallery-dots">${images.map((_, i) => `<button type="button" class="gallery-dot${i === 0 ? " is-active" : ""}" data-slide="${i}" aria-label="Photo ${i + 1}"></button>`).join("")}</div><button type="button" class="gallery-nav-btn prev-btn" aria-label="Previous photo">‹</button><button type="button" class="gallery-nav-btn next-btn" aria-label="Next photo">›</button></div>`
      : `<a class="product-image" href="${link}" target="_blank" rel="noopener" aria-label="Ask about ${escapeHtml(product.name)} on WhatsApp"><img src="${escapeHtml(coverImage)}" alt="${escapeHtml(product.name)}" loading="lazy"><span class="product-tag">${tag}</span><span class="product-arrow" aria-hidden="true">↗</span></a>`;
    return `
    <article class="product-card" style="animation-delay:${Math.min(index * 35, 210)}ms">
      ${mediaMarkup}
      <div class="product-info"><div><h3 class="product-title">${escapeHtml(product.name)}</h3><p class="product-description">${escapeHtml(product.detail)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</p>${price ? `<p class="product-price">${price}</p>` : ""}${statusMarkup}</div><a class="product-order${available ? "" : " is-unavailable"}" href="${link}" target="_blank" rel="noopener">${available ? "Order ↗" : "Restock info ↗"}</a></div>
    </article>`;
  }).join("");
  empty.hidden = visible.length > 0;
}

document.querySelector(".filters").addEventListener("click", event => {
  const button = event.target.closest(".filter");
  if (!button) return;
  activeFilter = button.dataset.filter;
  render();
});
search.addEventListener("input", render);
grid.addEventListener("click", event => {
  const dot = event.target.closest(".gallery-dot");
  const navBtn = event.target.closest(".gallery-nav-btn");
  if (!dot && !navBtn) return;
  event.preventDefault();
  event.stopPropagation();

  const gallery = event.target.closest(".product-gallery");
  if (!gallery) return;
  const slides = Array.from(gallery.querySelectorAll(".gallery-slide"));
  const dots = Array.from(gallery.querySelectorAll(".gallery-dot"));
  if (!slides.length) return;

  let currentIndex = Number(gallery.dataset.index || 0);
  if (dot) {
    currentIndex = Number(dot.dataset.slide);
  } else if (navBtn.classList.contains("prev-btn")) {
    currentIndex = (currentIndex - 1 + slides.length) % slides.length;
  } else if (navBtn.classList.contains("next-btn")) {
    currentIndex = (currentIndex + 1) % slides.length;
  }

  gallery.dataset.index = currentIndex;
  slides.forEach((slide, i) => slide.classList.toggle("is-active", i === currentIndex));
  dots.forEach((d, i) => d.classList.toggle("is-active", i === currentIndex));
});
document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault(); search.focus();
  }
  if (event.key === "Escape") search.blur();
});
const menuToggle = document.querySelector(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  document.querySelector(".site-header nav").classList.toggle("open", open);
});
document.querySelectorAll(".site-header nav a").forEach(link => link.addEventListener("click", () => {
  document.querySelector(".site-header nav").classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
}));
document.querySelector("#year").textContent = new Date().getFullYear();
render();

async function loadCatalog() {
  try {
    let response = await fetch("/api/products", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) response = await fetch("catalog.json", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Catalog file is not available.");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Catalog file is invalid.");
    products = data;
    render();
  } catch (error) {
    console.error("Could not load the product catalog.", error);
  }
}
loadCatalog();
