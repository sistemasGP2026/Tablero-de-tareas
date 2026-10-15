const express = require("express");
const bcrypt = require("bcryptjs");
const { User, Task } = require("./models");
const { firmar, setCookie, clearCookie, requiereSesion, soloJefe, soloAdmin } = require("./auth");

const router = express.Router();

const pub = (u) => ({ id: u._id, usuario: u.usuario, nombre: u.nombre, cargo: u.cargo, rol: u.rol, activo: u.activo });

// ---------- Autenticación ----------
router.post("/auth/login", async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: "Escribe usuario y contraseña." });
  const user = await User.findOne({ usuario: String(usuario).toLowerCase().trim() });
  if (!user || !user.activo) return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  setCookie(res, firmar(user));
  res.json({ user: pub(user) });
});

router.post("/auth/logout", (req, res) => {
  clearCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", requiereSesion, (req, res) => res.json({ user: pub(req.user) }));

router.post("/auth/password", requiereSesion, async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!nueva || nueva.length < 6) return res.status(400).json({ error: "La contraseña nueva debe tener al menos 6 caracteres." });
  const user = await User.findById(req.user._id);
  if (!(await bcrypt.compare(actual || "", user.passwordHash))) return res.status(400).json({ error: "La contraseña actual no coincide." });
  user.passwordHash = await bcrypt.hash(nueva, 10);
  await user.save();
  res.json({ ok: true });
});

// ---------- Jefes de área (solo admin) ----------
router.get("/jefes", requiereSesion, soloAdmin, async (req, res) => {
  const jefes = await User.find({ rol: "jefe" }).sort({ nombre: 1 }).lean();
  const conteos = await User.aggregate([{ $match: { rol: "trabajador" } }, { $group: { _id: "$jefe", n: { $sum: 1 } } }]);
  const mapa = Object.fromEntries(conteos.map((c) => [String(c._id), c.n]));
  res.json(jefes.map((j) => ({ ...pub(j), trabajadores: mapa[String(j._id)] || 0 })));
});

router.post("/jefes", requiereSesion, soloAdmin, async (req, res) => {
  const { usuario, nombre, cargo, password } = req.body || {};
  if (!usuario || !nombre || !password) return res.status(400).json({ error: "Usuario, nombre y contraseña son obligatorios." });
  if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  if (await User.findOne({ usuario: String(usuario).toLowerCase().trim() })) return res.status(409).json({ error: "Ese usuario ya existe." });
  const u = await User.create({ usuario, nombre, cargo: cargo || "Jefe de área", rol: "jefe", passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json(pub(u));
});

router.patch("/jefes/:id", requiereSesion, soloAdmin, async (req, res) => {
  const u = await User.findOne({ _id: req.params.id, rol: "jefe" });
  if (!u) return res.status(404).json({ error: "Jefe no encontrado." });
  const { nombre, cargo, activo, password } = req.body || {};
  if (nombre !== undefined) u.nombre = nombre;
  if (cargo !== undefined) u.cargo = cargo;
  if (activo !== undefined) u.activo = !!activo;
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    u.passwordHash = await bcrypt.hash(password, 10);
  }
  await u.save();
  res.json(pub(u));
});

// ---------- Trabajadores (jefe: los suyos; admin: todos, con su jefe) ----------
router.get("/trabajadores", requiereSesion, async (req, res) => {
  if (req.user.rol === "trabajador") return res.status(403).json({ error: "No autorizado." });
  const filtro = req.user.rol === "admin" ? { rol: "trabajador" } : { rol: "trabajador", jefe: req.user._id };
  const lista = await User.find(filtro).populate("jefe", "nombre").sort({ nombre: 1 }).lean();
  res.json(lista.map((u) => ({ ...pub(u), jefe: u.jefe ? { id: u.jefe._id, nombre: u.jefe.nombre } : null })));
});

router.post("/trabajadores", requiereSesion, soloJefe, async (req, res) => {
  const { usuario, nombre, cargo, password } = req.body || {};
  if (!usuario || !nombre || !password) return res.status(400).json({ error: "Usuario, nombre y contraseña son obligatorios." });
  if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  if (await User.findOne({ usuario: String(usuario).toLowerCase().trim() })) return res.status(409).json({ error: "Ese usuario ya existe." });
  const u = await User.create({
    usuario, nombre, cargo: cargo || "", rol: "trabajador", jefe: req.user._id,
    passwordHash: await bcrypt.hash(password, 10),
  });
  res.status(201).json(pub(u));
});

router.patch("/trabajadores/:id", requiereSesion, soloJefe, async (req, res) => {
  const u = await User.findOne({ _id: req.params.id, rol: "trabajador", jefe: req.user._id });
  if (!u) return res.status(404).json({ error: "Trabajador no encontrado." });
  const { nombre, cargo, activo, password } = req.body || {};
  if (nombre !== undefined) u.nombre = nombre;
  if (cargo !== undefined) u.cargo = cargo;
  if (activo !== undefined) u.activo = !!activo;
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    u.passwordHash = await bcrypt.hash(password, 10);
  }
  await u.save();
  res.json(pub(u));
});

// ---------- Tareas ----------
// Admin: todas (solo lectura). Jefe: todas las de su equipo. Trabajador: solo las suyas.
router.get("/tareas", requiereSesion, async (req, res) => {
  let filtro;
  if (req.user.rol === "admin") {
    filtro = {};
  } else if (req.user.rol === "jefe") {
    const ids = await User.find({ rol: "trabajador", jefe: req.user._id }).distinct("_id");
    filtro = { asignadoA: { $in: ids } };
  } else {
    filtro = { asignadoA: req.user._id };
  }
  const tareas = await Task.find(filtro)
    .populate("asignadoA", "nombre usuario cargo activo jefe")
    .populate("creadoPor", "nombre")
    .sort({ estado: 1, fechaLimite: 1, createdAt: -1 })
    .lean();
  res.json(tareas);
});

