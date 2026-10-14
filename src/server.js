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
