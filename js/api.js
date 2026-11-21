// Comunicación con el servicio remoto mediante Fetch API.
// Endpoint de prueba (JSONPlaceholder): acepta GET y POST y responde como un servidor real,
// pero NO guarda los datos. Si el docente proporciona otro endpoint, basta con cambiar API_URL.
export const API_URL = 'https://jsonplaceholder.typicode.com/posts';
const TIEMPO_LIMITE = 8000;

async function fetchConLimite(url, opciones = {}) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIEMPO_LIMITE);
  try {
    return await fetch(url, { ...opciones, signal: control.signal });
  } finally {
    clearTimeout(timer);
  }
}

// POST: envía una actividad registrada al servicio remoto
export async function enviarActividad(actividad) {
  const resp = await fetchConLimite(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      title: `Actividad: ${actividad.actividad}`,
      body: actividad,
      userId: actividad.estudianteId
    })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// GET: consulta de prueba para demostrar la comunicación con el servicio
export async function probarConexion() {
  const inicio = performance.now();
  const resp = await fetchConLimite(`${API_URL}?_limit=2`);
  const datos = await resp.json();
  return { estado: resp.status, ms: Math.round(performance.now() - inicio), datos };
}
