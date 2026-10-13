const CATALOG_KEY = "catalog.json";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const STANDARD_CATEGORIES = new Map([["charging", "Charging"], ["cables", "Cables"], ["accessories", "Accessories"]]);
const SESSION_COOKIE = "aa-admin-session";
const SESSION_SECONDS = 8 * 60 * 60;
const OLD_STARTER_PRODUCTS = new Map([
  ["starter-01", ["Everyday charging set", "A handy mix of chargers and cables"]],
  ["starter-02", ["Cable colour collection", "Cable options in a range of colours"]],
  ["starter-03", ["Phone accessory bundle", "A little bit of everything for your phone"]],
  ["starter-04", ["Charging & adapter picks", "Adapters and charging accessories"]],
  ["starter-05", ["Cable & connector mix", "Different cable and connector styles"]],
  ["starter-06", ["Mobile essentials bundle", "Useful add-ons for your everyday carry"]],
  ["starter-07", ["Power & charging picks", "Chargers and leads for daily use"]],
  ["starter-08", ["Cable essentials", "Browse the available cable selection"]],
  ["starter-09", ["Handy gadget selection", "Small tech finds for home and travel"]],
  ["starter-10", ["Adapter & audio accessories", "Ask which options work with your device"]],
  ["starter-11", ["Phone accessories, assorted", "More useful extras in one collection"]]
]);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";

  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, url) });
    if (request.method === "GET" && path === "/api/health") return json({ ok: true });
    if (request.method === "GET" && path === "/api/products") {
      const products = await readCatalog(context);
      return json(products.filter(product => product.is_published !== false && product.is_published !== 0));
    }
    if (request.method === "GET" && path.startsWith("/api/images/")) {
      return serveImage(path.slice("/api/images/".length), env);
    }
    if (path === "/api/admin/login" && request.method === "POST") return login(request, env, url);
    if (path === "/api/admin/logout" && request.method === "POST") {
      await requireAdmin(request, env);
      assertSameOrigin(request, url);
      return new Response(null, { status: 204, headers: { "Set-Cookie": expiredCookie() } });
    }

    if (!path.startsWith("/api/admin/")) return json({ error: "Not found." }, 404);
    await requireAdmin(request, env);
    if (request.method !== "GET") assertSameOrigin(request, url);

    if (path === "/api/admin/products" && request.method === "GET") return json(await readCatalog(context));
    if (path === "/api/admin/products" && request.method === "POST") return createProduct(request, context);
    if (path === "/api/admin/products" && request.method === "PUT") return restoreProducts(request, context);
    if (path === "/api/admin/images" && request.method === "POST") return uploadImage(request, env, url);
    if (path.startsWith("/api/admin/images/") && request.method === "DELETE") {
      return deleteImage(path.slice("/api/admin/images/".length), env);
    }
    const productMatch = path.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)$/);
    if (productMatch && request.method === "PATCH") return updateProduct(request, productMatch[1], context);
    if (productMatch && request.method === "DELETE") return deleteProduct(productMatch[1], context, url);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("AA Digital World Pages API error", error.message);
    return json({ error: status >= 500 ? "The request could not be completed." : error.message }, status);
  }
}

function json(value, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), { status, headers });
}

function corsHeaders(request, url) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  if (origin === url.origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function assertSameOrigin(request, url) {
  if (request.headers.get("Origin") !== url.origin) throw httpError("Request origin is not allowed.", 403);
}

async function login(request, env, url) {
  assertSameOrigin(request, url);
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "Admin login is not configured yet." }, 503);
  }
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const emailMatches = await constantTimeEqual(email, env.ADMIN_EMAIL.trim().toLowerCase());
  const passwordMatches = await constantTimeEqual(password, env.ADMIN_PASSWORD);
  if (!emailMatches || !passwordMatches) return json({ error: "Email or password is incorrect." }, 401);
  const token = await createToken(env.ADMIN_EMAIL.trim().toLowerCase(), env.SESSION_SECRET);
  return json({ email: env.ADMIN_EMAIL.trim().toLowerCase() }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/api/admin; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  });
}

async function requireAdmin(request, env) {
  const token = readCookie(request.headers.get("Cookie") || "", SESSION_COOKIE);
  if (!token || !env.SESSION_SECRET || !env.ADMIN_EMAIL) throw httpError("Sign in to manage the catalog.", 401);
  const payload = await verifyToken(token, env.SESSION_SECRET);
  if (!payload || payload.sub !== env.ADMIN_EMAIL.trim().toLowerCase() || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw httpError("Your admin session has expired. Please sign in again.", 401);
  }
}

