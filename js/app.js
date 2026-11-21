import * as db from './db.js';
import { enviarActividad, probarConexion, API_URL } from './api.js';
import { estadoPermiso, pedirPermiso, notificar } from './notify.js';
import { obtenerUbicacion } from './geo.js';

/* ---------- Utilidades ---------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const formatoFecha = (f) => {
  if (!f) return '—';
  const [a, m, d] = f.split('-');
  return `${d}/${m}/${a}`;
};
const formatoMin = (m) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h} h ${r} min` : `${r} min`;
};
const formatoKm = (k) => `${Number(k).toFixed(2)} km`;

let toastTimer;
function toast(mensaje, tipo = 'ok') {
  const t = $('#toast');
  t.textContent = mensaje;
  t.className = `toast visible toast-${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
}

/* ---------- Estado de la aplicación ---------- */
const estado = { estudiantes: [], actividades: [] };

async function cargarDatos() {
  const [estudiantes, actividades] = await Promise.all([
    db.obtenerTodos('estudiantes'),
    db.obtenerTodos('actividades')
  ]);
  estado.estudiantes = estudiantes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  estado.actividades = actividades.sort((a, b) => (b.fecha.localeCompare(a.fecha)) || (b.id - a.id));
}

const nombreEstudiante = (id) => estado.estudiantes.find((e) => e.id === id)?.nombre ?? 'Estudiante eliminado';
const actividadesDe = (id) => (id ? estado.actividades.filter((a) => a.estudianteId === id) : estado.actividades);

function calcularIndicadores(acts) {
  const total = acts.length;
  const minutos = acts.reduce((s, a) => s + Number(a.duracion || 0), 0);
  const km = acts.reduce((s, a) => s + Number(a.distancia || 0), 0);
  const minutosConDistancia = acts.filter((a) => a.distancia > 0).reduce((s, a) => s + a.duracion, 0);
  return {
    total,
    minutos,
    km,
    promedio: total ? minutos / total : 0,
    ritmo: km > 0 ? minutosConDistancia / km : null,
    ultima: total ? acts.map((a) => a.fecha).sort().at(-1) : null
  };
}

/* ---------- Renderizado del lado del cliente (CSR) ---------- */
function tarjeta(titulo, valor, extra = '') {
  return `<div class="tarjeta"><span class="tarjeta-titulo">${esc(titulo)}</span><strong>${esc(valor)}</strong>${extra ? `<small>${esc(extra)}</small>` : ''}</div>`;
}

function renderInicio() {
  const ind = calcularIndicadores(estado.actividades);
  $('#resumen-inicio').innerHTML =
    tarjeta('Estudiantes', estado.estudiantes.length) +
    tarjeta('Actividades', ind.total) +
    tarjeta('Tiempo acumulado', formatoMin(ind.minutos)) +
    tarjeta('Distancia recorrida', formatoKm(ind.km));

  const permiso = estadoPermiso();
  const textos = {
    granted: 'Permitidas: recibirás un aviso al guardar una actividad.',
    denied: 'Bloqueadas en el navegador. Actívalas desde la configuración del sitio.',
    default: 'Aún no se ha concedido el permiso.',
    'no-soportado': 'Este navegador no soporta notificaciones.'
  };
  $('#estado-notif').textContent = textos[permiso];
  $('#btn-notif').hidden = permiso !== 'default';

  const pendientes = estado.actividades.filter((a) => a.sync === 'pendiente').length;
  const enviadas = estado.actividades.length - pendientes;
  $('#estado-sync').textContent = `${enviadas} enviada(s) · ${pendientes} pendiente(s)`;
  $('#btn-sync').disabled = pendientes === 0;

  $('#bloque-demo').hidden = estado.estudiantes.length > 0;
}

function opcionesEstudiantes(select, conTodos) {
  const previo = select.value;
  const opciones = estado.estudiantes.map((e) => `<option value="${e.id}">${esc(e.nombre)} (${esc(e.grupo)})</option>`).join('');
  select.innerHTML = (conTodos ? '<option value="">Todos los estudiantes</option>' : '') + opciones;
  if ([...select.options].some((o) => o.value === previo)) select.value = previo;
}

function renderSelects() {
  opcionesEstudiantes($('#act-estudiante'), false);
  opcionesEstudiantes($('#filtro-historial'), true);
  opcionesEstudiantes($('#filtro-desempeno'), true);
}

