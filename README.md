# Rayen Atenciones — Hospital Hanga Roa

Extensión Chrome (Manifest V3) de uso personal para ver, cruzar y exportar la información clínica del Dr. Daniel Opazo Damiani registrada en Eloisa/Rayen (`clinicohangaroa.eloisa.cl`): agenda, ficha clínica, interconsultas (SIC) y recetas.

No usa librerías ni servicios externos. Todo el código corre en el navegador y habla únicamente con la API de Eloisa usando la sesión ya iniciada.

Para continuar el desarrollo, comienza por el [`mapa de documentación`](DOCUMENTATION_MAP.md) y la [`arquitectura canónica`](ARCHITECTURE.md). Ahí están los flujos, invariantes, responsables y puertas de calidad vigentes.

## Informe con IA

El botón **Informe** del panel del paciente arma un registro clínico canónico (agenda, ficha, interconsultas y el laboratorio analizado en Exámenes complementarios), produce un contexto sin nombre, RUN ni nombres de profesionales y con fechas relativas, y aplica una plantilla (resumen clínico, epicrisis ambulatoria, informe para interconsulta, informe de exámenes). La persona ve el contexto exacto, copia el prompt, lo pega en el modelo que el hospital autorice y pega la respuesta; el informe se arma en el equipo con la identidad repuesta y un pie de revisión. El proveedor por API existe y viene apagado. Límite conocido: un tercero nombrado en texto libre sin «Sra.», «hija» u otro tratamiento delante no se reconoce; la hoja lo dice y muestra el contexto entero para revisarlo antes de copiarlo. Detalle en [ARCHITECTURE.md](ARCHITECTURE.md), sección «Flujo con IA».

## Instalación

1. `chrome://extensions` → activar **Modo de desarrollador**.
2. **Cargar extensión sin empaquetar** → elegir esta carpeta.
3. Iniciar sesión en Eloisa en una pestaña. Abrir el popup de la extensión → **Abrir en pestaña completa** → **Cargar datos**.

Tras editar el código: botón ↻ de la extensión en `chrome://extensions`.

## Qué hace

| Pestaña | Contenido |
|---|---|
| **Hoy** | Una jornada enfocada: **Novedades** muestra qué cambió desde la última carga en las interconsultas vigiladas y la **agenda del día** presenta los antecedentes de cada paciente. Los pendientes no ocupan esta vista; siguen disponibles en Pacientes y en el contador del ícono. |
| **Pacientes** | Una fila por persona, no por cita: última atención, número de visitas, diagnósticos activos (con GES), interconsultas abiertas, pendientes y tu nota. Ordenable por cualquier columna, con filtros rápidos (con IC abierta · con pendientes · GES · con nota mía · vistos una sola vez) y exportación CSV. Responde «¿quiénes son mis pacientes con X?», que antes obligaba a exportar a Excel. |
| **Atenciones** | Agenda propia (`Citas/ListaPacientesCitados`) cruzada con la ficha clínica del nodo (`FichaClinica/HistorialAtencion`): diagnósticos, actividades, prestador real, atenciones espontáneas sin cita. Filtros, columnas configurables, notas propias por paciente. |
| **Estadísticas** | Tiles con porcentajes (pacientes únicos, atenciones/día, inasistencia, GES, diagnóstico…) y gráficos SVG donde cada barra lleva valor y porcentaje: día, mes, hora, sexo, grupo etario, visitas por paciente, estado, razón, GES, tipo, diagnósticos y certeza; interconsultas por especialidad, estado y prioridad; equipo del hospital por profesión/profesional/tipo. |
| **Interconsultas** | Todas las SIC del hospital (`ReferenciaYContrarreferencia/*`) con estado, prioridad, CIE-10, fundamentos y PDF. Rol explícito: **Emití / Recibí / Otra**. La extensión no presenta como información clínica el metadato administrativo que Rayen denomina contrarreferencia. |
| **Panel del paciente** | Al hacer clic en un nombre: ficha completa (10 años, todos los profesionales) en 4 pestañas — Problemas (con peso: GES y crónicos primero), Atenciones (anamnesis, prescripciones, exámenes, próximo control), Interconsultas, Recetas (cada receta con su PDF). Datos administrativos y alertas desde las iniciales del paciente. Fila de acciones: **Historia ▾** (historia imprimible), **Informe IA** y **Laboratorio** (abre Exámenes complementarios con el RUN). Cada receta lleva su impresora. La historia imprimible: atenciones de todos los profesionales / solo médicos / solo mías, interconsultas del paciente, o historia completa (atenciones + IC + fármacos y recetas). |
| **Explorador API** | Consultas manuales a la API con la sesión activa (solo al origen de Eloisa). |
| **Exportar** | Excel (.xls), CSV, HTML, PDF (vía diálogo de impresión), JSON — siempre lo filtrado en la tabla. |

