// Crea el usuario administrador (y, con --demo, un jefe de área con trabajadores y tareas de ejemplo)
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Task } = require("../src/models");

const demo = process.argv.includes("--demo");

(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tablero_tareas");

  const usuario = (process.env.SEED_ADMIN_USER || "admin").toLowerCase();
  let admin = await User.findOne({ usuario });
  if (!admin) {
    admin = await User.create({
      usuario,
      nombre: process.env.SEED_ADMIN_NAME || "Administrador",
      cargo: "Administrador",
      rol: "admin",
      passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASS || "Admin2026*", 10),
    });
    console.log(`Administrador creado: usuario "${usuario}"`);
  } else {
    console.log(`El administrador "${usuario}" ya existe, no se modificó.`);
  }

  if (demo) {
    let jefe = await User.findOne({ usuario: "jefe" });
    if (!jefe) {
      jefe = await User.create({ usuario: "jefe", nombre: "Jefe de Área Demo", cargo: "Jefe de área", rol: "jefe", passwordHash: await bcrypt.hash("Jefe2026*", 10) });
      console.log("Jefe demo creado: jefe / Jefe2026*");
    }
    const ejemplos = [
      { usuario: "aux.sistemas", nombre: "Auxiliar de Sistemas", cargo: "Aux sistemas" },
      { usuario: "aux.cocina", nombre: "Auxiliar de Cocina", cargo: "Aux cocina" },
    ];
    for (const e of ejemplos) {
      let w = await User.findOne({ usuario: e.usuario });
      if (!w) {
        w = await User.create({ ...e, rol: "trabajador", jefe: jefe._id, passwordHash: await bcrypt.hash("123456", 10) });
        console.log(`Trabajador demo creado: ${e.usuario} / 123456`);
      }
      if ((await Task.countDocuments({ asignadoA: w._id })) === 0 && e.usuario === "aux.sistemas") {
        const base = { creadoPor: jefe._id, asignadoA: w._id, historial: [{ usuario: jefe.nombre, accion: "Asignó la tarea" }] };
        await Task.create([
          { ...base, titulo: "Validación de Pharmanet, Osticket, Módulo de farmacia", prioridad: "alta" },
          { ...base, titulo: "Crear formularios de cero cuadro por cuadro o por JSON", prioridad: "media" },
          { ...base, titulo: "Agregar dispositivos médicos e insumos, alimentos al consultor del INVIMA", prioridad: "media" },
          { ...base, titulo: "Desarrollo tablero de temperaturas en pharmanet", prioridad: "baja" },
          { ...base, titulo: "Revisar velocidad de pharmanet, tiende a demorarse", prioridad: "alta", estado: "en_proceso" },
        ]);
        console.log("Tareas de ejemplo creadas.");
      }
    }
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