function readCookie(header, name) {
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function expiredCookie() {
  return `${SESSION_COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

async function createToken(email, secret) {
  const payload = base64url(JSON.stringify({ sub: email, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${base64url(signature)}`;
}

async function verifyToken(token, secret) {
  try {
    const [payloadPart, signaturePart] = token.split(".");
    if (!payloadPart || !signaturePart) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64url(signaturePart), new TextEncoder().encode(payloadPart));
    return valid ? JSON.parse(new TextDecoder().decode(fromBase64url(payloadPart))) : null;
  } catch { return null; }
}

function base64url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function constantTimeEqual(leftValue, rightValue) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(leftValue)),
    crypto.subtle.digest("SHA-256", encoder.encode(rightValue))
  ]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function readCatalog(context) {
  const { env, request } = context;
  const stored = await env.PRODUCT_IMAGES.get(CATALOG_KEY);
  if (stored) {
    try {
      const catalog = JSON.parse(await stored.text());
      if (Array.isArray(catalog)) return await migrateStarterProducts(catalog, context);
    } catch { throw new Error("The stored catalog is invalid JSON."); }
    throw new Error("The stored catalog is not a product list.");
  }

  // Seed the R2 catalog from the checked-in starter list on the first request.
  const assetUrl = new URL("/catalog.json", request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl));
  if (!asset.ok) return [];
  const catalog = await asset.json();
  if (!Array.isArray(catalog)) throw new Error("The starter catalog is invalid.");
  await saveCatalog(env, catalog);
  return catalog;
}

async function migrateStarterProducts(catalog, context) {
  const candidates = catalog.filter(product => {
    const old = OLD_STARTER_PRODUCTS.get(product.id);
    return old && product.name === old[0] && product.detail === old[1]
      && product.price_ngn == null && product.stock_quantity === 0
      && !product.sku && !product.brand && !product.compatibility && !product.updated_at
      && product.is_available === true && product.is_published === true;
  });
  if (!candidates.length) return catalog;

  const asset = await context.env.ASSETS.fetch(new Request(new URL("/catalog.json", context.request.url)));
  if (!asset.ok) return catalog;
  const seeds = await asset.json();
  const byId = new Map(seeds.map(product => [product.id, product]));
  const upgrades = new Map(candidates.map(product => [product.id, byId.get(product.id)]));
  let changed = false;
  const migrated = catalog.map(product => {
    const replacement = upgrades.get(product.id);
    if (!replacement) return product;
    changed = true;
    return { ...replacement, ...(product.created_at ? { created_at: product.created_at } : {}) };
  });
  if (changed) await saveCatalog(context.env, migrated);
  return migrated;
}

async function saveCatalog(env, catalog) {
  await env.PRODUCT_IMAGES.put(CATALOG_KEY, JSON.stringify(catalog), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
  });
}

async function serveImage(rawKey, env) {
  let key;
  try { key = rawKey.split("/").map(decodeURIComponent).join("/"); }
  catch { return json({ error: "Image not found." }, 404); }
  if (!/^products\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(key)) return json({ error: "Image not found." }, 404);
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) return json({ error: "Image not found." }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  if (headers.get("Content-Type")?.startsWith("image/svg")) return json({ error: "Image not found." }, 404);
  return new Response(object.body, { headers });
}

async function uploadImage(request, env, url) {
  const type = (request.headers.get("Content-Type") || "").toLowerCase();
  const extension = IMAGE_TYPES.get(type);
  if (!extension) return json({ error: "Choose a JPG, PNG or WebP image." }, 415);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_IMAGE_BYTES) return json({ error: "The image must be 5 MB or smaller." }, 413);
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_IMAGE_BYTES) return json({ error: "The image must be between 1 byte and 5 MB." }, 413);
  const key = `products/${crypto.randomUUID()}.${extension}`;
  await env.PRODUCT_IMAGES.put(key, body, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" }
  });
  return json({ key, imageUrl: `${url.origin}/api/images/${key}` }, 201);
}

async function deleteImage(rawKey, env) {
  let key;
  try { key = rawKey.split("/").map(decodeURIComponent).join("/"); }
  catch { return json({ error: "Invalid image path." }, 400); }
  if (!/^products\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(key)) return json({ error: "Invalid image path." }, 400);
  await env.PRODUCT_IMAGES.delete(key);
  return new Response(null, { status: 204 });
}

