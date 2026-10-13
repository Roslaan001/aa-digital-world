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

function render() {
  const term = search.value.trim().toLowerCase();
  const published = products.filter(product => product.is_published !== false && product.is_published !== 0);
  const visible = published.filter(product => (activeFilter === "all" || product.category === activeFilter) && `${product.name} ${product.detail} ${product.tag || ""}`.toLowerCase().includes(term));
  document.querySelector("#all-count").textContent = published.length;
  for (const category of ["charging", "cables", "accessories"]) {
    document.querySelector(`#${category}-count`).textContent = published.filter(product => product.category === category).length;
  }
  grid.innerHTML = visible.map((product, index) => {
    const outOfStock = product.stock_quantity !== null && product.stock_quantity !== undefined && Number(product.stock_quantity) <= 0;
    const available = product.is_available !== false && !outOfStock;
    const statusMarkup = outOfStock
      ? '<p class="product-status is-unavailable">Out of stock</p>'
      : !available ? '<p class="product-status is-unavailable">Currently unavailable</p>' : "";
    const price = productPrice(product.price_ngn);
    const link = whatsappUrl(product.name, !available);
    return `
    <article class="product-card" style="animation-delay:${Math.min(index * 35, 210)}ms">
      <a class="product-image" href="${link}" target="_blank" rel="noopener" aria-label="Ask about ${escapeHtml(product.name)} on WhatsApp">
        <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">
        <span class="product-tag">${escapeHtml(product.tag || ({charging:"Charging",cables:"Cables",accessories:"Accessories"}[product.category] || "Accessories"))}</span><span class="product-arrow" aria-hidden="true">↗</span>
      </a>
      <div class="product-info"><div><h3 class="product-title">${escapeHtml(product.name)}</h3><p class="product-description">${escapeHtml(product.detail)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</p>${price ? `<p class="product-price">${price}</p>` : ""}${statusMarkup}</div><a class="product-order${available ? "" : " is-unavailable"}" href="${link}" target="_blank" rel="noopener">${available ? "Order ↗" : "Restock info ↗"}</a></div>
    </article>`;
  }).join("");
  empty.hidden = visible.length > 0;
}

document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  const previous = document.querySelector(".filter.active");
  previous.classList.remove("active");
  previous.setAttribute("aria-pressed", "false");
  button.classList.add("active");
  button.setAttribute("aria-pressed", "true");
  activeFilter = button.dataset.filter;
  render();
}));
search.addEventListener("input", render);
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
