require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const routes = require("./routes");

const PORT = process.env.PORT || 8090;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tablero_tareas";
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en .env (copia .env.example a .env).");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());

app.use("/api", routes);

// Evidencias: solo para usuarios con sesión
const { requiereSesion } = require("./auth");
app.use("/uploads", requiereSesion, express.static(path.join(__dirname, "..", "uploads"), {
  index: false, maxAge: "7d",
  setHeaders: (res, filePath) => {
    // Documentos: nombre legible al descargar (?n=nombre original) y abrir en el navegador cuando se pueda
    const n = res.req.query.n;
    if (n && !/\.(jpe?g|png|webp|gif)$/i.test(filePath)) res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(n)}`);
  },
}));

// Manejo de errores de las rutas
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === "CastError") return res.status(400).json({ error: "Identificador no válido." });
  res.status(500).json({ error: "Error interno del servidor." });
});

// Frontend estático
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`Tablero de Tareas en http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("No se pudo conectar a MongoDB:", e.message);
    process.exit(1);
  });