function normalizeProduct(body, imageUrl) {
  const name = String(body.name || "").trim();
  const detail = String(body.detail || "").trim();
  const rawCategory = String(body.category_name || body.category || "").trim().replace(/\s+/g, " ");
  const category = rawCategory.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const categoryName = STANDARD_CATEGORIES.get(category) || rawCategory;
  const price = body.price_ngn === "" || body.price_ngn == null ? null : Number(body.price_ngn);
  const stock = body.stock_quantity === "" || body.stock_quantity == null ? null : Number(body.stock_quantity);
  imageUrl = typeof imageUrl === "string" ? imageUrl.trim() : imageUrl;
  if (name.length < 2 || name.length > 90) throw httpError("Product name must be 2–90 characters.", 400);
  if (rawCategory.length < 2 || rawCategory.length > 40 || !category || category.length > 50) {
    throw httpError("Enter a category between 2 and 40 characters.", 400);
  }
  if (detail.length < 2 || detail.length > 180) throw httpError("Description must be 2–180 characters.", 400);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw httpError("Enter a valid price in naira.", 400);
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw httpError("Stock quantity must be zero or more.", 400);
  if (!imageUrl || typeof imageUrl !== "string" || imageUrl.length > 500) throw httpError("Upload a valid product photo first.", 400);
  return {
    name, category, category_name: categoryName, tag: String(body.tag || STANDARD_CATEGORIES.get(category) || categoryName), detail,
    sku: String(body.sku || "").trim() || null,
    brand: String(body.brand || "").trim() || null,
    compatibility: String(body.compatibility || "").trim() || null,
    price_ngn: price,
    stock_quantity: stock,
    is_available: Boolean(body.is_available),
    is_published: Boolean(body.is_published),
    image_url: imageUrl
  };
}

async function createProduct(request, context) {
  const body = await request.json();
  const catalog = await readCatalog(context);
  const values = normalizeProduct(body, body.image_url);
  if (values.sku && catalog.some(item => item.sku && item.sku.toLowerCase() === values.sku.toLowerCase())) {
    throw httpError("That item code is already in use.", 409);
  }
  const product = { id: crypto.randomUUID(), ...values, created_at: new Date().toISOString() };
  catalog.unshift(product);
  await saveCatalog(context.env, catalog);
  return json(product, 201);
}

async function updateProduct(request, id, context) {
  const body = await request.json();
  const catalog = await readCatalog(context);
  const index = catalog.findIndex(item => item.id === id);
  if (index < 0) return json({ error: "Product not found." }, 404);
  const values = normalizeProduct(body, body.image_url || catalog[index].image_url);
  if (values.sku && catalog.some((item, itemIndex) => itemIndex !== index && item.sku && item.sku.toLowerCase() === values.sku.toLowerCase())) {
    throw httpError("That item code is already in use.", 409);
  }
  const product = { ...catalog[index], ...values, updated_at: new Date().toISOString() };
  catalog[index] = product;
  await saveCatalog(context.env, catalog);
  return json(product);
}

async function restoreProducts(request, context) {
  const backup = await request.json();
  if (backup?.format !== "aa-digital-world-catalog" || backup.version !== 1 || !Array.isArray(backup.products)) {
    throw httpError("This is not a supported AA Digital World catalog backup.", 400);
  }
  if (backup.products.length > 500) throw httpError("A catalog backup can contain up to 500 products.", 400);
  const ids = new Set();
  const skus = new Set();
  const catalog = backup.products.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw httpError("The backup contains an invalid product record.", 400);
    const id = String(item?.id || "");
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id) || ids.has(id)) throw httpError("The backup has an invalid or repeated product ID.", 400);
    ids.add(id);
    const values = normalizeProduct(item, item.image_url);
    if (values.sku) {
      const sku = values.sku.toLowerCase();
      if (skus.has(sku)) throw httpError("The backup has repeated item codes.", 400);
      skus.add(sku);
    }
    return {
      id,
      ...values,
      created_at: typeof item.created_at === "string" ? item.created_at : new Date().toISOString(),
      ...(typeof item.updated_at === "string" ? { updated_at: item.updated_at } : {})
    };
  });
  await saveCatalog(context.env, catalog);
  return json(catalog);
}

async function deleteProduct(id, context, url) {
  const catalog = await readCatalog(context);
  const index = catalog.findIndex(item => item.id === id);
  if (index < 0) return json({ error: "Product not found." }, 404);
  const [product] = catalog.splice(index, 1);
  await saveCatalog(context.env, catalog);

  let imageUrl;
  try { imageUrl = new URL(product.image_url, url.origin); }
  catch { imageUrl = null; }
  const imagePrefix = "/api/images/";
  if (imageUrl?.origin === url.origin && imageUrl.pathname.startsWith(imagePrefix)) {
    let key;
    try { key = imageUrl.pathname.slice(imagePrefix.length).split("/").map(decodeURIComponent).join("/"); }
    catch { key = ""; }
    if (/^products\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(key)
      && !catalog.some(item => item.image_url === product.image_url)) {
      await context.env.PRODUCT_IMAGES.delete(key);
    }
  }
  return new Response(null, { status: 204 });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
