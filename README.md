# SportSchool – PWA de Seguimiento y Desempeño Deportivo Escolar

Aplicación web progresiva para que docentes de educación física y entrenadores registren estudiantes, capturen sus actividades deportivas y consulten su historial e indicadores de desempeño, incluso sin conexión a Internet.

**Tecnologías:** HTML5, CSS3 y JavaScript (módulos ES), IndexedDB, Service Worker + Cache API, Fetch API, Notifications API y Geolocation API. No requiere instalar dependencias.

## Estructura del proyecto

```
SportSchool/
├── index.html              # App Shell: Splash, Home y los 5 módulos
├── manifest.webmanifest    # Nombre, íconos, colores y modo standalone
├── sw.js                   # Service Worker: precarga, caché y modo offline
├── css/styles.css          # Estilos responsivos (mobile first)
├── js/
│   ├── app.js              # Lógica principal, navegación y renderizado (CSR)
│   ├── db.js               # Almacenamiento local con IndexedDB
│   ├── api.js              # Solicitudes Fetch (GET y POST) al servicio remoto
│   ├── notify.js           # Notificaciones locales
│   └── geo.js              # Geolocalización (opcional)
└── icons/                  # Logo SportSchool en 192, 512, maskable, favicon y Apple
```

## Cómo ejecutarla

El Service Worker necesita un contexto seguro (HTTPS o `localhost`), así que no se debe abrir el `index.html` con doble clic. Desde la carpeta del proyecto:

```bash
python3 -m http.server 8080
# o bien
npx serve .
```

Después abrir `http://localhost:8080` en Chrome.

### Publicación en GitHub Pages
1. Subir la carpeta a un repositorio.
2. *Settings → Pages → Deploy from a branch → main / (root)*.
3. La app queda en `https://<usuario>.github.io/<repositorio>/` (todas las rutas son relativas, por lo que funciona en subcarpeta).

## Módulos

| Módulo | Qué hace |
|---|---|
| Splash y Home | Pantalla inicial animada y página principal con resumen y accesos |
| Registro de estudiantes | Nombre, grupo y disciplina deportiva |
| Registro de actividad | Fecha, actividad, duración (min), distancia (km), observaciones y ubicación opcional |
| Historial deportivo | Registros de actividades filtrados por estudiante |
| Desempeño | Número de actividades, tiempo acumulado, distancia, duración promedio, ritmo (min/km), gráfica y comparativo |
| Almacenamiento local | IndexedDB (`sportschool-db`, almacenes `estudiantes` y `actividades`) |
| Datos remotos | `POST` de cada actividad y `GET` de prueba con Fetch API |
| Funcionamiento offline | Service Worker con Cache API (estrategia red-primero para navegación y caché-primero para recursos) |
| Notificaciones | Notificación local al guardar una actividad, con permiso previo |
| Característica del dispositivo | Geolocation API para guardar la ubicación de la actividad |

## Servicio remoto (Fetch)

Se usa el endpoint de prueba `https://jsonplaceholder.typicode.com/posts`. Responde como un servidor real (código 201 y un `id`), pero **no guarda los datos**, así que la sincronización es demostrativa. Cada actividad muestra si quedó *Enviada* o *Pendiente*; si no hay conexión queda pendiente y se reenvía al recuperar la red o con el botón **Enviar pendientes**. Para usar el endpoint del docente basta con cambiar `API_URL` en `js/api.js`.

## Guía de pruebas (criterios de aceptación)

1. **Pantalla principal y módulos:** abrir la app; se ve el Splash y luego el Home con los accesos.
2. **Registro:** dar de alta un estudiante y al menos dos actividades (o usar *Cargar datos de ejemplo*).
3. **Persistencia:** recargar la página (F5); los registros siguen ahí. En DevTools → *Application → IndexedDB → sportschool-db* se ven los datos.
4. **Historial e indicadores:** revisar los módulos Historial y Desempeño.
5. **Fetch API:** botón *Probar Fetch* en el Home y columna *Envío* en el historial. En DevTools → *Network* se ven el `GET` y el `POST`.
6. **Offline:** DevTools → *Network → Offline* (o *Application → Service Workers → Offline*) y recargar; la app y los datos siguen disponibles. En *Application → Cache Storage* aparece `sportschool-v1.1.0`.
7. **Notificación:** pulsar *Activar notificaciones*, aceptar el permiso y guardar una actividad.
8. **Lighthouse:** DevTools → *Lighthouse* → categoría *Progressive Web App / Best practices*.
9. **Geolocalización:** marcar *Registrar ubicación*, aceptar el permiso y abrir el enlace *Ver mapa* del historial.

> No se implementan notificaciones push desde servidor ni Background Sync; de acuerdo con la nota de la actividad, se cubren las funcionalidades esenciales.
# SportSchool
