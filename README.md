# Rayen Atenciones — Hospital Hanga Roa

Extensión Chrome (Manifest V3) de uso personal para ver, cruzar y exportar la información clínica del Dr. Daniel Opazo Damiani registrada en Eloisa/Rayen (`clinicohangaroa.eloisa.cl`): agenda, ficha clínica, interconsultas (SIC) y recetas.

No usa librerías ni servicios externos. Todo el código corre en el navegador y habla únicamente con la API de Eloisa usando la sesión ya iniciada.

## Instalación

1. `chrome://extensions` → activar **Modo de desarrollador**.
2. **Cargar extensión sin empaquetar** → elegir esta carpeta.
3. Iniciar sesión en Eloisa en una pestaña. Abrir el popup de la extensión → **Abrir en pestaña completa** → **Cargar datos**.

Tras editar el código: botón ↻ de la extensión en `chrome://extensions`.

## Qué hace

| Pestaña | Contenido |
|---|---|
| **Hoy** | El parte de la mañana, en tres bloques: **Novedades** (qué cambió desde la última carga en las interconsultas vigiladas), **Pendientes** (bucles vencidos según reglas explicables) y la **agenda del día** con los antecedentes de cada paciente. El contador del ícono muestra pendientes, no citas: una alerta que hay que ir a buscar es una alerta que no existe. |
| **Atenciones** | Agenda propia (`Citas/ListaPacientesCitados`) cruzada con la ficha clínica del nodo (`FichaClinica/HistorialAtencion`): diagnósticos, actividades, prestador real, atenciones espontáneas sin cita. Filtros, columnas configurables, notas propias por paciente. |
| **Estadísticas** | Tiles con porcentajes (pacientes únicos, atenciones/día, inasistencia, GES, diagnóstico…) y gráficos SVG donde cada barra lleva valor y porcentaje: día, mes, hora, sexo, grupo etario, visitas por paciente, estado, razón, GES, tipo, diagnósticos, certeza; interconsultas por especialidad, estado, prioridad y contrarreferencia (% sin CR por especialidad); equipo del hospital por profesión/profesional/tipo. |
| **Interconsultas** | Todas las SIC del hospital (`ReferenciaYContrarreferencia/*`) con estado, prioridad, CIE-10, fundamentos, contrarreferencias, PDF. Rol explícito: **Emití / Recibí / Otra**. |
| **Panel del paciente** | Al hacer clic en un nombre: ficha completa (10 años, todos los profesionales) en 4 pestañas — Diagnósticos/antecedentes, Atenciones (anamnesis, prescripciones, exámenes, próximo control), Interconsultas, Recetas (cada receta con su PDF). Datos administrativos y alertas tras **Datos**. Botón **PDF ▾** con la historia imprimible: atenciones de todos los profesionales / solo médicos / solo mías, interconsultas del paciente, o historia completa (atenciones + IC + fármacos y recetas). |
| **Explorador API** | Consultas manuales a la API con la sesión activa (solo al origen de Eloisa). |
| **Exportar** | Excel (.xls), CSV, HTML, PDF (vía diálogo de impresión), JSON — siempre lo filtrado en la tabla. |

El mapa completo de endpoints, formas de datos y rarezas de la API está en [`MAPA_API.html`](MAPA_API.html).

## Pendientes: las reglas

Las interconsultas del hospital son **internas** (origen y destino son el nodo 5576): el especialista está en el mismo edificio. Por eso una contrarreferencia que falta es una brecha de registro, no de logística. En el trimestre analizado, **131 de 174** solicitudes atendidas no tenían contrarreferencia en Rayen.

Cada regla dice qué disparó, sobre qué dato y desde cuándo. Umbrales en `config.js → pendientes`.

