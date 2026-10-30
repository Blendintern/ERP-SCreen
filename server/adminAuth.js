const crypto = require("crypto");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
if (!process.env.ADMIN_PASSWORD) {
  console.warn("ADMIN_PASSWORD is not set; using the insecure default 'admin123'. Set ADMIN_PASSWORD before deploying.");
}

// Sessions are a signed, stateless cookie (expiry + HMAC) rather than
// server-side session storage, because Vercel runs each request in a
// short-lived, possibly separate function instance - an in-memory session
// map created at login would not be visible to the next request.
const SESSION_SECRET = process.env.SESSION_SECRET || `${ADMIN_PASSWORD}:erp-admin-session`;
const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(expiresAt) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(String(expiresAt)).digest("hex");
}

function checkPassword(password) {
  return typeof password === "string" && password === ADMIN_PASSWORD;
}

function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

function isValidToken(token) {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expiresAt = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!expiresAt || Date.now() > expiresAt || !sig) return false;
  const expected = sign(expiresAt);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function sessionTokenFrom(req) {
  return parseCookies(req)[SESSION_COOKIE];
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function requireAdmin(req, res, next) {
  if (isValidToken(sessionTokenFrom(req))) return next();
  res.status(401).json({ error: "Not logged in." });
}

module.exports = {
  checkPassword,
  createSessionToken,
  sessionTokenFrom,
  isValidToken,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
};
