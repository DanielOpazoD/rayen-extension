# Historial de cambios

## 2.4.0 — 2026-09-03

- Reorganiza la cabecera con una jerarquía clara entre opciones de carga, actualización y acciones secundarias.
- Convierte Ficha clínica en un interruptor visual y adapta las acciones a pantallas estrechas sin desbordar la página.
- Mueve el borrado de caché y datos fuera de la barra principal hacia una sección explícita de Datos locales dentro de Preferencias.
- Cambia Ajustes por Preferencias y moderniza tamaños, radios, estados presionados y navegación horizontal.

## 2.3.0 — 2026-09-03

- Permite combinar varios tipos de atención desde un selector moderno con casillas, resumen compacto y uso por teclado.
- Reduce el estado de una carga terminada al dato relevante: el total de atenciones.
- Retira el bloque de pendientes de Hoy para devolver el foco a las novedades y a la jornada; los pendientes siguen disponibles en Pacientes y en el contador de la extensión.

## 2.2.0 — 2026-09-03

- Muestra por separado el estado de Agenda, Ficha clínica e Interconsultas, con último intento y última actualización completa.
- Identifica las fechas que quedaron pendientes sin almacenar datos de pacientes en el registro de sincronización.
- Permite reintentar únicamente las fechas pendientes de agenda y ficha, y fuerza un nuevo intento completo de interconsultas cuando corresponde.
- Conserva la última instantánea completa de interconsultas si una actualización de red llega incompleta.
- Distingue visualmente datos actualizados, caché, carga parcial, error, ejecución en curso y ficha desactivada.

## 2.1.0 — 2026-09-03

- Refactoriza la aplicación en estado, acciones y controladores de pestañas separados.
- Vuelve a consultar fechas históricas con atenciones iniciadas, confirmadas, agendadas o en espera y refresca también su ficha clínica; si esa segunda lectura falla, conserva el reintento pendiente.
- Corrige el menú Ajustes y su estado accesible.
- Evita confirmar visualmente una nota cuando el almacenamiento falló.
- Navega entre pacientes mediante identidad estable en vez del nombre visible.
- Amplía el contrato de módulos para incluir subdirectorios e importaciones por namespace.
- Limpia la vista de interconsultas cuando una recarga o borrado devuelve una lista vacía.
- Añade verificación de publicación y CI privado en GitHub.