function renderEstudiantes() {
  const cont = $('#lista-estudiantes');
  if (!estado.estudiantes.length) {
    cont.innerHTML = '<p class="vacio">No hay estudiantes registrados.</p>';
    return;
  }
  cont.innerHTML = `<div class="tabla-scroll"><table>
    <thead><tr><th>Nombre</th><th>Grupo</th><th>Disciplina</th><th>Actividades</th><th></th></tr></thead>
    <tbody>${estado.estudiantes.map((e) => `<tr>
      <td>${esc(e.nombre)}</td><td>${esc(e.grupo)}</td><td>${esc(e.disciplina)}</td>
      <td>${actividadesDe(e.id).length}</td>
      <td class="acciones">
        <a class="btn btn-sm btn-sec" href="#historial" data-ver="${e.id}">Ver historial</a>
        <button class="btn btn-sm btn-peligro" data-eliminar-estudiante="${e.id}">Eliminar</button>
      </td></tr>`).join('')}</tbody></table></div>`;
}

function filasActividades(acts, conEstudiante = true) {
  return acts.map((a) => {
    const ubic = a.ubicacion
      ? `<a href="https://www.openstreetmap.org/?mlat=${a.ubicacion.lat}&mlon=${a.ubicacion.lng}#map=17/${a.ubicacion.lat}/${a.ubicacion.lng}" target="_blank" rel="noopener">📍 Ver mapa</a>`
      : '—';
    const sync = a.sync === 'enviado'
      ? '<span class="badge badge-ok">Enviado</span>'
      : '<span class="badge badge-pend">Pendiente</span>';
    return `<tr>
      <td>${formatoFecha(a.fecha)}</td>
      ${conEstudiante ? `<td>${esc(nombreEstudiante(a.estudianteId))}</td>` : ''}
      <td>${esc(a.actividad)}${a.observaciones ? `<small class="obs">${esc(a.observaciones)}</small>` : ''}</td>
      <td>${a.duracion} min</td>
      <td>${a.distancia ? formatoKm(a.distancia) : '—'}</td>
      <td>${ubic}</td>
      <td>${sync}</td>
      <td><button class="btn btn-sm btn-peligro" data-eliminar-actividad="${a.id}" aria-label="Eliminar actividad">✕</button></td>
    </tr>`;
  }).join('');
}

function tablaActividades(acts, conEstudiante = true) {
  if (!acts.length) return '<p class="vacio">No hay actividades registradas.</p>';
  return `<div class="tabla-scroll"><table>
    <thead><tr><th>Fecha</th>${conEstudiante ? '<th>Estudiante</th>' : ''}<th>Actividad</th><th>Duración</th><th>Distancia</th><th>Ubicación</th><th>Envío</th><th></th></tr></thead>
    <tbody>${filasActividades(acts, conEstudiante)}</tbody></table></div>`;
}

function renderActividades() {
  const sinEstudiantes = estado.estudiantes.length === 0;
  $('#aviso-sin-estudiantes').hidden = !sinEstudiantes;
  $('#form-actividad').hidden = sinEstudiantes;
  $('#ultimas-actividades').innerHTML = tablaActividades(estado.actividades.slice(0, 5));
}

function renderHistorial() {
  const id = Number($('#filtro-historial').value) || null;
  const acts = actividadesDe(id);
  const ind = calcularIndicadores(acts);
  const encabezado = id
    ? (() => {
        const e = estado.estudiantes.find((x) => x.id === id);
        return `<p class="resumen-linea"><strong>${esc(e.nombre)}</strong> · Grupo ${esc(e.grupo)} · ${esc(e.disciplina)} — ${ind.total} actividad(es), ${formatoMin(ind.minutos)}, ${formatoKm(ind.km)}</p>`;
      })()
    : `<p class="resumen-linea">${ind.total} actividad(es) registradas en total.</p>`;
  $('#tabla-historial').innerHTML = encabezado + tablaActividades(acts, !id);
}

function grafica(datos) {
  if (!datos.length) return '<p class="vacio">Sin datos para graficar.</p>';
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return datos.map((d) => `
    <div class="barra-fila">
      <span class="barra-etiqueta">${esc(d.etiqueta)}</span>
      <div class="barra-pista"><div class="barra" style="width:${(d.valor / max) * 100}%"></div></div>
      <span class="barra-valor">${d.valor} min</span>
    </div>`).join('');
}

