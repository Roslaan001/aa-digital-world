const fallbackProducts = [
  { name: "Everyday charging set", category: "charging", tag: "Charging", detail: "A handy mix of chargers and cables", image: "product-11.jpeg" },
  { name: "Cable colour collection", category: "cables", tag: "Cables", detail: "Cable options in a range of colours", image: "product-08.jpeg" },
  { name: "Phone accessory bundle", category: "accessories", tag: "Popular pick", detail: "A little bit of everything for your phone", image: "product-02.jpeg" },
  { name: "Charging & adapter picks", category: "charging", tag: "Adapters", detail: "Adapters and charging accessories", image: "product-03.jpeg" },
  { name: "Cable & connector mix", category: "cables", tag: "Cables", detail: "Different cable and connector styles", image: "product-10.jpeg" },
  { name: "Mobile essentials bundle", category: "accessories", tag: "Everyday", detail: "Useful add-ons for your everyday carry", image: "product-05.jpeg" },
  { name: "Power & charging picks", category: "charging", tag: "Charging", detail: "Chargers and leads for daily use", image: "product-06.jpeg" },
  { name: "Cable essentials", category: "cables", tag: "Cables", detail: "Browse the available cable selection", image: "product-09.jpeg" },
  { name: "Handy gadget selection", category: "accessories", tag: "Gadgets", detail: "Small tech finds for home and travel", image: "product-01.jpeg" },
  { name: "Adapter & audio accessories", category: "accessories", tag: "Accessories", detail: "Ask which options work with your device", image: "product-07.jpeg" },
  { name: "Phone accessories, assorted", category: "accessories", tag: "Explore", detail: "More useful extras in one collection", image: "product-04.jpeg" }
];

let products = fallbackProducts;
const grid = document.querySelector("#product-grid");
const search = document.querySelector("#product-search");
const empty = document.querySelector("#empty-state");
let activeFilter = "all";

function whatsappUrl(name) {
  return `https://wa.me/2348025816245?text=${encodeURIComponent(`Hi AA Digital World! I'm interested in the ${name}. Is it available, and what is the price?`)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function productPrice(value) {
  if (value === null || value === undefined || value === "") return "Ask for price";
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function render() {
  const term = search.value.trim().toLowerCase();
  const visible = products.filter(product => (activeFilter === "all" || product.category === activeFilter) && `${product.name} ${product.detail} ${product.tag}`.toLowerCase().includes(term));
  const count = document.querySelector("#total-count");
  if (count) count.textContent = products.length;
  grid.innerHTML = visible.map((product, index) => `
    <article class="product-card" style="animation-delay:${Math.min(index * 35, 210)}ms">
      <a class="product-image" href="${whatsappUrl(product.name)}" target="_blank" rel="noopener" aria-label="Ask about ${escapeHtml(product.name)} on WhatsApp">
        <img src="${escapeHtml(product.image_url || `assets/${product.image}`)}" alt="${escapeHtml(product.name)}" loading="lazy">
        <span class="product-tag">${escapeHtml(product.tag || ({charging:"Charging",cables:"Cables",accessories:"Accessories"}[product.category] || "Accessories"))}</span><span class="product-arrow" aria-hidden="true">↗</span>
      </a>
      <div class="product-info"><div><h3 class="product-title">${escapeHtml(product.name)}</h3><p class="product-description">${escapeHtml(product.detail)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</p><p class="product-price">${productPrice(product.price_ngn)}</p></div><a class="product-order" href="${whatsappUrl(product.name)}" target="_blank" rel="noopener">Ask us ↗</a></div>
    </article>`).join("");
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

async function loadLiveCatalog() {
  const base = String(window.AA_DIGITAL_CONFIG?.apiBaseUrl || "").replace(/\/+$/, "");
  if (!base) return;
  try {
    const response = await fetch(`${base}/api/products`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Catalog service is not available.");
    const data = await response.json();
    if (Array.isArray(data)) products = data;
    render();
  } catch (error) {
    console.info("Showing the saved catalog while the online catalog reconnects.");
  }
}
loadLiveCatalog();