El mapa completo de endpoints, formas de datos y rarezas de la API está en [`MAPA_API.html`](MAPA_API.html).

## Filtros, períodos y ajustes

- **Una sola fila de controles**: buscador + chips de período + `Filtros`. Los demás (estado, tipo, diagnóstico, IC, fecha exacta, día, sexo, previsión, prestador y rango desde–hasta) viven plegados; el botón muestra cuántos hay activos (`Filtros · 3`). **Tipo de atención** permite combinar varias opciones mediante casillas. Lo mismo en Interconsultas.
- **Período**: chips *Todo · Hoy · Esta semana · Este mes · 30 días · 90 días · Este año*; las fechas explícitas mandan sobre el chip.
- La altura de las tablas se **mide**, no se cablea: al plegar los filtros la tabla crece sola.
- **Interconsultas**: cabeceras ordenables (fecha, días, paciente, especialidad, prioridad, estado y solicitante), filtros de GES y prioridad, exportación CSV y Excel de lo filtrado.
- **Hoy**: flechas ◀ ▶, selector de fecha y botón «Hoy» para ver cualquier jornada.
- **Preferencias** (cabecera): refresco automático (apagado / 5 / 15 / 30 / 60 min), bloqueo por inactividad (idem), pestaña inicial, umbrales en días de cada regla de pendientes, especialidades vigiladas para Novedades y gestión de datos locales. Todo se guarda al instante en `chrome.storage.local` (`rayen_prefs_v1`) junto con densidad, columnas y orden de la tabla.
- La búsqueda de Atenciones también cubre las notas propias.

## Sin callejones sin salida

- **⌘K / Ctrl+K** (o `/`) abre el buscador de pacientes desde cualquier pestaña: nombre o RUN, ignora acentos, ↑↓ y ↵.
- **Clic en el RUN** lo copia al portapapeles — en la tabla y en el panel.
- **‹ ›** en el panel recorre los pacientes en el orden en que los muestra la tabla; también con ←/→.
- **Clic en una barra** de Estadísticas filtra la tabla por ese valor y salta a la pestaña correspondiente.
- **Cancelar** detiene una carga larga sin perder lo ya descargado: aborta las peticiones de la carga en vuelo y no encola más; los días interrumpidos quedan pendientes, no «fallidos». Cada petición a Eloisa tiene un tiempo límite (20 s por defecto, ajustable en Preferencias; la ficha completa de un paciente espera el triple), así que una red muda nunca deja la carga colgada.
- **Actualizar estados históricos**: los días que todavía contienen citas iniciadas, confirmadas, agendadas o en espera se vuelven a consultar. Si una atención se completa posteriormente en Eloisa, la extensión actualiza tanto su estado como su ficha clínica sin borrar todo el caché.
- **Sincronización verificable y compacta**: junto al total aparece únicamente el estado global (`Al día`, `Pendiente` o `Error`). Al abrirlo se muestran Agenda, Ficha clínica e Interconsultas, con último intento, último éxito completo y fechas pendientes; «Reintentar» vuelve a pedir solo esas fechas y nunca presenta una carga parcial como completa.
- **Exportar → Mis notas** vuelca una fila por paciente con nota. Cada exportación confirma con un aviso.
- Los estados vacíos traen el botón para cargar, en vez de solo decirlo.

## Nada se pierde: deshacer y respuesta visual

- **Deshacer** en los avisos: borrar una nota o limpiar los filtros deja un aviso con «Deshacer» durante 6 s. La barra inferior muestra cuánto queda, y **pasar el cursor lo pausa** — si lo estás leyendo, el reloj espera. Por eso el editor de notas no pregunta «¿estás seguro?».
- **Vuelves a la fila donde estabas**: al cerrar el panel, la fila del paciente se centra y pulsa un segundo. Lo mismo tras guardar una nota.
- **Confirmación donde hiciste clic**: el RUN se convierte en «✓ copiado» un instante, en vez de solo avisar abajo.
- **Esqueletos** con la forma de la tabla y de las tarjetas mientras carga, en lugar de la palabra «Cargando…». También en el panel mientras baja la ficha.
- El **título de la pestaña** muestra el avance (`38% · Ficha clínica — Rayen`), así puedes irte a otra pestaña y volver.
- Todo respeta `prefers-reduced-motion`: sin animaciones, el estado final se ve igual.

