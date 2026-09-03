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
| **Atenciones** | Agenda propia (`Citas/ListaPacientesCitados`) cruzada con la ficha clínica del nodo (`FichaClinica/HistorialAtencion`): diagnósticos, actividades, prestador real, atenciones espontáneas sin cita. Filtros, columnas configurables, notas propias por paciente. |
| **Estadísticas** | Tiles y gráficos SVG: día, mes, previsión, tipo, diagnósticos; equipo del hospital por profesión/profesional. |
| **Interconsultas** | Todas las SIC del hospital (`ReferenciaYContrarreferencia/*`) con estado, prioridad, CIE-10, fundamentos, contrarreferencias, PDF. Rol explícito: **Emití / Recibí / Otra**. |
| **Panel del paciente** | Al hacer clic en un nombre: ficha completa (10 años, todos los profesionales) en 4 pestañas — Diagnósticos/antecedentes, Atenciones (anamnesis, prescripciones, exámenes, próximo control), Interconsultas, Recetas (con PDF). Datos administrativos y alertas tras el botón **Datos**. |
| **Explorador API** | Consultas manuales a la API con la sesión activa (solo al origen de Eloisa). |
| **Exportar** | Excel (.xls), CSV, HTML, PDF (vía diálogo de impresión), JSON — siempre lo filtrado en la tabla. |

El mapa completo de endpoints, formas de datos y rarezas de la API está en [`MAPA_API.html`](MAPA_API.html).

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
  cache.js    chrome.storage con runtime.lastError, stores por fecha, prefs
  table.js / stats.js / ic-tab.js / charts.js / patient-panel.js  UI
  export.js   CSV, XLS (SpreadsheetML), HTML, JSON, PDF
  notes.js / pdf.js / dom.js / explorer.js
tests/        parser, sic, historial, ficha, table
```

Convenciones: módulos ES nativos, sin build; `esc()` en todo `innerHTML` con texto de la API; tooltips solo vía `data-tip` (`dom.js → initTooltips`, hover y foco).

## Datos de Rayen que conviene saber

- Fechas `YYYYMMDD HHmmss` (espacio), sentinel `00010101 000000`; zona horaria local (Rapa Nui).
- RUN sin puntos con DV pegado, `k` minúscula posible (`25106217k`).
- `HistorialAtencion` devuelve `IdCita = 0`: el cruce con la agenda es por RUN + día.
- `EsAuge` en SIC es string `"Si"/"No"`. Prioridad SIC 1/2/3 = Alta/Media/Baja es inferida (no confirmada por la API).
