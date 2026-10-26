const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    usuario: { type: String, required: true, unique: true, trim: true, lowercase: true },
    nombre: { type: String, required: true, trim: true },
    cargo: { type: String, trim: true, default: "" },
    rol: { type: String, enum: ["admin", "jefe", "trabajador"], required: true },
    passwordHash: { type: String, required: true },
    activo: { type: Boolean, default: true },
    // Jefe al que reporta (solo trabajadores)
    jefe: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const TaskSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true, maxlength: 150 },
    descripcion: { type: String, trim: true, default: "", maxlength: 2000 },
    prioridad: { type: String, enum: ["alta", "media", "baja"], default: "media" },
    fechaLimite: { type: String, default: "" }, // AAAA-MM-DD
    estado: { type: String, enum: ["pendiente", "en_proceso", "completada"], default: "pendiente" },
    asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    comentarioTrabajador: { type: String, trim: true, default: "", maxlength: 1000 },
    // Fotos de evidencia subidas por el trabajador (archivos en /uploads)
    evidencias: [
      {
        archivo: { type: String, required: true },
        nombre: { type: String, default: "" },
        subidoPor: { type: String, default: "" },
        subidoEn: { type: Date, default: Date.now },
      },
    ],
    completadaEn: { type: Date, default: null },
    historial: [
      {
        fecha: { type: Date, default: Date.now },
        usuario: { type: String },
        accion: { type: String },
      },
    ],
  },
  { timestamps: true }
);

module.exports = {
  User: mongoose.model("User", UserSchema),
  Task: mongoose.model("Task", TaskSchema),
};