function renderDesempeno() {
  const id = Number($('#filtro-desempeno').value) || null;
  const acts = actividadesDe(id);
  const ind = calcularIndicadores(acts);

  $('#indicadores').innerHTML =
    tarjeta('Número de actividades', ind.total) +
    tarjeta('Tiempo acumulado', formatoMin(ind.minutos)) +
    tarjeta('Distancia recorrida', formatoKm(ind.km)) +
    tarjeta('Duración promedio', formatoMin(ind.promedio), 'por actividad') +
    tarjeta('Ritmo promedio', ind.ritmo ? `${ind.ritmo.toFixed(1)} min/km` : '—', 'en actividades con distancia') +
    tarjeta('Última actividad', formatoFecha(ind.ultima));

  let datos;
  if (id) {
    $('#titulo-grafica').textContent = 'Minutos por tipo de actividad';
    const porTipo = {};
    acts.forEach((a) => { porTipo[a.actividad] = (porTipo[a.actividad] || 0) + a.duracion; });
    datos = Object.entries(porTipo).map(([etiqueta, valor]) => ({ etiqueta, valor }));
  } else {
    $('#titulo-grafica').textContent = 'Minutos acumulados por estudiante';
    datos = estado.estudiantes.map((e) => ({ etiqueta: e.nombre, valor: calcularIndicadores(actividadesDe(e.id)).minutos }));
  }
  datos.sort((a, b) => b.valor - a.valor);
  $('#grafica').innerHTML = grafica(datos);

  if (id || !estado.estudiantes.length) {
    $('#ranking').innerHTML = '';
    return;
  }
  const filas = estado.estudiantes
    .map((e) => ({ e, i: calcularIndicadores(actividadesDe(e.id)) }))
    .sort((a, b) => b.i.minutos - a.i.minutos);
  $('#ranking').innerHTML = `<h3 class="subtitulo">Comparativo por estudiante</h3><div class="tabla-scroll"><table>
    <thead><tr><th>#</th><th>Estudiante</th><th>Disciplina</th><th>Actividades</th><th>Tiempo</th><th>Distancia</th></tr></thead>
    <tbody>${filas.map(({ e, i }, n) => `<tr><td>${n + 1}</td><td>${esc(e.nombre)}</td><td>${esc(e.disciplina)}</td><td>${i.total}</td><td>${formatoMin(i.minutos)}</td><td>${formatoKm(i.km)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

const RENDER = {
  inicio: renderInicio,
  estudiantes: renderEstudiantes,
  actividades: renderActividades,
  historial: renderHistorial,
  desempeno: renderDesempeno
};

function rutaActual() {
  const r = location.hash.slice(1);
  return r in RENDER ? r : 'inicio';
}

function render() {
  renderSelects();
  RENDER[rutaActual()]();
}

function navegar() {
  const ruta = rutaActual();
  $$('.vista').forEach((v) => { v.hidden = v.id !== ruta; });
  $$('.tabs a').forEach((a) => a.classList.toggle('activo', a.getAttribute('href') === `#${ruta}`));
  render();
  window.scrollTo(0, 0);
}

async function recargar() {
  await cargarDatos();
  render();
}

/* ---------- Sincronización con el servicio remoto ---------- */
async function sincronizarActividad(act) {
  if (!navigator.onLine) return false;
  try {
    const respuesta = await enviarActividad(act);
    await db.guardar('actividades', { ...act, sync: 'enviado', remoteId: respuesta.id, enviadoEn: new Date().toISOString() });
    return true;
  } catch (err) {
    console.warn('Envío fallido, queda pendiente:', err.message);
    return false;
  }
}

let sincronizando = false;
async function sincronizarPendientes(silencioso = false) {
  if (sincronizando) return;
  const pendientes = estado.actividades.filter((a) => a.sync === 'pendiente');
  if (!pendientes.length) return;
  if (!navigator.onLine) {
    if (!silencioso) toast('Sin conexión: los registros siguen guardados localmente.', 'aviso');
    return;
  }
  sincronizando = true;
  let ok = 0;
  for (const act of pendientes) if (await sincronizarActividad(act)) ok++;
  sincronizando = false;
  await recargar();
  if (ok || !silencioso) toast(`${ok} de ${pendientes.length} actividad(es) enviada(s) al servicio remoto.`, ok ? 'ok' : 'aviso');
}

/* ---------- Validación de formularios ---------- */
function mostrarError(form, mensaje) {
  $('[data-error]', form).textContent = mensaje || '';
}

/* ---------- Eventos ---------- */
$('#form-estudiante').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const nombre = f.nombre.value.trim();
  const grupo = f.grupo.value.trim();
  const disciplina = f.disciplina.value;
  if (!nombre || !grupo || !disciplina) return mostrarError(f, 'Completa nombre, grupo y disciplina.');
  if (nombre.length < 3) return mostrarError(f, 'El nombre debe tener al menos 3 caracteres.');
  mostrarError(f);
  await db.agregar('estudiantes', { nombre, grupo, disciplina, creado: new Date().toISOString() });
  f.reset();
  toast(`Estudiante "${nombre}" registrado.`);
  await recargar();
});

