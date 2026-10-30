const crypto = require("crypto");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
if (!process.env.ADMIN_PASSWORD) {
  console.warn("ADMIN_PASSWORD is not set; using the insecure default 'admin123'. Set ADMIN_PASSWORD before deploying.");
}

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions = new Map(); // token -> expiresAt

function createSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function checkPassword(password) {
  return typeof password === "string" && password === ADMIN_PASSWORD;
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

function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  const expiresAt = sessions.get(token);
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
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
  if (isValidSession(sessionTokenFrom(req))) return next();
  res.status(401).json({ error: "Not logged in." });
}

module.exports = {
  checkPassword,
  createSession,
  destroySession,
  sessionTokenFrom,
  isValidSession,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
};
