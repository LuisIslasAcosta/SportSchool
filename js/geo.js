// Característica del dispositivo: Geolocation API (opcional, con autorización del usuario)
export function obtenerUbicacion() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('El navegador no soporta geolocalización'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        precision: Math.round(pos.coords.accuracy)
      }),
      (err) => {
        const mensajes = { 1: 'permiso denegado', 2: 'ubicación no disponible', 3: 'tiempo de espera agotado' };
        reject(new Error(mensajes[err.code] || err.message));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