| Regla | Dato | Umbral |
|---|---|---|
| Atendida sin contrarreferencia | `contrarreferencias.length === 0` en SIC atendida/egresada | 30 días |
| Interconsulta sin cursar | SIC en estado «Nueva» (13) | 21 días |
| Cita pasada sin resolver | `fechaCita` anterior a hoy y estado agendada/confirmada | 7 días |
| Control vencido sin agendar | `OrdenAtencionInterna.FechaSugerida` pasada, sin atención posterior del paciente | 1 día |

**Honestidad incorporada**: «sin contrarreferencia en Rayen» no es «no llegó información». Pudo llegar por correo, en papel o de palabra. La interfaz lo dice en cada lugar donde aparece.

**Memoria de cambio** (`src/watch.js`): guarda una huella de las SIC de las especialidades vigiladas (`config.js → watchEspecialidades`, por defecto Gastroenterología Adulto y Reumatología) y en cada carga reporta qué cambió: contrarreferencia que llegó, cambio de estado, cita confirmada, solicitud nueva. La primera lectura solo registra.

**Contrarreferencia**: columna propia en Interconsultas (fecha y profesional, o «Falta» si la solicitud está atendida), bloque destacado al expandir la fila, y filtro «Falta — atendida y sin contrarreferencia». Los tiles del resumen filtran al hacer clic. Rayen guarda quién y cuándo contrarrefirió, no el texto: el contenido está en el PDF de la solicitud.

## Permisos y por qué

| Permiso | Uso |
|---|---|
| `tabs`, `scripting` | Leer el `accessToken` desde `localStorage` de la pestaña de Eloisa (world MAIN). No se inyecta nada en la página. |
| `storage`, `unlimitedStorage` | Caché local de agenda, ficha y SIC (6–12 meses superan los 10 MB por defecto). |
| `host_permissions: clinicohangaroa.eloisa.cl` | Único origen al que se envía el token (`src/http.js → resolveUrl` lo garantiza). |

## Privacidad

- Los datos clínicos descargados se guardan **en claro** en `chrome.storage.local` del perfil de Chrome (hasta 13 meses; se podan solos). Úsala solo en un equipo propio con disco cifrado.
- El token de sesión vive en `chrome.storage.session` (memoria): no se escribe en disco.
- **✕ Borrar ▾ → Borrar caché** elimina agenda, ficha y SIC; las notas propias (`rayen_notes_v1`) se conservan. **Borrar todos los datos** vacía todo el almacenamiento de la extensión (notas, preferencias y token incluidos) tras doble confirmación.
- El reporte que se abre para imprimir/PDF se borra del almacenamiento en cuanto se muestra.
- Si la sesión de Eloisa vence (HTTP 401/403), la carga se detiene en la primera llamada fallida y la barra de estado ofrece **Abrir Eloisa**; al volver a esta pestaña con sesión nueva, se recarga sola.
- Los archivos exportados contienen datos de pacientes: trátalos como tal.
- **Bloqueo por inactividad**: a los 15 minutos sin uso la pantalla se difumina tras un aviso y hay que pulsar «Continuar». Es una pantalla de privacidad frente a quien pase por el lado, no autenticación: la protección real sigue siendo la sesión del sistema operativo.

## Desarrollo

```bash
npm install        # solo ESLint (dev)
npm run lint       # eslint .
npm test           # node --test, sin dependencias
npm run check      # lint + test
npm run pack       # genera rayen-extension-<versión>.zip
```

Estructura:

```
app.html / app.js        pestaña principal (orquestador)
popup.html / popup-init.js
report.html / report.js  reporte imprimible (exportar → PDF)
src/
  config.js   constantes, estados SIC, catálogos inferidos
  http.js     apiGet/apiPost/apiBlob con guardia de origen
  auth.js     token desde la pestaña de Eloisa
  parser.js   fechas, RUN (DV módulo 11), EdadExacta, parseCita, parseAtencion
  api.js      agenda por día, caché incremental, orquesta historial
  historial.js HistorialAtencion por día + cruce con la agenda (RUN + día)
  ficha.js    ficha por paciente (10 años, todas las secciones) + antecedentes + programas
  sic.js      interconsultas: ids, detalle, contrarreferencias
  today.js    parte matinal: novedades + pendientes + agenda con antecedentes
  pendientes.js  motor de reglas explicables sobre datos ya descargados
  watch.js    memoria de cambio de las interconsultas vigiladas
  lock.js     bloqueo por inactividad (pantalla de privacidad)
  cache.js    chrome.storage con runtime.lastError, stores por fecha, prefs
  table.js / stats.js / ic-tab.js / charts.js / patient-panel.js  UI
  export.js   CSV, XLS (SpreadsheetML), HTML, JSON, PDF
  notes.js / pdf.js / dom.js / explorer.js
tests/        parser, sic, historial, ficha, table, stats, export, pendientes (reglas + memoria de cambio), ui-contract
```

