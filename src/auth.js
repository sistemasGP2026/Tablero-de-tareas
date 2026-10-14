const jwt = require("jsonwebtoken");
const { User } = require("./models");

const COOKIE = "tt_token";

function firmar(user) {
  return jwt.sign({ id: user._id.toString(), rol: user.rol }, process.env.JWT_SECRET, { expiresIn: "12h" });
}

function setCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 12 * 60 * 60 * 1000 });
}

function clearCookie(res) {
  res.clearCookie(COOKIE);
}

// Carga el usuario autenticado desde la cookie
async function requiereSesion(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: "No has iniciado sesión." });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).lean();
    if (!user || !user.activo) return res.status(401).json({ error: "Sesión no válida." });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Sesión expirada. Vuelve a iniciar sesión." });
  }
}

function soloJefe(req, res, next) {
  if (req.user.rol !== "jefe") return res.status(403).json({ error: "Solo el jefe de área puede hacer esto." });
  next();
}

function soloAdmin(req, res, next) {
  if (req.user.rol !== "admin") return res.status(403).json({ error: "Solo el administrador puede hacer esto." });
  next();
}

module.exports = { firmar, setCookie, clearCookie, requiereSesion, soloJefe, soloAdmin };