router.post("/tareas", requiereSesion, soloJefe, async (req, res) => {
  const { titulo, descripcion, prioridad, asignadoA } = req.body || {};
  if (!titulo || !asignadoA) return res.status(400).json({ error: "Título y trabajador son obligatorios." });
  const trabajador = await User.findOne({ _id: asignadoA, rol: "trabajador", jefe: req.user._id, activo: true });
  if (!trabajador) return res.status(400).json({ error: "Ese trabajador no está en tu equipo." });
  // Evita duplicados por doble clic: misma tarea para el mismo trabajador en el último minuto
  const reciente = await Task.findOne({ asignadoA: trabajador._id, titulo: String(titulo).trim(), createdAt: { $gte: new Date(Date.now() - 60000) } });
  if (reciente) return res.status(409).json({ error: "Esa tarea ya se agregó hace un momento." });
  const t = await Task.create({
    titulo: String(titulo).trim(), descripcion: descripcion || "", prioridad: prioridad || "media",
    asignadoA: trabajador._id, creadoPor: req.user._id,
    historial: [{ usuario: req.user.nombre, accion: "Asignó la tarea a " + trabajador.nombre }],
  });
  res.status(201).json(await Task.findById(t._id).populate("asignadoA", "nombre usuario cargo").populate("creadoPor", "nombre").lean());
});

// Cambio de estado: trabajador (solo las suyas) o jefe (las de su equipo)
router.patch("/tareas/:id/estado", requiereSesion, async (req, res) => {
  const { estado, comentario } = req.body || {};
  if (!["pendiente", "en_proceso", "completada"].includes(estado)) return res.status(400).json({ error: "Estado no válido." });
  const t = await Task.findById(req.params.id).populate("asignadoA", "jefe nombre");
  if (!t) return res.status(404).json({ error: "Tarea no encontrada." });
  const esDueno = String(t.asignadoA._id) === String(req.user._id);
  const esSuJefe = req.user.rol === "jefe" && String(t.asignadoA.jefe) === String(req.user._id);
  if (!esDueno && !esSuJefe) return res.status(403).json({ error: "No puedes modificar esta tarea." });
  t.estado = estado;
  t.completadaEn = estado === "completada" ? new Date() : null;
  if (comentario !== undefined) t.comentarioTrabajador = String(comentario).slice(0, 1000);
  const nombres = { pendiente: "Pendiente", en_proceso: "En proceso", completada: "Completada" };
  t.historial.push({ usuario: req.user.nombre, accion: "Cambió el estado a " + nombres[estado] });
  await t.save();
  res.json(await Task.findById(t._id).populate("asignadoA", "nombre usuario cargo").populate("creadoPor", "nombre").lean());
});

// Fecha de entrega: la fija el trabajador dueño de la tarea
router.patch("/tareas/:id/fecha", requiereSesion, async (req, res) => {
  const { fechaLimite } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaLimite || "")) return res.status(400).json({ error: "Fecha no válida." });
  const t = await Task.findById(req.params.id);
  if (!t) return res.status(404).json({ error: "Tarea no encontrada." });
  if (String(t.asignadoA) !== String(req.user._id)) return res.status(403).json({ error: "Solo el trabajador asignado define su fecha de entrega." });
  if (t.estado === "completada") return res.status(400).json({ error: "La tarea ya está completada." });
  t.fechaLimite = fechaLimite;
  const [y, m, d] = fechaLimite.split("-");
  t.historial.push({ usuario: req.user.nombre, accion: `Fijó la fecha de entrega: ${d}/${m}/${y}` });
  await t.save();
  res.json(await Task.findById(t._id).populate("asignadoA", "nombre usuario cargo").populate("creadoPor", "nombre").lean());
});

// Edición y eliminación: solo jefe
router.patch("/tareas/:id", requiereSesion, soloJefe, async (req, res) => {
  const t = await Task.findById(req.params.id).populate("asignadoA", "jefe");
  if (!t || String(t.asignadoA.jefe) !== String(req.user._id)) return res.status(404).json({ error: "Tarea no encontrada." });
  const { titulo, descripcion, prioridad, asignadoA } = req.body || {};
  if (titulo !== undefined) t.titulo = titulo;
  if (descripcion !== undefined) t.descripcion = descripcion;
  if (prioridad !== undefined) t.prioridad = prioridad;
  if (asignadoA && String(asignadoA) !== String(t.asignadoA._id)) {
    const nuevo = await User.findOne({ _id: asignadoA, rol: "trabajador", jefe: req.user._id, activo: true });
    if (!nuevo) return res.status(400).json({ error: "Ese trabajador no está en tu equipo." });
    t.asignadoA = nuevo._id;
    t.historial.push({ usuario: req.user.nombre, accion: "Reasignó la tarea a " + nuevo.nombre });
  }
  t.historial.push({ usuario: req.user.nombre, accion: "Editó la tarea" });
  await t.save();
  res.json(await Task.findById(t._id).populate("asignadoA", "nombre usuario cargo").populate("creadoPor", "nombre").lean());
});

router.delete("/tareas/:id", requiereSesion, soloJefe, async (req, res) => {
  const t = await Task.findById(req.params.id).populate("asignadoA", "jefe");
  if (!t || String(t.asignadoA.jefe) !== String(req.user._id)) return res.status(404).json({ error: "Tarea no encontrada." });
  await t.deleteOne();
  res.json({ ok: true });
});

module.exports = router;
