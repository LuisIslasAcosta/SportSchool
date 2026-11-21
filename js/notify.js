// Notificaciones locales (requieren permiso del usuario y contexto seguro)
export function estadoPermiso() {
  if (!('Notification' in window)) return 'no-soportado';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function pedirPermiso() {
  if (!('Notification' in window)) return 'no-soportado';
  return Notification.requestPermission();
}

export async function notificar(titulo, cuerpo) {
  if (estadoPermiso() !== 'granted') return false;
  const opciones = {
    body: cuerpo,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'sportschool-actividad',
    renotify: true
  };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      await reg.showNotification(titulo, opciones);
    } else {
      new Notification(titulo, opciones);
    }
    return true;
  } catch (err) {
    console.warn('No se pudo mostrar la notificación', err);
    return false;
  }
}
