const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const CATEGORIES = new Set(["charging", "cables", "accessories"]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") {
      if (!originAllowed(origin, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, "") || "/";

      if (request.method === "GET" && path === "/api/health") {
        return json({ ok: true }, 200, cors);
      }
      if (request.method === "GET" && path === "/api/products") {
        const { results } = await env.DB.prepare(
          `SELECT id,name,category,sku,detail,brand,compatibility,price_ngn,
                  stock_quantity,is_available,is_published,image_url,created_at
           FROM products WHERE is_published=1 ORDER BY created_at DESC`
        ).all();
        return json(results, 200, cors);
      }
      if (request.method === "GET" && path.startsWith("/api/images/")) {
        return serveImage(path.slice("/api/images/".length), request, env, cors);
      }
      if (path === "/api/admin/login" && request.method === "POST") {
        if (!originAllowed(origin, env)) return json({ error: "Request origin is not allowed." }, 403, cors);
        return login(request, env, cors);
      }

      if (path.startsWith("/api/admin/")) {
        if (!originAllowed(origin, env)) return json({ error: "Request origin is not allowed." }, 403, cors);
        await requireAdmin(request, env);
        if (path === "/api/admin/products" && request.method === "GET") {
          const { results } = await env.DB.prepare(
            `SELECT id,name,category,sku,detail,brand,compatibility,price_ngn,
                    stock_quantity,is_available,is_published,image_url,created_at
             FROM products ORDER BY created_at DESC`
          ).all();
          return json(results, 200, cors);
        }
        if (path === "/api/admin/products" && request.method === "POST") {
          return createProduct(request, env, cors);
        }
        const productMatch = path.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)$/);
        if (productMatch && request.method === "PATCH") {
          return updateProduct(request, productMatch[1], env, cors);
        }
        if (path === "/api/admin/images" && request.method === "POST") {
          return uploadImage(request, env, cors);
        }
        const imageMatch = path.match(/^\/api\/admin\/images\/(.+)$/);
        if (imageMatch && request.method === "DELETE") {
          return deleteImage(decodeURIComponent(imageMatch[1]), env, cors);
        }
      }
      return json({ error: "Not found." }, 404, cors);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("AA Digital World API error", error.message);
      return json({ error: status >= 500 ? "The request could not be completed." : error.message }, status, cors);
    }
  }
};

function originAllowed(origin, env) {
  return Boolean(origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN);
}

function corsHeaders(origin, env) {
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type" });
  if (originAllowed(origin, env)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(value, status, headers = new Headers()) {
  const out = new Headers(headers);
  out.set("Content-Type", "application/json; charset=utf-8");
  out.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), { status, headers: out });
}

async function login(request, env, cors) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "Admin login is not configured yet." }, 503, cors);
  }
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const emailMatches = await constantTimeEqual(email, env.ADMIN_EMAIL.trim().toLowerCase());
  const passwordMatches = await constantTimeEqual(password, env.ADMIN_PASSWORD);
  if (!emailMatches || !passwordMatches) return json({ error: "Email or password is incorrect." }, 401, cors);
  const token = await createToken(env.ADMIN_EMAIL.trim().toLowerCase(), env.SESSION_SECRET);
  return json({ token, expiresIn: 60 * 60 * 8, email: env.ADMIN_EMAIL.trim().toLowerCase() }, 200, cors);
}

async function requireAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !env.SESSION_SECRET || !env.ADMIN_EMAIL) throw httpError("Sign in to manage the catalog.", 401);
  const payload = await verifyToken(match[1], env.SESSION_SECRET);
  if (!payload || payload.sub !== env.ADMIN_EMAIL.trim().toLowerCase() || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw httpError("Your admin session has expired. Please sign in again.", 401);
  }
}

async function createToken(email, secret) {
  const payload = base64url(JSON.stringify({ sub: email, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 }));
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
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b))
  ]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

async function uploadImage(request, env, cors) {
  const type = (request.headers.get("Content-Type") || "").toLowerCase();
  const extension = IMAGE_TYPES.get(type);
  if (!extension) return json({ error: "Choose a JPG, PNG or WebP image." }, 415, cors);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_IMAGE_BYTES) return json({ error: "The image must be 5 MB or smaller." }, 413, cors);
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_IMAGE_BYTES) return json({ error: "The image must be between 1 byte and 5 MB." }, 413, cors);
  const key = `products/${crypto.randomUUID()}.${extension}`;
  await env.PRODUCT_IMAGES.put(key, body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  return json({ key, imageUrl: `${new URL(request.url).origin}/api/images/${key}` }, 201, cors);
}

async function serveImage(key, request, env, cors) {
  if (!key.startsWith("products/") || key.includes("..")) return json({ error: "Image not found." }, 404, cors);
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) return json({ error: "Image not found." }, 404, cors);
  const headers = new Headers(cors);
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  if (request.headers.get("If-None-Match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}

async function deleteImage(key, env, cors) {
  if (!key.startsWith("products/") || key.includes("..")) return json({ error: "Invalid image path." }, 400, cors);
  await env.PRODUCT_IMAGES.delete(key);
  return new Response(null, { status: 204, headers: cors });
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
    name, category, detail,
    sku: String(body.sku || "").trim() || null,
    brand: String(body.brand || "").trim() || null,
    compatibility: String(body.compatibility || "").trim() || null,
    price_ngn: price,
    stock_quantity: stock,
    is_available: body.is_available ? 1 : 0,
    is_published: body.is_published ? 1 : 0,
    image_url: imageUrl
  };
}

async function createProduct(request, env, cors) {
  const body = await request.json();
  const values = normalizeProduct(body, body.image_url);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO products (id,name,category,sku,detail,brand,compatibility,price_ngn,
      stock_quantity,is_available,is_published,image_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, values.name, values.category, values.sku, values.detail, values.brand, values.compatibility,
    values.price_ngn, values.stock_quantity, values.is_available, values.is_published, values.image_url).run();
  const product = await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
  return json(product, 201, cors);
}

async function updateProduct(request, id, env, cors) {
  const body = await request.json();
  const existing = await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
  if (!existing) return json({ error: "Product not found." }, 404, cors);
  const values = normalizeProduct(body, body.image_url || existing.image_url);
  await env.DB.prepare(
    `UPDATE products SET name=?,category=?,sku=?,detail=?,brand=?,compatibility=?,price_ngn=?,
      stock_quantity=?,is_available=?,is_published=?,image_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(values.name, values.category, values.sku, values.detail, values.brand, values.compatibility,
    values.price_ngn, values.stock_quantity, values.is_available, values.is_published, values.image_url, id).run();
  const product = await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
  return json(product, 200, cors);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