## Pendientes: las reglas

Cada regla dice qué disparó, sobre qué dato y desde cuándo. Umbrales en `config.js → pendientes`.

| Regla | Dato | Umbral |
|---|---|---|
| Interconsulta sin cursar | SIC en estado «Nueva» (13) | 21 días |
| Interconsulta rechazada | SIC rechazada por destino, paciente o sistema (7, 27, 30) | hasta 90 días: después es historia |
| Cita pasada sin resolver | `fechaCita` anterior a hoy y estado agendada/confirmada | 7 días |
| Control vencido sin agendar | `OrdenAtencionInterna.FechaSugerida` pasada, sin atención posterior del paciente | 1 día |

**Memoria de cambio** (`src/io/watch.js`): guarda una huella de las SIC de las especialidades vigiladas (`config.js → watchEspecialidades`, por defecto Gastroenterología Adulto y Reumatología) y en cada carga reporta cambios de estado, citas confirmadas y solicitudes nuevas. La primera lectura solo registra.

## Permisos y por qué

| Permiso | Uso |
|---|---|
| `tabs`, `scripting` | Leer el `accessToken` desde `localStorage` de la pestaña de Eloisa (mundo aislado: la página no puede interceptar la lectura). No se inyecta nada en la página. |
| `storage`, `unlimitedStorage` | Caché local de agenda, ficha y SIC (6–12 meses superan los 10 MB por defecto). |
| `host_permissions: clinicohangaroa.eloisa.cl` | Único origen al que se envía el token (`src/io/http.js → resolveUrl` lo garantiza). |

## Privacidad

- Los datos clínicos descargados se guardan en `chrome.storage.local` del perfil de Chrome **cifrados** con una clave derivada de un PIN de seis dígitos que se crea la primera vez (AES-GCM, PBKDF2 con 300 000 iteraciones). El PIN se pide al abrir y tras el bloqueo por inactividad; cambiarlo (Preferencias) vuelve a cifrar todo. **Si lo olvidas, se pierden la caché y tus notas: no hay recuperación.** Retención por defecto de 3 meses, ajustable. Protege el perfil copiado o abierto por otra persona, no la pantalla desbloqueada; un adversario con el disco y tiempo puede probar el millón de PIN posibles, a segundos por intento.
- El token de sesión vive en `chrome.storage.session` (memoria): no se escribe en disco.
- **Preferencias → Datos locales → Vaciar caché** elimina agenda, ficha y SIC; las notas propias (`rayen_notes_v1`) se conservan. **Eliminar todo** vacía todo el almacenamiento de la extensión (notas, preferencias y token incluidos) tras doble confirmación.
- El reporte que se abre para imprimir/PDF viaja por `chrome.storage.session` (memoria) y se borra en cuanto se muestra.
- Si la sesión de Eloisa vence (HTTP 401/403), la carga se detiene en la primera llamada fallida y la barra de estado ofrece **Abrir Eloisa**; al volver a esta pestaña con sesión nueva, se recarga sola.
- Los archivos exportados contienen datos de pacientes: trátalos como tal.
- **Bloqueo por inactividad**: a los 15 minutos sin uso la pantalla se difumina tras un aviso, la clave de cifrado se descarta y «Continuar» pide el PIN. Lo ya pintado queda bajo el velo inerte; la protección de la pantalla desbloqueada sigue siendo la sesión del sistema operativo.

## Desarrollo

```bash
npm install        # herramientas de desarrollo y pruebas
npx playwright install chromium # una vez por equipo, instala el navegador del smoke
npm run lint       # eslint .
npm test           # node --test, sin dependencias
npm run test:e2e   # smoke Playwright en escritorio y ventana estrecha, con datos sintéticos
npm run cycles:check # sin ciclos de importación en src/
npm run docs:check # mapa de módulos completo, capa de cada módulo y rutas citadas existentes
npm run check      # lint + test + ciclos + documentación + release
npm run pack       # genera rayen-extension-<versión>.zip
```

La estructura completa y la responsabilidad de cada archivo viven en [`ARCHITECTURE.md`](ARCHITECTURE.md); el CI exige que su mapa incluya cada módulo de `src/` exactamente una vez.

