(function () {
  const $ = (id) => document.getElementById(id);
  const ICON_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-4.5-7.2"/><path d="m8.5 12 2.5 2.5L16 9.5"/><path d="M19 3v6M16 6h6"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L19 7"/></svg>';
  const EST = { pendiente: "Pendiente", en_proceso: "En proceso", completada: "Completada" };
  const PRIO = { alta: "Alta", media: "Media", baja: "Baja" };

  let user = null, tareas = [], trabajadores = [], jefes = [], openForm = null, editing = null, timer = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const fmt = (d) => { if (!d) return ""; const [y, m, dd] = String(d).slice(0, 10).split("-"); return `${dd}/${m}/${y}`; };
  const fmtDT = (d) => new Date(d).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

  async function api(path, opts = {}) {
    const r = await fetch("/api" + path, { headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== "/auth/login") { showLogin(); throw new Error(data.error || "Sesión expirada."); }
    if (!r.ok) throw new Error(data.error || "Error de servidor.");
    return data;
  }

  // ---------- Vistas ----------
  function showLogin() {
    clearInterval(timer); user = null;
    $("viewApp").hidden = true; $("viewLogin").hidden = false; $("lUser").focus();
  }
  async function showApp(u) {
    user = u;
    $("viewLogin").hidden = true; $("viewApp").hidden = false;
    $("whoName").textContent = u.nombre;
    $("whoRole").textContent = u.rol === "admin" ? "Administrador" : u.rol === "jefe" ? "Jefe de área" : (u.cargo || "Trabajador");
    $("teamPanel").hidden = u.rol !== "jefe";
    $("adminPanel").hidden = u.rol !== "admin";
    $("appTitle").textContent = u.rol === "admin" ? "Administración" : u.rol === "jefe" ? "Tablero de Tareas" : "Mis tareas";
    await refresh();
    // Refresco automático (el jefe ve lo que marcan los trabajadores), salvo mientras alguien escribe
    clearInterval(timer);
    timer = setInterval(() => {
      const a = document.activeElement;
      const escribiendo = a && (a.closest(".form") || a.closest("dialog") || a.closest("#workerForm") || a.closest("#jefeForm"));
      if (!escribiendo && !document.querySelector("dialog[open]")) refresh();
    }, 30000);
  }

  async function refresh() {
    try {
      const [t, w, j] = await Promise.all([
        api("/tareas"),
        user.rol !== "trabajador" ? api("/trabajadores") : Promise.resolve(null),
        user.rol === "admin" ? api("/jefes") : Promise.resolve(null),
      ]);
      tareas = t; if (w) trabajadores = w; if (j) jefes = j;
      $("appMsg").textContent = "";
      render();
    } catch (e) { $("appMsg").textContent = e.message; }
  }

  // ---------- Render ----------
  // Evidencias: imagen -> miniatura; documento -> ficha con icono. `del` agrega la X de eliminar.
  const esImagen = (e) => /^image\//.test(e.tipo || "") || /\.(jpe?g|png|webp|gif)$/i.test(e.archivo);
  const docIcon = (e) => /pdf/.test(e.tipo) || /\.pdf$/i.test(e.archivo) ? "PDF" : /word|\.docx?$/i.test(e.tipo + e.archivo) ? "DOC" : /excel|sheet|\.xlsx?$/i.test(e.tipo + e.archivo) ? "XLS" : "FILE";
  function evHtml(e, { del = false, title = "" } = {}) {
    const x = del ? `<span class="x" data-evdel="${e._id}" title="Eliminar">×</span>` : "";
    if (esImagen(e)) return `<button class="thumb" type="button" data-img="${esc(e.archivo)}" title="${esc(title || e.nombre || "Evidencia")}"><img src="/uploads/${esc(e.archivo)}" alt="" loading="lazy">${x}</button>`;
    const url = `/uploads/${esc(e.archivo)}?n=${encodeURIComponent(e.nombre || e.archivo)}`;
    return `<a class="doc ${docIcon(e).toLowerCase()}" href="${url}" target="_blank" rel="noopener" title="${esc(title || e.nombre)}"><span class="ic">${docIcon(e)}</span><span class="nm">${esc(e.nombre || e.archivo)}</span>${x}</a>`;
  }

  function rowHtml(t, hoy) {
    const done = t.estado === "completada", late = !done && t.fechaLimite && t.fechaLimite < hoy;
    const parts = [];
    if (t.descripcion) parts.push(esc(t.descripcion));
    if (t.prioridad === "alta") parts.push("Prioridad alta");
    if (t.fechaLimite) parts.push(`<span class="${late ? "late" : ""}">${late ? "Vencida · " : "Entrega "}${fmt(t.fechaLimite)}</span>`);
    else if (!done) parts.push(`<span class="muted">Sin fecha de entrega</span>`);
    if (t.estado === "en_proceso") parts.push(`<span class="st en_proceso">En proceso</span>`);
    if (done && t.completadaEn) parts.push(`<span class="st completada">Completada ${fmtDT(t.completadaEn)}</span>`);
    if (t.comentarioTrabajador) parts.push(`“${esc(t.comentarioTrabajador)}”`);
    const jefe = user.rol === "jefe", ro = user.rol === "admin"; // admin: solo lectura
    const evs = t.evidencias || [];
    const thumbs = evs.length ? `<div class="thumbs">${evs.map((e) => evHtml(e)).join("")}</div>` : "";
    return `<div class="row p-${t.prioridad} ${done ? "done" : ""}" data-id="${t._id}">
      <button class="circle" type="button" data-toggle="${t._id}" aria-label="${done ? "Marcar pendiente" : "Marcar completada"}" ${ro ? "disabled" : ""}>${ICON_CHECK}</button>
      <div class="t"><div class="title">${esc(t.titulo)}</div>${parts.length ? `<div class="sub">${parts.join(" · ")}</div>` : ""}${thumbs}</div>
      <div class="side">
        ${!done && !ro ? `<button class="ico" type="button" data-proc="${t._id}" title="${t.estado === "en_proceso" ? "Volver a pendiente" : "Marcar en proceso"}">${t.estado === "en_proceso" ? "⏸" : "▶"}</button>` : ""}
        ${!jefe && !ro && !done ? `<button class="ico" type="button" data-fecha="${t._id}" title="Fecha de entrega">📅</button>` : ""}
        ${!jefe && !ro ? `<button class="ico ${evs.length || t.comentarioTrabajador ? "has" : ""}" type="button" data-note="${t._id}" title="Comentario y evidencias">💬</button>` : ""}
        <button class="ico" type="button" data-info="${t._id}" title="Historial">ⓘ</button>
        ${jefe ? `<button class="ico" type="button" data-edit="${t._id}" title="Editar">✎</button><button class="ico" type="button" data-del="${t._id}" title="Eliminar">×</button>` : ""}
      </div>
    </div>`;
  }

  function listHtml(titulo, sub, items, workerId) {
    const hoy = today();
    const act = items.filter((t) => t.estado !== "completada").sort((a, b) => (a.fechaLimite || "9999").localeCompare(b.fechaLimite || "9999") || a.createdAt.localeCompare(b.createdAt));
    const done = items.filter((t) => t.estado === "completada").sort((a, b) => (b.completadaEn || "").localeCompare(a.completadaEn || ""));
    const jefe = user.rol === "jefe";
    return `<section class="list">
      <h2>${esc(titulo)} ${sub ? `<small>${esc(sub)}</small>` : ""}</h2>
      ${jefe && workerId ? `<button class="add" type="button" data-addfor="${workerId}">${ICON_ADD}Agregar una tarea</button>
      <form class="form ${openForm === workerId ? "open" : ""}" data-formfor="${workerId}" autocomplete="off">
        <input name="titulo" maxlength="150" placeholder="Título" required>
        <textarea name="descripcion" maxlength="2000" placeholder="Detalles" rows="1"></textarea>
        <div class="bar">
          <select name="prioridad"><option value="media">Prioridad media</option><option value="alta">Prioridad alta</option><option value="baja">Prioridad baja</option></select>
          <button class="btn primary" type="submit">Agregar</button>
          <button class="btn ghost" type="button" data-cancel>Cancelar</button>
        </div>
      </form>` : ""}
      <div class="rows">${act.map((t) => rowHtml(t, hoy)).join("") || (jefe ? "" : `<div class="empty">${user.rol === "admin" ? "Sin tareas pendientes." : "No tienes tareas pendientes."}</div>`)}</div>
      ${done.length ? `<details><summary>Completadas (${done.length})</summary><div class="rows">${done.map((t) => rowHtml(t, hoy)).join("")}</div></details>` : ""}
    </section>`;
  }

  // Conserva lo que el usuario está escribiendo en un formulario inline al redibujar
  function snapshotForm() {
    const f = openForm && document.querySelector(`[data-formfor="${openForm}"]`);
    if (!f) return null;
    const active = document.activeElement, campo = active && f.contains(active) ? active.name : null;
    return { titulo: f.titulo.value, descripcion: f.descripcion.value, prioridad: f.prioridad.value, campo, pos: active && active.selectionStart };
  }
  function restoreForm(s) {
    const f = openForm && document.querySelector(`[data-formfor="${openForm}"]`);
    if (!f || !s) return;
    f.titulo.value = s.titulo; f.descripcion.value = s.descripcion; f.prioridad.value = s.prioridad;
    if (s.campo) { const el = f[s.campo]; el.focus(); if (s.pos != null && el.setSelectionRange) try { el.setSelectionRange(s.pos, s.pos); } catch (e) {} }
  }

  function render() {
    const saved = snapshotForm();
    const hoy = today();
    const c = { pendiente: 0, en_proceso: 0, completada: 0, late: 0 };
    tareas.forEach((t) => { c[t.estado]++; if (t.estado !== "completada" && t.fechaLimite && t.fechaLimite < hoy) c.late++; });
    $("cPend").textContent = c.pendiente; $("cProc").textContent = c.en_proceso; $("cDone").textContent = c.completada; $("cLate").textContent = c.late;

    if (user.rol === "admin") {
      // Vista general: una lista por trabajador, agrupada por su jefe de área
      const activos = trabajadores.filter((w) => w.activo);
      $("lists").innerHTML = activos.length
        ? activos.map((w) => listHtml(w.cargo || w.nombre, `${w.cargo ? w.nombre + " · " : ""}Jefe: ${w.jefe ? w.jefe.nombre : "—"}`, tareas.filter((t) => t.asignadoA && t.asignadoA._id === w.id), null)).join("")
        : `<div class="list"><div class="empty">Aún no hay trabajadores. Crea jefes de área; cada uno registra su equipo y asigna sus tareas.</div></div>`;
      $("jefeList").innerHTML = jefes.map((j) => `<div class="team-row ${j.activo ? "" : "off"}">
          <span>${esc(j.nombre)}</span><span class="u">${esc(j.cargo || "")} · usuario: <b>${esc(j.usuario)}</b> · ${j.trabajadores} trabajador${j.trabajadores === 1 ? "" : "es"}</span><span class="sp"></span>
          <button class="link" type="button" data-jpass="${j.id}">Nueva contraseña</button>
          <button class="link" type="button" data-jtoggle="${j.id}" data-on="${j.activo}">${j.activo ? "Desactivar" : "Activar"}</button>
        </div>`).join("") || `<p class="muted">Aún no hay jefes de área.</p>`;
    } else if (user.rol === "jefe") {
      const activos = trabajadores.filter((w) => w.activo);
      $("lists").innerHTML = activos.length
        ? activos.map((w) => listHtml(w.cargo || w.nombre, w.cargo ? w.nombre : "", tareas.filter((t) => t.asignadoA && t.asignadoA._id === w.id), w.id)).join("")
        : `<div class="list"><div class="empty">Crea trabajadores en "Equipo a cargo" para empezar a asignar tareas.</div></div>`;
      $("teamList").innerHTML = trabajadores.map((w) => `<div class="team-row ${w.activo ? "" : "off"}">
          <span>${esc(w.nombre)}</span><span class="u">${esc(w.cargo || "")} · usuario: <b>${esc(w.usuario)}</b></span><span class="sp"></span>
          <button class="link" type="button" data-wpass="${w.id}">Nueva contraseña</button>
          <button class="link" type="button" data-wtoggle="${w.id}" data-on="${w.activo}">${w.activo ? "Desactivar" : "Activar"}</button>
        </div>`).join("") || `<p class="muted">Aún no hay trabajadores.</p>`;
      if (saved) restoreForm(saved);
      else if (openForm) { const f = document.querySelector(`[data-formfor="${openForm}"] input[name=titulo]`); if (f) f.focus(); }
    } else {
      $("lists").innerHTML = listHtml(user.cargo || user.nombre, user.cargo ? user.nombre : "", tareas, null);
    }
  }

  // ---------- Acciones ----------
  function run(fn, msgEl) {
    const el = msgEl || $("appMsg");
    return Promise.resolve().then(fn).then(() => { el.textContent = ""; }, (e) => { el.textContent = e.message; });
  }

  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => { const { user: u } = await api("/auth/login", { method: "POST", body: { usuario: $("lUser").value, password: $("lPass").value } }); $("lPass").value = ""; await showApp(u); }, $("loginMsg"));
  });
  $("btnLogout").addEventListener("click", () => run(async () => { await api("/auth/logout", { method: "POST" }); showLogin(); }));

  $("lists").addEventListener("click", (e) => {
    const b = (a) => e.target.closest(`[${a}]`);
    const add = b("data-addfor"), cancel = b("data-cancel"), tg = b("data-toggle"), pr = b("data-proc"), note = b("data-note"), fecha = b("data-fecha"), info = b("data-info"), ed = b("data-edit"), del = b("data-del"), img = b("data-img");
    if (img) { showImg(img.dataset.img); return; }
    if (add) { openForm = add.dataset.addfor; render(); return; }
    if (cancel) { openForm = null; render(); return; }
    const find = (id) => tareas.find((t) => t._id === id);
    if (tg) { const t = find(tg.dataset.toggle); run(() => setEstado(t, t.estado === "completada" ? "pendiente" : "completada")); }
    if (pr) { const t = find(pr.dataset.proc); run(() => setEstado(t, t.estado === "en_proceso" ? "pendiente" : "en_proceso")); }
    if (note) openNota(find(note.dataset.note));
    if (fecha) openFecha(find(fecha.dataset.fecha));
    if (info) showInfo(find(info.dataset.info));
    if (ed) openEdit(find(ed.dataset.edit));
    if (del) {
      if (del.dataset.confirm) run(async () => { await api("/tareas/" + del.dataset.del, { method: "DELETE" }); await refresh(); });
      else { del.dataset.confirm = "1"; del.textContent = "¿Eliminar?"; setTimeout(() => { delete del.dataset.confirm; del.textContent = "×"; }, 3000); }
    }
  });

  async function setEstado(t, estado, comentario) {
    const body = { estado }; if (comentario !== undefined) body.comentario = comentario;
    await api(`/tareas/${t._id}/estado`, { method: "PATCH", body });
    await refresh();
  }

  let enviando = false; // evita doble envío mientras la petición está en curso
  $("lists").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.closest("[data-formfor]"); if (!f || enviando) return;
    const titulo = f.titulo.value.trim(); if (!titulo) return;
    enviando = true; const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Guardando…";
    run(async () => {
      await api("/tareas", { method: "POST", body: { titulo, descripcion: f.descripcion.value.trim(), prioridad: f.prioridad.value, asignadoA: f.dataset.formfor } });
      f.reset();
      await refresh(); const nf = document.querySelector(`[data-formfor="${f.dataset.formfor}"] input[name=titulo]`); if (nf) nf.focus();
    }).finally(() => { enviando = false; btn.disabled = false; btn.textContent = "Agregar"; });
  });

  // Comentario y evidencias (trabajador)
  let notaTask = null, notaFiles = [];
  function showImg(archivo) { $("imgFull").src = "/uploads/" + archivo; $("imgLink").href = "/uploads/" + archivo; $("dlgImg").showModal(); }
  function renderExistentes() {
    const t = tareas.find((x) => x._id === notaTask._id) || notaTask;
    $("nExistentes").innerHTML = (t.evidencias || []).map((e) => evHtml(e, { del: true })).join("");
  }
  function openNota(t) {
    notaTask = t; notaFiles = [];
    $("notaTitulo").textContent = t.titulo; $("nComentario").value = t.comentarioTrabajador || ""; $("nFotos").value = ""; $("nPreview").innerHTML = ""; $("notaMsg").textContent = "";
    renderExistentes(); $("dlgNota").showModal();
  }
  // Reduce las fotos en el navegador (máx. 1600 px, JPEG) para que suban rápido
  function reducir(file) {
    return new Promise((resolve) => {
      if (!/^image\//.test(file.type) || file.type === "image/gif") return resolve(file);
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
        if (k === 1 && file.size < 1.5 * 1024 * 1024) { URL.revokeObjectURL(url); return resolve(file); }
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  $("nFotos").addEventListener("change", async () => {
    notaFiles = await Promise.all([...$("nFotos").files].slice(0, 5).map(reducir));
    $("nPreview").innerHTML = notaFiles.map((f) => /^image\//.test(f.type) ? `<span class="thumb"><img src="${URL.createObjectURL(f)}" alt=""></span>` : `<span class="doc ${docIcon({ tipo: f.type, archivo: f.name }).toLowerCase()}"><span class="ic">${docIcon({ tipo: f.type, archivo: f.name })}</span><span class="nm">${esc(f.name)}</span></span>`).join("");
  });
  $("nExistentes").addEventListener("click", (e) => {
    const x = e.target.closest("[data-evdel]"), th = e.target.closest("[data-img]");
    if (x) { e.preventDefault(); e.stopPropagation(); run(async () => { const t = await api(`/tareas/${notaTask._id}/evidencias/${x.dataset.evdel}`, { method: "DELETE" }); notaTask = t; await refresh(); renderExistentes(); }, $("notaMsg")); return; }
    if (th) showImg(th.dataset.img);
  });
  $("notaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = $("nGuardar"); btn.disabled = true; btn.textContent = notaFiles.length ? "Subiendo…" : "Guardando…";
    run(async () => {
      if (notaFiles.length) {
        const fd = new FormData(); notaFiles.forEach((f) => fd.append("fotos", f, f.name)); fd.append("comentario", $("nComentario").value.trim());
        const r = await fetch(`/api/tareas/${notaTask._id}/evidencias`, { method: "POST", body: fd });
        const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || "No se pudieron subir las imágenes.");
      } else {
        await api(`/tareas/${notaTask._id}/estado`, { method: "PATCH", body: { estado: notaTask.estado, comentario: $("nComentario").value.trim() } });
      }
      $("dlgNota").close(); await refresh();
    }, $("notaMsg")).finally(() => { btn.disabled = false; btn.textContent = "Guardar"; });
  });

  // Fecha de entrega (la fija el trabajador)
  let fechaTask = null;
  function openFecha(t) {
    fechaTask = t; $("fFecha").value = t.fechaLimite || ""; $("fFecha").min = today(); $("fechaMsg").textContent = ""; $("dlgFecha").showModal();
  }
  $("fechaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => { await api(`/tareas/${fechaTask._id}/fecha`, { method: "PATCH", body: { fechaLimite: $("fFecha").value } }); $("dlgFecha").close(); await refresh(); }, $("fechaMsg"));
  });

  // Equipo
  $("workerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await api("/trabajadores", { method: "POST", body: { nombre: $("wNombre").value.trim(), cargo: $("wCargo").value.trim(), usuario: $("wUsuario").value.trim(), password: $("wPass").value } });
      $("workerForm").reset(); await refresh();
    }, $("teamMsg"));
  });
  $("teamList").addEventListener("click", (e) => {
    const p = e.target.closest("[data-wpass]"), tg = e.target.closest("[data-wtoggle]");
    if (p) { const pw = window.prompt("Nueva contraseña (mín. 6 caracteres):"); if (pw) run(async () => { await api("/trabajadores/" + p.dataset.wpass, { method: "PATCH", body: { password: pw } }); $("teamMsg").textContent = "Contraseña actualizada."; }, $("teamMsg")); }
    if (tg) run(async () => { await api("/trabajadores/" + tg.dataset.wtoggle, { method: "PATCH", body: { activo: tg.dataset.on !== "true" } }); await refresh(); }, $("teamMsg"));
  });

  // Jefes de área (admin)
  $("jefeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await api("/jefes", { method: "POST", body: { nombre: $("jNombre").value.trim(), cargo: $("jCargo").value.trim(), usuario: $("jUsuario").value.trim(), password: $("jPass").value } });
      $("jefeForm").reset(); await refresh();
    }, $("adminMsg"));
  });
  $("jefeList").addEventListener("click", (e) => {
    const p = e.target.closest("[data-jpass]"), tg = e.target.closest("[data-jtoggle]");
    if (p) { const pw = window.prompt("Nueva contraseña (mín. 6 caracteres):"); if (pw) run(async () => { await api("/jefes/" + p.dataset.jpass, { method: "PATCH", body: { password: pw } }); $("adminMsg").textContent = "Contraseña actualizada."; }, $("adminMsg")); }
    if (tg) run(async () => { await api("/jefes/" + tg.dataset.jtoggle, { method: "PATCH", body: { activo: tg.dataset.on !== "true" } }); await refresh(); }, $("adminMsg"));
  });

  // Diálogos
  document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  $("btnPass").addEventListener("click", () => { $("passForm").reset(); $("passMsg").textContent = ""; $("dlgPass").showModal(); });
  $("passForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => { await api("/auth/password", { method: "POST", body: { actual: $("pActual").value, nueva: $("pNueva").value } }); $("dlgPass").close(); }, $("passMsg"));
  });

  function openEdit(t) {
    editing = t;
    $("eTitulo").value = t.titulo; $("eDesc").value = t.descripcion || ""; $("ePrio").value = t.prioridad;
    $("eAsignado").innerHTML = trabajadores.filter((w) => w.activo || w.id === t.asignadoA._id).map((w) => `<option value="${w.id}">${esc(w.nombre)}</option>`).join("");
    $("eAsignado").value = t.asignadoA._id; $("editMsg").textContent = ""; $("dlgEdit").showModal();
  }
  $("editForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await api("/tareas/" + editing._id, { method: "PATCH", body: { titulo: $("eTitulo").value.trim(), descripcion: $("eDesc").value.trim(), prioridad: $("ePrio").value, asignadoA: $("eAsignado").value } });
      $("dlgEdit").close(); await refresh();
    }, $("editMsg"));
  });

  function showInfo(t) {
    $("infoBody").innerHTML = `<h2>${esc(t.titulo)}</h2>
      ${t.descripcion ? `<p class="muted">${esc(t.descripcion)}</p>` : ""}
      <p class="muted">Asignada a <b>${esc(t.asignadoA.nombre)}</b> por ${esc(t.creadoPor?.nombre || "")} · Prioridad ${PRIO[t.prioridad]} · Estado <b>${EST[t.estado]}</b>${t.fechaLimite ? ` · Entrega ${fmt(t.fechaLimite)}` : ""}</p>
      ${t.comentarioTrabajador ? `<p>Comentario del trabajador: “${esc(t.comentarioTrabajador)}”</p>` : ""}
      ${(t.evidencias || []).length ? `<p class="muted">Evidencias:</p><div class="thumbs" id="infoThumbs">${t.evidencias.map((e) => evHtml(e, { title: `${e.nombre || ""} · ${e.subidoPor} · ${fmtDT(e.subidoEn)}` })).join("")}</div>` : ""}
      <ul class="hist">${(t.historial || []).slice().reverse().map((h) => `<li>${fmtDT(h.fecha)} — ${esc(h.usuario)}: ${esc(h.accion)}</li>`).join("")}</ul>`;
    $("dlgInfo").showModal();
  }
  $("infoBody").addEventListener("click", (e) => { const th = e.target.closest("[data-img]"); if (th) showImg(th.dataset.img); });

  // Arranque
  api("/auth/me").then(({ user: u }) => showApp(u)).catch(showLogin);
})();