Convenciones: módulos ES nativos, sin build; `esc()` en todo `innerHTML` con texto de la API; tooltips solo vía `data-tip` (`dom.js → initTooltips`, hover y foco); colores solo vía tokens CSS (`:root`, con bloque `prefers-color-scheme: dark`) — los SVG de gráficos también los usan.

## Sistema de diseño

Toda la hoja de estilos se construye sobre tokens; no hay valores sueltos que reinventen la escala.

| | Valores |
|---|---|
| **Tipografía** | 5 pasos: `--t-xs 12` · `--t-sm 13` (celdas de tabla) · `--t-base 15` (cuerpo) · `--t-lg 18` · `--t-xl 24` |
| **Espaciado** | Escala de 4 px: `--sp-1` … `--sp-6` |
| **Radios** | 3: `--r-sm 4` · `--r-md 8` · `--r-full` |
| **Color** | Semántico. Cada color de texto es ≥4.5:1 sobre su superficie; **`--ink-4` nunca se usa para texto**, solo bordes e iconos. |

Criterios visuales: la jerarquía la llevan el tamaño y el peso, no el color. Los estados se leen como punto de color + palabra (`.st`), no como píldoras rellenas — solo GES y las banderas U/E/📎 conservan fondo, porque son alertas genuinas. Separación por filetes de 1 px en lugar de cajas; sin cebra en las tablas. El verde de marca queda reservado a la acción primaria y al estado activo.

**El RUN del paciente** se trata como identificador clínico, no como metadato: 12 px, `--ink-2` (7,84:1) y cifras tabulares.

**La prioridad de las SIC** se muestra como el código que envía Rayen (`P1`/`P2`/`P3`) con la inferencia explicada al pasar el cursor. La API nunca envía una etiqueta, así que la interfaz no inventa «Alta/Media/Baja».

## Accesibilidad y apariencia

- **Teclado**: pestañas (app y panel) con ←/→/Home/End; cabeceras de la tabla ordenan con Enter/Espacio y exponen `aria-sort`; nombres de paciente, líneas de IC, filas de SIC y visitas del panel son enfocables y se activan con Enter/Espacio; `Esc` cierra el panel. Los tooltips aparecen también al enfocar.
- **Modo oscuro**: sigue al sistema (`prefers-color-scheme`); no hay toggle propio.
- **`prefers-reduced-motion`**: desactiva transiciones.
- Los offsets de los elementos fijos se calculan (`--w-fecha`, `--pp-head` medido con `ResizeObserver`), no están cableados en píxeles.
- Íconos en `icons/` (PNG 16/32/48/128), generados con `python3` sin dependencias; `npm run pack` produce el .zip instalable (33 archivos, sin tests ni node_modules).

## Datos de Rayen que conviene saber

- Fechas `YYYYMMDD HHmmss` (espacio), sentinel `00010101 000000`; zona horaria local (Rapa Nui).
- RUN sin puntos con DV pegado, `k` minúscula posible (`25106217k`).
- `HistorialAtencion` devuelve `IdCita = 0`: el cruce con la agenda es por RUN + día.
- `EsAuge` en SIC es string `"Si"/"No"`. Prioridad SIC 1/2/3 = Alta/Media/Baja es inferida (no confirmada por la API).