$('#form-actividad').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const boton = $('button[type="submit"]', f);
  const datos = {
    estudianteId: Number(f.estudiante.value),
    fecha: f.fecha.value,
    actividad: f.actividad.value.trim(),
    duracion: Number(f.duracion.value),
    distancia: f.distancia.value ? Number(f.distancia.value) : 0,
    observaciones: f.observaciones.value.trim(),
    ubicacion: null,
    sync: 'pendiente',
    creado: new Date().toISOString()
  };
  if (!datos.estudianteId || !datos.fecha || !datos.actividad || !f.duracion.value) {
    return mostrarError(f, 'Completa estudiante, fecha, actividad y duración.');
  }
  if (datos.fecha > hoy()) return mostrarError(f, 'La fecha no puede ser futura.');
  if (!Number.isInteger(datos.duracion) || datos.duracion < 1 || datos.duracion > 600) {
    return mostrarError(f, 'La duración debe ser un número entero entre 1 y 600 minutos.');
  }
  if (Number.isNaN(datos.distancia) || datos.distancia < 0 || datos.distancia > 300) {
    return mostrarError(f, 'La distancia debe estar entre 0 y 300 km.');
  }
  mostrarError(f);
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    if (f.ubicacion.checked) {
      try {
        datos.ubicacion = await obtenerUbicacion();
      } catch (err) {
        toast(`Se guardará sin ubicación (${err.message}).`, 'aviso');
      }
    }
    // 1) Guardado local (funciona sin conexión)
    datos.id = await db.agregar('actividades', datos);
    const nombre = nombreEstudiante(datos.estudianteId);

    // 2) Notificación local de confirmación
    await notificar('Actividad registrada ✅', `${nombre}: ${datos.actividad} · ${datos.duracion} min${datos.distancia ? ` · ${formatoKm(datos.distancia)}` : ''}`);

    f.reset();
    f.fecha.value = hoy();
    f.estudiante.value = String(datos.estudianteId);
    toast('Actividad guardada en el dispositivo.');
    await recargar();

    // 3) Envío al servicio remoto con Fetch (si hay conexión)
    if (await sincronizarActividad(datos)) {
      await recargar();
      toast('Actividad guardada y enviada al servicio remoto.');
    } else if (!navigator.onLine) {
      toast('Sin conexión: la actividad quedó pendiente de envío.', 'aviso');
    }
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar actividad';
  }
});

document.addEventListener('click', async (e) => {
  const verBtn = e.target.closest('[data-ver]');
  if (verBtn) {
    $('#filtro-historial').value = verBtn.dataset.ver;
    return;
  }

  const estBtn = e.target.closest('[data-eliminar-estudiante]');
  if (estBtn) {
    const id = Number(estBtn.dataset.eliminarEstudiante);
    const n = actividadesDe(id).length;
    if (!confirm(`¿Eliminar a ${nombreEstudiante(id)}${n ? ` y sus ${n} actividad(es)` : ''}?`)) return;
    for (const a of actividadesDe(id)) await db.eliminar('actividades', a.id);
    await db.eliminar('estudiantes', id);
    toast('Estudiante eliminado.');
    await recargar();
    return;
  }

  const actBtn = e.target.closest('[data-eliminar-actividad]');
  if (actBtn) {
    if (!confirm('¿Eliminar esta actividad?')) return;
    await db.eliminar('actividades', Number(actBtn.dataset.eliminarActividad));
    toast('Actividad eliminada.');
    await recargar();
  }
});

$('#filtro-historial').addEventListener('change', renderHistorial);
$('#filtro-desempeno').addEventListener('change', renderDesempeno);

$('#btn-notif').addEventListener('click', async () => {
  const r = await pedirPermiso();
  if (r === 'granted') {
    await notificar('Notificaciones activadas', 'SportSchool te avisará cuando registres una actividad.');
  }
  renderInicio();
});

$('#btn-sync').addEventListener('click', () => sincronizarPendientes());

