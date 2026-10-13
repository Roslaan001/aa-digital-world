const CATALOG_KEY = "catalog.json";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const CATEGORIES = new Set(["charging", "cables", "accessories"]);
const SESSION_COOKIE = "aa-admin-session";
const SESSION_SECONDS = 8 * 60 * 60;

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
    if (path === "/api/admin/images" && request.method === "POST") return uploadImage(request, env, url);
    if (path.startsWith("/api/admin/images/") && request.method === "DELETE") {
      return deleteImage(path.slice("/api/admin/images/".length), env);
    }
    const productMatch = path.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)$/);
    if (productMatch && request.method === "PATCH") return updateProduct(request, productMatch[1], context);
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
      if (Array.isArray(catalog)) return catalog;
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
  const category = String(body.category || "");
  const price = body.price_ngn === "" || body.price_ngn == null ? null : Number(body.price_ngn);
  const stock = Number(body.stock_quantity);
  if (name.length < 2 || name.length > 90) throw httpError("Product name must be 2–90 characters.", 400);
  if (!CATEGORIES.has(category)) throw httpError("Choose a valid category.", 400);
  if (detail.length < 2 || detail.length > 180) throw httpError("Description must be 2–180 characters.", 400);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw httpError("Enter a valid price in naira.", 400);
  if (!Number.isInteger(stock) || stock < 0) throw httpError("Stock quantity must be zero or more.", 400);
  if (!imageUrl || typeof imageUrl !== "string") throw httpError("Upload a product photo first.", 400);
  return {
    name, category, tag: String(body.tag || ({ charging: "Charging", cables: "Cables", accessories: "Accessories" })[category]), detail,
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

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