El smoke de navegador levanta `dev/`, que usa la aplicación real con almacenamiento Chrome simulado y datos inventados, incluida una ficha clínica sintética por paciente (`/dev/?ficha=off` simula la ficha caída). Para ver la forma real de las respuestas sin datos personales, importa una copia anonimizada del Explorador con `node scripts/import-capture.mjs <archivo.json> <endpoint>`; queda en `dev/fixtures/` (no versionada) y el arnés la sirve al abrir `/dev/?ficha=capturas`. El arnés responde en local también a los laboratorios (HSR y SysLab), así que ninguna solicitud abandona `localhost`; no sustituye una prueba de la extensión cargada ni una sesión autenticada de Eloisa.

Convenciones: módulos ES nativos, sin build, en cuatro capas (`core` → `io` → `ai` → `ui`) que el lint hace cumplir, con funciones de hasta 150 líneas útiles y módulos de hasta 500; `esc()` en todo `innerHTML` con texto de la API; tooltips solo vía `data-tip` (`dom.js → initTooltips`, hover y foco); la interfaz vive en `app.html` y su sistema visual en `styles/app.css`. Los colores salen de tokens CSS (`:root`, con bloque `prefers-color-scheme: dark`) — los SVG de gráficos también los usan. Las diez convenciones completas están en [`ARCHITECTURE.md`](ARCHITECTURE.md), sección «Convenciones de código».

## Sistema de diseño

Toda la hoja de estilos se construye sobre tokens; no hay valores sueltos que reinventen la escala.

| | Valores |
|---|---|
| **Tipografía** | 5 pasos: `--t-xs 12` · `--t-sm 13` (celdas de tabla) · `--t-base 15` (cuerpo) · `--t-lg 18` · `--t-xl 24` |
| **Espaciado** | Escala de 4 px: `--sp-1` … `--sp-6` |
| **Radios** | 3: `--r-sm 6` · `--r-md 10` · `--r-full` |
| **Color** | Semántico. Cada color de texto es ≥4.5:1 sobre su superficie; **`--ink-4` nunca se usa para texto**, solo bordes e iconos. |

Criterios visuales: la jerarquía la llevan el tamaño y el peso, no el color. Los estados se leen como punto de color + palabra (`.st`), no como píldoras rellenas — solo GES y las banderas U/E/📎 conservan fondo, porque son alertas genuinas. Separación por filetes de 1 px en lugar de cajas; sin cebra en las tablas. El verde de marca queda reservado a la acción primaria y al estado activo.

**El RUN del paciente** se trata como identificador clínico, no como metadato: 12 px, `--ink-2` (7,84:1) y cifras tabulares.

**La prioridad de las SIC** se muestra como el código que envía Rayen (`P1`/`P2`/`P3`) con la inferencia explicada al pasar el cursor. La API nunca envía una etiqueta, así que la interfaz no inventa «Alta/Media/Baja».

## Accesibilidad y apariencia

- **Teclado**: «Saltar al contenido» evita recorrer toda la cabecera; pestañas (app y panel) con ←/→/Home/End; cabeceras de la tabla ordenan con Enter/Espacio y exponen `aria-sort`; nombres de paciente, líneas de IC, filas de SIC y visitas del panel son enfocables y se activan con Enter/Espacio; `Esc` cierra el panel. Los tooltips aparecen también al enfocar.
- **Modo oscuro**: sigue al sistema (`prefers-color-scheme`); no hay toggle propio.
- **`prefers-reduced-motion`**: desactiva transiciones.
- Los offsets de los elementos fijos se calculan (`--w-fecha`, `--pp-head` medido con `ResizeObserver`), no están cableados en píxeles.
- Íconos en `icons/` (PNG 16/32/48/128), generados con `python3` sin dependencias; `npm run pack` valida el proyecto y produce el `.zip` instalable sin tests ni `node_modules`.

## Datos de Rayen que conviene saber

- Fechas `YYYYMMDD HHmmss` (espacio), sentinel `00010101 000000`; zona horaria local (Rapa Nui).
- RUN sin puntos con DV pegado, `k` minúscula posible (`25106217k`).
- `HistorialAtencion` devuelve `IdCita = 0`: el cruce con la agenda es por RUN + día.
- `EsAuge` en SIC es string `"Si"/"No"`. Prioridad SIC 1/2/3 = Alta/Media/Baja es inferida (no confirmada por la API).