$('#btn-fetch').addEventListener('click', async () => {
  const salida = $('#resultado-fetch');
  salida.hidden = false;
  salida.textContent = `GET ${API_URL}?_limit=2 …`;
  try {
    const r = await probarConexion();
    salida.textContent = `GET ${API_URL}?_limit=2\nEstado: ${r.estado} · Tiempo: ${r.ms} ms\n\n${JSON.stringify(r.datos, null, 2)}`;
  } catch (err) {
    salida.textContent = `No se pudo contactar al servicio remoto (${err.name === 'AbortError' ? 'tiempo agotado' : err.message}).\nLos datos locales siguen disponibles.`;
  }
});

$('#btn-demo').addEventListener('click', async () => {
  const base = new Date();
  const fecha = (dias) => {
    const d = new Date(base.getTime() - dias * 86400000 - base.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  };
  const ana = await db.agregar('estudiantes', { nombre: 'Ana López Pérez', grupo: '3°B', disciplina: 'Atletismo', creado: new Date().toISOString() });
  const carlos = await db.agregar('estudiantes', { nombre: 'Carlos Ramírez Soto', grupo: '2°A', disciplina: 'Fútbol', creado: new Date().toISOString() });
  const ejemplos = [
    { estudianteId: ana, fecha: fecha(6), actividad: 'Carrera', duracion: 35, distancia: 5, observaciones: 'Ritmo constante' },
    { estudianteId: ana, fecha: fecha(3), actividad: 'Entrenamiento de fuerza', duracion: 45, distancia: 0, observaciones: '' },
    { estudianteId: ana, fecha: fecha(1), actividad: 'Carrera', duracion: 40, distancia: 6.2, observaciones: 'Mejoró su tiempo' },
    { estudianteId: carlos, fecha: fecha(4), actividad: 'Partido', duracion: 60, distancia: 7.5, observaciones: 'Torneo interno' },
    { estudianteId: carlos, fecha: fecha(2), actividad: 'Circuito funcional', duracion: 30, distancia: 0, observaciones: '' }
  ];
  for (const a of ejemplos) {
    await db.agregar('actividades', { ...a, ubicacion: null, sync: 'pendiente', creado: new Date().toISOString() });
  }
  toast('Datos de ejemplo cargados.');
  await recargar();
  sincronizarPendientes(true);
});

/* ---------- Estado de conexión ---------- */
function actualizarRed() {
  const badge = $('#estado-red');
  if (navigator.onLine) {
    badge.textContent = 'En línea';
    badge.className = 'badge badge-ok';
  } else {
    badge.textContent = 'Sin conexión';
    badge.className = 'badge badge-off';
  }
}
window.addEventListener('online', () => {
  actualizarRed();
  toast('Conexión restablecida.');
  sincronizarPendientes(true);
});
window.addEventListener('offline', () => {
  actualizarRed();
  toast('Sin conexión: puedes seguir consultando tus registros.', 'aviso');
});

/* ---------- Instalación ---------- */
let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  $('#btn-instalar').hidden = false;
});
$('#btn-instalar').addEventListener('click', async () => {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar = null;
  $('#btn-instalar').hidden = true;
});
window.addEventListener('appinstalled', () => toast('SportSchool se instaló en tu dispositivo.'));

/* ---------- Service Worker ---------- */
async function registrarSW() {
  const estadoSW = $('#estado-sw');
  if (!('serviceWorker' in navigator)) {
    estadoSW.textContent = 'Este navegador no soporta Service Workers.';
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.version) estadoSW.textContent = `Registrado y activo (${e.data.version}). Recursos principales en caché.`;
    });
    estadoSW.textContent = 'Registrado y activo. Recursos principales en caché.';
    (reg.active || navigator.serviceWorker.controller)?.postMessage('version');
  } catch (err) {
    estadoSW.textContent = `Error al registrar: ${err.message}`;
  }
}

/* ---------- Inicio ---------- */
async function iniciar() {
  actualizarRed();
  $('#form-actividad').fecha.value = hoy();
  $('#form-actividad').fecha.max = hoy();
  try {
    await cargarDatos(); // Recupera los registros al iniciar la aplicación
  } catch (err) {
    toast('No se pudo abrir la base de datos local.', 'error');
    console.error(err);
  }
  window.addEventListener('hashchange', navegar);
  navegar();
  registrarSW();
  sincronizarPendientes(true);

  setTimeout(() => {
    const splash = $('#splash');
    splash.classList.add('oculto');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
  }, 1400);
}

iniciar();
