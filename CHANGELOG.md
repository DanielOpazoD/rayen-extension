# Historial de cambios

## 2.50.0 — 2026-09-05

Saneamiento, tanda 3 de 4: vallas de complejidad.

- **Lint más estricto**: funciones de hasta 100 líneas útiles (antes 150), complejidad ciclomática máxima 40 (antes sin regla; meta declarada 25) y máximo cinco parámetros por función. Todo `src/` cumple.
- Para cumplirlo se partieron, sin cambiar comportamiento y con sus pruebas en verde: `parseSIC` (paciente, personas y diagnóstico aparte), `computePendientes` (una función por regla), `buildClinicalRecord` (fuentes y antecedentes aparte), el recorrido del anonimizador (predicado de persona compartido con la recolección de nombres, reemplazo por clave aparte) y `buildAnalysis` (informes y tendencias aparte). `listIds` y `bandRect` reciben un objeto en vez de seis parámetros.
- El controlador de Exámenes complementarios ya no calcula: el período va a `core/period.js` (`periodoDesde`, con prueba) y la selección recibe los datos por parámetro.

## 2.49.0 — 2026-09-05

Saneamiento, tanda 2 de 4: duplicación.

- **`core/dates.js`**: una sola implementación de Date ↔ «YYYYMMDD», días entre fechas, retención en meses y formatos de laboratorio. Desaparecen cuatro copias de «Date → YYYYMMDD», ocho de «YYYYMMDD → Date», dos cálculos de retención a mano (interconsultas e historial, que además diferían de `retentionMin8`) y dos formateadores que se llamaban igual que `parser.fmtDate` haciendo otra cosa.
- **`core/labels.js` y `core/sort.js`**: lo puro de la tabla (día con hora, letra del sexo, rol en la interconsulta, «tipo · razón», orden por columna) sale de `ui/table.js`; el mapa Emití/Recibí/Otra deja de estar copiado tres veces.
- **Una sola «es mía»**: `esMiaAtencion` en `core/sic-rules.js` reemplaza cuatro copias (historial, panel, historia imprimible); `pendientes` reutiliza `isMine`.
- JSDoc en los 16 exports de `core` que no lo tenían; pruebas de tabla para `core/dates.js`.
- **Nueva valla**: la prueba de contrato comprueba que cada import con nombre exista en el módulo que lo exporta. El navegador se niega a arrancar ante uno roto y `node --test` nunca carga la interfaz; esta tanda dejó dos así y el arnés los detectó tarde.

## 2.48.0 — 2026-09-05

Saneamiento, tanda 1 de 4 (auditoría independiente de estructura, modularidad, pruebas y documentación).

- **Lo puro vive en `core`.** Se mueven a `src/core/` cinco piezas que no tocaban red ni DOM pero vivían en `io`, fuera de la valla de lint que garantiza su pureza: el cruce agenda–historial (`historial-merge.js`), el análisis de interconsultas (`sic-parse.js`), el plan de sincronización (`sync-plan.js`), las reglas de salud de sincronización (`sync-rules.js`) y el monitor de sesión de laboratorios (`lab-session.js`). Sus pruebas ya no necesitan el Chrome falso.
- **Documentación corregida y vigilada.** Cinco afirmaciones que ya no eran ciertas (dos módulos de `io` listados como núcleo, «agregación pura» y «cálculos puros» en módulos que pintan, «único origen» con tres `host_permissions`, cancelación de interconsultas). `docs:check` ahora exige que cada módulo figure bajo el encabezado de su capa.
- **Anonimizador: una fecha-hora de Rayen ya no pasa por RUN pegado.** Con el desplazamiento aleatorio de fechas, una fecha como «20260815 080000» tenía verificador válido en su octavo dígito y la comprobación final rechazaba la descarga («quedarían restos: RUT pegado»); era el fallo que parecía intermitente en el recorrido del Explorador. Regresión añadida.
- Pruebas nuevas para `core/sic-rules.js` e `io/explorer.js` (token sólo a Eloisa, errores como resultado, resumen de campos).

## 2.47.0 — 2026-09-04

- **Cruce exacto con la cita.** Pregunta de Daniel: ¿y si el paciente tuvo dos citas en diez días? Ahora, para cada atención mía sin cita ese día, la sincronización pide ese único día del paciente a Rayen (la consulta por paciente sí trae `IdCita` y `FechaCita`) y enlaza la cita exacta, aunque no sea la más cercana. La heurística por cercanía queda sólo para cuando esa consulta falla, y entonces el tooltip de la fecha dice «cruce estimado por cercanía». Una cita declarada que no está en la agenda cargada no se adivina.

## 2.46.2 — 2026-09-04

- **Ficha abierta la víspera.** Si abres la ficha el jueves para la cita del viernes, la atención queda guardada el jueves y aparecía como día de atención. El cruce con la agenda ahora mira también las citas de los 7 días siguientes (antes, sólo 14 días hacia atrás) y elige la más cercana; sólo se excluyen citas no atendidas, anuladas, canceladas o suspendidas. La fila cae en el día de la cita y el jueves queda limpio.

## 2.46.1 — 2026-09-04

- El registro tardío de la ficha va detrás de un icono «i» discreto junto a la fecha; el texto completo está en el tooltip y en la historia imprimible.
- **Agenda, Hoy y calendario por fecha de la cita**: una ficha mía cerrada otro día (hasta 14 después) se cruza con la cita atendida más cercana del mismo paciente y cuenta en el día de la cita, en vez de aparecer como espontánea el día del guardado. El tooltip de la fecha en la tabla dice cuándo se registró.

## 2.46.0 — 2026-09-04

- **La fecha de una atención es la de su cita.** Si la ficha se guardó o cerró otro día (al día siguiente o semanas después), el panel, la historia imprimible y el informe IA la ordenan y fechan por la cita, y muestran «registrada el dd-mm-aaaa» al lado. Antes la fecha de guardado competía con la de la cita. Aplica a la ficha por paciente, que trae `FechaCita`; el historial diario por nodo no la trae y sigue por fecha de guardado.
- Arnés: cada cuarta atención mía se guarda dos días después de la cita.

## 2.45.1 — 2026-09-04

- **Pantalla de PIN rediseñada**: emblema de candado, nombre de la aplicación, seis casillas que se van llenando (el campo real queda invisible encima), botón a todo el ancho y pie con lo esencial. Al sexto dígito, desbloquea sola; al crear, pasa a la confirmación. Un PIN incorrecto sacude la tarjeta y vacía las casillas. Modo oscuro cuidado.
- La pantalla de bloqueo por inactividad usa el mismo emblema: la marca en cruz se dibujaba encima del título.

## 2.45.0 — 2026-09-04

Recetas con la autoridad de Rayen (HAR «ficha amb» del 04-09-2026).

- **«Activa» lo dice Rayen**: la lista de fármacos en uso (la que trae `RecuperarAntecedentes`, idéntica a `FichaClinica/FarmacoEnUso`) decide qué recetas y prescripciones están activas, con el estado de la receta («Por Despachar»). La duración escrita queda de respaldo para lo que no aparece ahí, y cada fila dice quién afirma su estado. Si la lista no llegó, la pestaña lo avisa.
- **Detalle de la receta al desplegarla**: botón circular en cada receta; la primera vez consulta `Farmacia/Receta/id=…` y muestra vigencia (o «vencida el»), próximo despacho, periodicidad y, por prescripción, despachado de total, suspensión con fecha y observación. Una consulta por receta; recargar la ficha la repite.
- Arnés: detalle sintético por receta (cada tercera con una prescripción suspendida y despacho parcial) y fármacos en uso que citan recetas reales del historial.

## 2.44.1 — 2026-09-04

- Datos del paciente mostraba «Previsión» dos veces.

## 2.44.0 — 2026-09-04

Panel del paciente, ajustes pedidos por Daniel con datos reales.

- **Pestaña «Antecedentes»** (antes «Problemas») con una sola lista: los diagnósticos de las atenciones, con peso, y los antecedentes mórbidos de la ficha, unidos por nombre; antes el mismo problema aparecía en dos listas. Los que sólo vienen de la ficha se marcan «antecedente».
- **Botón claro para desplegar una atención**: un círculo con chevrón a la derecha de cada atención con contenido; gira al abrir.
- **El estado de la ficha vive dentro de Datos** (al pulsar las iniciales del paciente); el avatar lleva un punto ámbar o rojo cuando la ficha es parcial o falló, y su nombre accesible incluye el estado. Desaparece el botón «Ficha».

## 2.43.1 — 2026-09-04

- **Carga automática al abrir**: la agenda se carga sola (caché primero, red después) sin pulsar «Actualizar». Se apaga en Preferencias («Cargar al abrir»). El título de la pestaña vuelve al que tenía al arrancar cuando termina la carga.

## 2.43.0 — 2026-09-04

Cifrado en reposo (ADR 0001, opción B, elegida por Daniel).

- **PIN de seis dígitos**: la primera vez la aplicación pide crearlo y cifra lo que ya había; después lo pide al abrir. Todo lo que se guarda en el perfil de Chrome (agenda, ficha, interconsultas, notas, preferencias) queda cifrado con AES-GCM 256 y una clave derivada por PBKDF2 (300 000 iteraciones, sal por instalación). La clave sólo vive en memoria de la pestaña.
- **El bloqueo por inactividad descarta la clave** y «Continuar» pide el PIN. Cambiar el PIN (Preferencias → PIN de cifrado) vuelve a cifrar todo. «Eliminar todo» borra también el PIN.
- **Si el PIN se olvida, se pierden la caché y las notas**: la pantalla lo dice al crearlo y el README lo repite. Retención por defecto de tres meses (antes trece).
- El informe imprimible viaja por `chrome.storage.session` (memoria) en vez de escribirse en disco.
- Un valor cifrado sin clave nunca se devuelve a medias: `LockedError`. Sin PIN creado (pruebas y arnés) el almacenamiento sigue en claro; `/dev/?pin=1` ejercita la pantalla y el cifrado en el recorrido.
- Cinco pruebas unitarias (cifrado en disco, bloqueo, migración, cambio de PIN, borrado) y un recorrido de Playwright.

## 2.42.0 — 2026-09-04

Anonimizador con segunda pasada, lo que dos revisores señalaron como la puerta más débil del informe con IA y de la captura del Explorador.

- **Segunda pasada independiente de los nombres conocidos**: RUN pegado al estilo Rayen sólo si el dígito verificador es válido (una fecha o un identificador de ocho dígitos no pasa por RUN), teléfonos en cualquier formato (con o sin +56, paréntesis, guiones, espacios, fijos con prefijo), fechas dentro del texto (desplazadas como las demás, para conservar los intervalos), personas tras un tratamiento o parentesco («Dra. Paula Tepano», «hija Vaitiare Pakarati», «Paciente Rosa Tuki») y claves por subcadena o de rol (`MedicoTratante`, `NombreCompletoPaciente`, `numDocumentoCompleto`, `Titular`). Los catálogos (`NombreExamen`, diagnósticos) se conservan; un nombre de varias palabras deja un solo marcador.
- **Comprobación final con los mismos detectores** sobre el resultado entero, claves incluidas; `restos` nombra el tipo de lo que quedó (persona, RUT con formato, RUT pegado, correo, teléfono) y la interfaz no descarga ni copia.
- **La hoja de informe y el Explorador dicen exactamente qué comprueban** y el límite que sigue: un tercero en texto libre sin tratamiento ni parentesco delante no se detecta.
- Diez pruebas adversariales tomadas de los balances 6 y 7.

## 2.41.0 — 2026-09-04

Robustez y pruebas, tras el balance 7 (5,4/7).

- **Una cita nula en la respuesta de Eloisa ya no tumba la carga**: se salta y las demás se guardan (prueba de regresión).
- **Anonimizador en tiempo lineal**: las expresiones de correo y teléfono tenían cuantificadores sin tope y un texto largo congelaba la pestaña (40 000 caracteres, 6 s). Prueba con 200 000 caracteres.
- **El arnés no sale a Internet**: los orígenes de los laboratorios (HSR y SysLab) también responden 503 en local, salvo cuando un recorrido los simula; el README lo afirmaba sin que fuera cierto para Exámenes complementarios.
- **Pruebas que matan mutaciones**: escape de comillas en atributos, token rechazado entregado por la pestaña de Eloisa, umbral inclusivo de pendientes, poda en el día exacto del límite, extremos de `inRange`, nota propagada a todas las filas del paciente. Y `npm test` vuelve a durar segundos: una prueba dejaba un temporizador de 100 s vivo.

## 2.40.0 — 2026-09-04

Panel del paciente, ajustes pedidos por Daniel.

- **Sin pestaña Resumen**: Problemas, con los diagnósticos por peso, vuelve a ser la primera pestaña. Cuatro pestañas en vez de cinco.
- **Impresora en cada receta**: dentro de cada atención y en la pestaña Recetas, un botón con icono de impresora abre el PDF de la receta de Eloisa (antes sólo «PDF» en Recetas).
- **Cabecera rediseñada**: nombre en una sola línea con RUN y edad debajo, navegación ‹ › y cierre a la derecha, y una fila propia de acciones en píldoras con icono: **Historia ▾**, **Informe IA** y **Laboratorio**. El nombre ya no se parte en dos líneas.

## 2.39.0 — 2026-09-04

Arnés con ficha clínica: el panel, las recetas, la portada y el informe con IA se ejercitan por fin en los recorridos.

- **Ficha sintética por paciente** (`dev/ficha-fixture.js`): las siete respuestas que la extensión pide a Eloisa (ficha administrativa, historial de diez años con anamnesis, prescripciones, recetas, órdenes de control, una atención de urgencia con evolución, antecedentes, programas, vigencias, riesgo y RAM), con las claves reales de las capturas y valores inventados, deterministas por paciente. El stub de Chrome del arnés enruta cada endpoint; antes todo respondía 503 y un tercio del código clínico nunca corría en el navegador.
- `/dev/?ficha=off` reproduce la ficha caída; `/dev/?ficha=capturas` sirve copias anonimizadas reales importadas con `node scripts/import-capture.mjs <archivo> <endpoint>`, que vuelve a pasar el anonimizador y rechaza RUT, correos y teléfonos. Los fixtures no se versionan.
- Dos recorridos nuevos: panel con ficha completa (problemas, atención con cuerpo desplegable, recetas, informe que declara la ficha completa y un contexto sin apellidos) y panel con ficha caída (título honesto, Atenciones y Recetas con «Ficha no disponible»). Treinta recorridos en total.

## 2.38.0 — 2026-09-04

Red y sincronización, con las correcciones de una revisión adversarial de los PR #27–#31.

- **Tiempo límite por tipo de llamada**: 20 s para la agenda y la ficha diaria, 60 s para la ficha completa de un paciente (una sola llamada de diez años). Nueva preferencia «Espera máxima por petición» (20 / 40 / 60 / 90 s); la ficha completa espera el triple. Una ficha a medias ya no se recuerda 30 minutos: el siguiente intento vuelve a pedirla.
- **Cancelar sólo cancela la carga**. Desde 2.34.0 la bandera de cancelación quedaba puesta y hacía fallar con «Carga cancelada» el panel del paciente, las interconsultas y los PDF hasta la siguiente carga. Ahora sólo las peticiones de la carga llevan la señal, la bandera se repone al terminar, y no depende de `AbortSignal.any` (Chrome anteriores a 116 abortan igual). Un día cancelado queda pendiente, no «fallido», y el estado de sincronización lo muestra como pendiente.
- **Plan de sincronización** (`io/sync-plan.js`, puro y con pruebas): fechas del período, refrescos por estado mutable, reintentos y historial acoplado en un solo objeto documentado; la carga lo ejecuta en dos pasos (agenda, ficha) sobre un `SyncRun` en vez de una bolsa de dieciséis parámetros.
- **Token rechazado**: tras un 401 la extensión recuerda el token y no lo vuelve a entregar aunque la pestaña de Eloisa siga mostrándolo; una carga nueva vuelve a darle una oportunidad. La sesión vencida al cargar la ficha del panel avisa de verdad (2.34.0 lo afirmaba, pero la carga de la ficha nunca lanzaba) y el aviso de sesión no se cuenta como «fuente fallida».
- **Escape y flechas de verdad**: Escape con un menú abierto cerraba también el panel (el recorrido lo daba por bueno por la transición de 200 ms); las flechas en Exportar y Preferencias saltaban opciones por el menú «⋯» anidado, y Columnas no respondía. Corregido y probado con un recorrido que espera la transición.
- La hoja de informe se cierra con Escape desde cualquier foco; «Pendientes: ninguno» en una línea se reconoce como sección con su cuerpo; una SIC rechazada deja de ser pendiente a los 90 días.

## 2.37.1 — 2026-09-04

Documentación, cierre del saneamiento.

- ARCHITECTURE.md reescrito sobre el código actual: tabla de capas con lo que cada una puede y no puede importar, diez convenciones de código (responsabilidad, tamaño, estado, errores, HTML, idioma, pruebas, honestidad, documentación, entrega), flujos del panel, de exámenes complementarios, del informe con IA y de la captura anonimizada, cuatro invariantes nuevos (tiempo límite y cancelación, capas sin ciclos, identidad fuera del contexto de IA, prueba negativa por garantía), tabla «dónde hacer cada cambio» con las rutas vigentes y las puertas de calidad completas.
- README: sección «Informe con IA» con el límite conocido, cancelación que aborta en vuelo, regla de interconsulta rechazada, `cycles:check`, capas y límites de tamaño.
- DOCUMENTATION_MAP: capas y verificación de rutas en el flujo de contribución.

## 2.37.0 — 2026-09-04

Flujo de informe con IA, ajustes tras el balance 6.

- **El laboratorio entra al informe**: los resultados del análisis vigente en Exámenes complementarios pasan al registro clínico si son del mismo RUN (`ai/lab-items.js`), con fecha, valor, referencia y marca de alerta. La hoja indica cuántos resultados incluye.
- **Antecedentes honestos con la ficha caída**: el contexto dice «Ficha clínica no disponible: … no se pudieron consultar. No asumas que no existen» en vez de «Alergias: sin datos».
- Fechas de las notas en hora local (antes salían en UTC: «en 1 días» para una nota de la tarde); singulares correctos («hace 1 mes», «en 1 día»).
- El reconocimiento de la respuesta del modelo acepta títulos en negrita, con numeración «1)», con coletillas entre paréntesis o con dos puntos, y avisa de secciones repetidas.

## 2.36.0 — 2026-09-04

Flujos, tercera tanda del saneamiento: lo que los revisores encontraron roto o confuso, con un recorrido de Playwright por cada arreglo.

- **Botón «Lab» del panel** volvía a funcionar: cerraba el panel antes de leer el sexo del paciente y fallaba en silencio. Ahora abre Exámenes complementarios con el RUN.
- **Escape jerárquico**: cierra primero el menú abierto o la hoja de informe, y sólo después el panel. Los menús (PDF, Exportar, Columnas, Preferencias) se recorren con ↓ ↑ Inicio Fin y se cierran con clic fuera.
- **«Detalle» de sincronización** se cierra con clic fuera, Escape o al cambiar de pestaña; antes tapaba el contenido y el botón «Consultar» del Explorador.
- **Chip «+n» de interconsultas** era inclicable: quedaba bajo la celda de notas. La celda es ahora una fila flexible y el chip conserva su sitio.
- **Interconsulta rechazada** (por destino, paciente o sistema) es un pendiente con decisión, aparece en la portada del panel y en Pacientes como «n rechazadas»; antes se contaba entre las «cerradas».
- **Honestidad con la ficha caída**: Atenciones dice «Ficha no disponible (n fuentes fallaron); se muestra la agenda» y Recetas «no se pudieron consultar las recetas», en vez de afirmar que no hay.
- Contraste: días de otro mes en el calendario y botón «Ficha» pasan de 2,4:1 a más de 4,5:1.

## 2.35.0 — 2026-09-04

Modularidad, segunda tanda del saneamiento. Sin cambios de comportamiento.

- **Panel del paciente en once módulos** (`src/ui/panel/`): cabecera y datos, portada, problemas, atenciones, interconsultas, recetas, diario de notas, menú PDF, estado de la ficha y piezas compartidas. `patient-panel.js` queda como controlador de 280 líneas (antes 650) y cada pestaña recibe el paciente y su filtro como parámetros en vez de leer variables del módulo.
- **Exámenes complementarios en cinco módulos** (`src/ui/lab/`): tablas de órdenes, vistas del análisis, solicitud impresa y PDF único; el controlador pasa de 730 a 425 líneas.
- **Carga de la agenda en pasos con nombre** (`io/api.js`): `fetchAgendaBatches` y `syncHistorial` sustituyen una función de 187 líneas; la pestaña Atenciones cablea orden, filtros, desplazamiento, filas y exportación en funciones separadas.
- **Límites en el lint**: ninguna función de más de 150 líneas útiles ni módulo de más de 500 (catálogos, arnés, pruebas y scripts exentos). El código actual cumple sin excepciones.

## 2.34.0 — 2026-09-04

Cimientos, primera tanda tras el balance 6 (ingeniería 5,0 · clínico 4,6 · seguridad 4,0).

- **Red con tiempo límite y cancelación real** (`io/http.js`): cada petición a Eloisa se aborta a los 20 s; «Cancelar» aborta lo que está en vuelo y no encola más lotes. Antes una red muda dejaba la carga colgada. Un 401/403 invalida además la copia del token en `storage.session`. Errores nuevos `TimeoutError` y `CancelledError`, traducidos por `core/errors.js`. La sesión vencida al cargar la ficha del panel avisa igual que la carga principal.
- **Estado sin mutaciones externas**: `setLoadedMonths` y `setRendered` en `io/state.js`; las pestañas ya no escriben en el estado a mano.
- **Sin ciclos de importación**: `isMine` y `contactsFromSICs` pasan a `core/sic-rules.js` (el registro clínico de IA ya no importa un cargador); `state.js` deja de importar `sic.js`. Nuevo `scripts/check-cycles.mjs` en `npm run check`.
- **Capa core sin código de navegador**: `lab-pdf-text.js` y `lab-report.js` (cargan pdf.js) pasan a `io/`; el lint prohíbe en `core` los `import()` en tiempo de ejecución.
- **Pruebas negativas** para tres garantías que antes nadie defendía: el token no sale del origen de Eloisa (`fetch` no se llama), la marca del laboratorio fuerza la alerta, y el anonimizador devuelve `verificado=false` cuando un nombre sobrevive donde su recorrido no llega. Más pruebas de tiempo límite, cancelación e invalidación del token.
- **Documentación verificada**: `docs:check` exige ahora que toda ruta `src/…` citada en ARCHITECTURE.md, README.md y DOCUMENTATION_MAP.md exista (había 24 rutas viejas); corregidos «world MAIN» en README y la afirmación de que el manifiesto bloquea la API de IA.

## 2.33.1 — 2026-09-04

- El informe con IA muestra el RUN con puntos y guion, como el panel; venía en bruto desde la agenda.

## 2.33.0 — 2026-09-04

Botón «Informe» en el panel del paciente: el flujo con IA, usable desde hoy con el proveedor manual.

- **Hoja «Informe con IA»** sobre el panel: plantilla (resumen clínico, epicrisis, interconsulta, exámenes), ventana de meses, fechas reales o relativas, estado de cada fuente, el contexto exacto que se enviará (visible antes de copiar), «Copiar prompt», pegar la respuesta del modelo autorizado, «Armar informe» con la identidad repuesta en local, «Imprimir / PDF» y «Copiar Markdown».
- Con un nombre o RUN que sobreviva en el contexto, la hoja lo dice y no deja copiar.
- Escape cierra la hoja sin cerrar el panel; el cambio de paciente la cierra.
- Recorrido de Playwright: el contexto no contiene el apellido ni RUN del paciente y el informe final sí lleva su nombre.

## 2.32.0 — 2026-09-04

Núcleo de IA (`src/ai/`), segundo paso del saneamiento. Sin interfaz todavía; sin cambios de comportamiento visibles.

- **Registro clínico canónico** (`record.js`): agenda, ficha, interconsultas, laboratorio, imagenología y biopsias en una sola forma de datos con procedencia por fuente y estados honestos (completa, parcial, fallida, ausente). Registro de fuentes (`sources.js`) con imagenología (MMARD) y biopsias declaradas como pendientes.
- **Contexto desidentificado** (`context.js`): sin nombre, RUN ni nombres de profesionales (también borrados del texto libre), fechas relativas a hoy, ventana por meses, presupuesto de tamaño que recorta lo más antiguo y lo declara, y comprobación final: con restos no hay prompt.
- **Plantillas** (`templates.js`): resumen clínico, epicrisis ambulatoria, informe para interconsulta e informe de exámenes; personalizadas con validación; prompt con títulos exactos y reglas fijas (no inventar, «Sin datos en el registro»).
- **Proveedores** (`provider.js`): manual (copiar prompt, pegar respuesta; sin red) y API de Anthropic por Messages API, apagado sin clave y sin permiso de host. Reconocimiento de la respuesta por secciones, con faltantes y «Sin datos».
- **Informe** (`report.js`): identidad repuesta en local, secciones no entregadas marcadas, pie con origen y espacio de revisión; Markdown → HTML para imprimir.
- 13 pruebas nuevas cubren el ciclo completo, incluida la garantía de que nombre y RUN no aparecen en el contexto.

## 2.31.0 — 2026-09-04

Saneamiento estructural, primer paso de la preparación para flujos con IA. Sin cambios de comportamiento.

- **Tres capas con dependencia en un solo sentido**: `src/core/` (dominio puro: análisis de Eloisa, laboratorio, orden clínico, calendario, anonimizador), `src/io/` (Eloisa, SysLab, ProactiveLIS, almacenamiento y estado) y `src/ui/` (DOM, pestañas, panel, gráficos, informes). `src/ai/` queda reservada.
- **Vallas en el lint**: `core` no puede usar `document`, `window`, `chrome` ni `fetch`, ni importar de `io`/`ui`; `io` y `ai` no importan de `ui`. Comprobado con una prueba negativa.
- `ficha.js` se divide en análisis puro (`core/ficha.js`) y carga (`io/ficha-load.js`); `esc` pasa a `core/text.js` y cuatro módulos que armaban HTML dejan de depender del DOM; la impresión de la solicitud de exámenes pasa a la interfaz.
- `docs:check` exige que todo módulo viva en una capa; ARCHITECTURE.md documenta las capas y el mapa de 70 módulos.

## 2.30.0 — 2026-09-04

Captura anonimizada en el Explorador API, para estudiar la forma real de las respuestas sin datos del paciente.

- **«Descargar copia anonimizada»** guarda el JSON del cuadro de respuesta sin nombres ni apellidos (también borrados dentro del texto libre), sin RUT, correos, teléfonos ni direcciones; los identificadores pasan a números correlativos que conservan las relaciones y todas las fechas se desplazan el mismo número de días, que no se informa. Los catálogos (diagnósticos, especialidades, tipos) se conservan.
- **Comprobación final**: si algún nombre, RUT o correo sobreviviera, no se descarga y se indica qué quedó.
- **Capturas de esta sesión**: las respuestas crudas de la ficha del último paciente abierto (HistorialAtencion, antecedentes, programas, vigencias, riesgo, RAM) y las citas de la agenda se pueden elegir sin volver a consultar. El cuadro de respuesta admite pegar cualquier JSON.
- Módulo puro `src/anonimizar.js` con pruebas; recorrido de Playwright que descarga y verifica que el archivo no lleva datos de la muestra.

## 2.29.0 — 2026-09-04

Ajustes pedidos por Daniel sobre el panel con datos reales, la navegación y el calendario.

- **Resumen sin calificadores ni chapas**: los problemas activos muestran sólo la fecha (el peso ya está en el orden); desaparecen «crónico», «recurrente», «n veces» y las alertas (Estrato, EMP, PSA). En la pestaña Problemas queda «código · última fecha».
- **Estado de la ficha detrás de un botón discreto** («Ficha», arriba a la derecha del panel): la línea «Ficha completa · 4 atenciones (1 mías) desde…» se despliega al pulsarlo. Un punto ámbar o rojo en el botón avisa de ficha parcial, sin sesión o error, y su nombre accesible lleva el texto completo.
- **Recetas sin «Fármacos en uso»**: repetía lo que ya dicen las recetas por atención.
- **Atenciones de urgencia con su registro clínico**: los textos libres que HistorialAtencion devuelve fuera de las secciones conocidas (evolución, examen físico, categorización, observaciones…) se muestran en la tarjeta de la atención y en el informe impreso, con el nombre del campo. Antes se perdían en silencio.
- **«Laboratorio» pasa a «Exámenes complementarios»** en el riel y en la pestaña inicial de Preferencias, como futuro acceso a imagenología, biopsias y laboratorio. Bajo 1200 px el riel muestra «Exámenes».
- **Calendario de Hoy**: el número de atenciones va en una chapa en la esquina superior derecha de cada día; el día mostrado la lleva en verde. Corregido el día de hoy, cuyo número subía porque la celda heredaba la clase `today` del contenedor de la jornada.

## 2.28.1 — 2026-09-04

Correcciones tras revisión adversarial de 2.27.0 y 2.28.0.

- **Portada honesta**: el próximo control sugerido ignora las órdenes descartadas en Eloisa (`proximoControlSugerido`, con prueba); con la ficha caída ya no afirma «Sin diagnósticos registrados» sino «Ficha no disponible · sólo tus atenciones», y se repinta cuando la ficha falla.
- **Orden de problemas** como promete la cabecera: GES, crónicos, recurrentes; un nombre que niega el problema («Sin diabetes», «Descarta hipertensión») no cuenta como crónico, y «crónica» en el nombre sí.
- «Ver todo» conserva el foco en la pestaña destino y lleva nombre accesible; el de Interconsultas abre «De otros» cuando ninguna abierta es tuya.
- Títulos de los gráficos fuera del SVG, a 12 px fijos (dentro escalaban de 5 a 12 px según el ancho).
- Contrato de énfasis: excepciones documentadas (chapas y marcadores de rol, número de tarjeta); GES y «días» de interconsulta a 500; las tarjetas cerradas de Hoy ya no se atenúan con opacidad (el RUN bajaba a 2,5:1), se distinguen por fondo.
- README: el panel tiene cinco pestañas y la primera es Resumen.

## 2.28.0 — 2026-09-04

Un solo nivel de énfasis en las siete pestañas y el panel (iteración 5, última del plan de diseño).

- **Contrato de tres niveles**, documentado al inicio de `styles/app.css`: título (versalita 12 px, 600, gris), dato (400 en tinta; la clave de cada fila a 500) y secundario (12 px gris, sin versalita). Las negritas del marcado dentro de las vistas pesan 500.
- Fuera los 600/700 dentro de datos: fecha y hora de la tabla y de la jornada, fechas del panel, «EMITÍ/RECIBÍ», «n pendientes», chapas de laboratorio y valores fuera de rango (el color ya es la señal).
- Cabeceras de tabla, bloques de la jornada, preferencias y títulos de los gráficos comparten el mismo estilo de título; los valores de los gráficos a 500; Novedades sin monoespaciada; claves de Datos sin versalita.

## 2.27.0 — 2026-09-04

Portada clínica del paciente (iteración 4 del plan de diseño).

- **Pestaña «Resumen», primera y por defecto**: problemas activos con peso (hasta seis), tus últimas atenciones con su diagnóstico, interconsultas abiertas con su antigüedad, próximo control sugerido y las alertas de la ficha. Cada sección lleva «Ver todo» a su pestaña. La última nota queda a la vista porque el diario vive bajo las pestañas.
- «Diagnósticos» pasa a llamarse «Problemas» en el panel (lista de problemas, no columna de la tabla).
- El peso distingue **crónico** (código CIE o nombre) de **recurrente** (tres o más registros): una bronquitis aguda siete veces ya no salía rotulada «crónico».

## 2.26.0 — 2026-09-04

Hoy con calendario mensual (iteración 3 del plan de diseño).

- **Calendario del mes a la izquierda de la jornada**, con el número de atenciones de cada día, hoy con contorno y el día mostrado con fondo. Clic en un día lo abre; ‹ › cambian de mes; «Hoy» vuelve. En estrecho, el calendario va encima de la jornada.
- Módulo puro `src/calendar.js` (semanas de lunes a domingo, recuentos, marcas) con pruebas; el recorrido de Playwright elige un día desde el calendario.

## 2.25.0 — 2026-09-04

Nota clínica como diario.

- **Cada nota lleva fecha y hora y se edita en su sitio.** «Añadir nota» crea una entrada nueva; la más reciente va arriba. Vaciar una entrada la elimina. Las notas antiguas, guardadas como un solo texto, se leen como una entrada sin fecha.
- La tabla, Hoy y las exportaciones siguen mostrando la última nota; el diario completo vive en el panel. El deshacer de la celda Notas conserva su comportamiento.

## 2.24.1 — 2026-09-04

- Corrección: dos variables sin uso en `src/ficha-rank.js` que el lint rechazaba; el PR anterior entró porque la cadena de comandos no respetó el estado de salida de `npm run check`.

## 2.24.0 — 2026-09-04

Panel de paciente, iteración 2: problemas con peso, interconsultas y recetas con el mismo lenguaje.

- **Problemas con peso, no en orden de aparición** (`src/ficha-rank.js`): el mismo problema en dos redacciones es una sola fila con su recuento; GES y crónicos primero (por código CIE-10 o por nombre: diabetes, hipertensión, EPOC, asma…), luego los recurrentes, luego los recientes. Cada fila dice código, «crónico», cuántas veces y la última fecha.
- **Interconsultas «Mías / De otros»** y **Recetas «Activas / Vencidas»**, con el mismo segmento que Medicina/Otros. La vigencia sale de la duración escrita en la receta («cada 12 horas por 6 meses») y la fecha de la atención; sin duración se asumen 30 días; las suspendidas van con las vencidas.
- Si la ficha no se pudo leer, Recetas lo dice en vez de quedarse en «Consultando ficha…».

## 2.23.0 — 2026-09-04

Atenciones con menos columnas y más sentido (iteración 1 del plan de diseño).

- **Razón y Tipo de atención en una sola columna, «Atención»**: «Consulta Médica · Morbilidad»; si la razón ya está dentro del tipo («Control Crónico»), sólo el tipo. Ambos valores siguen enteros en el tooltip, en los filtros y en las exportaciones.
- **El estado de la cita es un punto de color junto a la hora**: verde completada, gris confirmada, rojo no se presentó; el texto va en el tooltip de la fecha y en el nombre accesible del punto.
- Ocho columnas en vez de diez: la tabla cabe en 1280 px sin desplazamiento horizontal (1204 px de 1232 disponibles) y a 1440 las columnas se reparten el ancho.

## 2.22.0 — 2026-09-04

Panel de paciente, a pedido de Daniel.

- **Atenciones en dos pestañas internas: Medicina y Otros.** Medicina son las atenciones de profesional médico (medicina general e interna, cirugía, ginecología, pediatría, anestesia, traumatología…); Otros, las de matrona, kinesiología, nutrición, odontología, talleres. Se decide por el instrumento del prestador que registra Eloisa, sin contar técnicos ni tecnólogos «médicos»; sin prestadores, por el tipo de atención. La elección se recuerda entre pacientes.
- **Las atenciones propias se destacan**: banda y fondo de marca, fecha en color y «Tú» como prestador.
- **Diagnósticos sin etiquetas de certeza** («Confirmada», «sospecha») en el panel y en la tabla; la certeza sigue en el tooltip del diagnóstico.
- **Cabecera mínima**: RUN y edad; sexo y previsión pasan a Datos. **Datos se abre desde las iniciales** del paciente, que llevan el punto de alerta cuando hay alergias o RAM. Un control menos en una cabecera que iba apretada.

## 2.21.0 — 2026-09-04

Etapa 6: lo que los balances dejaron abierto y no necesita la red del hospital.

- **Identidad más estricta en el Salvador**: un lote donde unas órdenes declaran documento y otras no se rechaza entero; antes las sin documento se aceptaban por no poder desmentirse.
- **El token de Eloisa se lee en mundo aislado**: `localStorage` es del origen y se lee igual, pero la página ya no puede interceptar la lectura.
- **Cancelar aborta de verdad**: cada búsqueda lleva su `AbortController`; la petición al Salvador se corta y la cadena de pasos en la pestaña de SysLab se detiene entre paso y paso. Antes «Cancelar» sólo descartaba la respuesta.
- **«Al día · sin ficha»** cuando la ficha clínica está desactivada: «Al día» a secas prometía más de lo comprobado.
- `src/text.js` reúne `cleanText` y `nameOf`, que vivían repetidos en cuatro módulos; la fecha ISO del laboratorio sale de un solo sitio. Bajo 700 px la cabecera del panel de paciente envuelve sus controles en vez de aplastar el nombre.

## 2.20.0 — 2026-09-04

Etapa 5, punto 1: el parser ya no calla donde el laboratorio grita.

- **La marca de anormalidad manda.** Un «*», «(*)», «H», «L», «Alto», «Bajo» o una flecha al final de la línea dejaba la referencia vacía y el valor sin alerta, justo lo que el laboratorio había marcado. Ahora la marca se separa, la referencia se conserva y el hallazgo queda en alerta; la matriz y el informe la muestran.
- **Referencia por sexo con el sexo del paciente.** Con «Mujeres: 12,0 - 16,0 Hombres: 13,5 - 17,5» regía la primera: un hombre con hemoglobina 13,0 salía normal. El sexo llega desde el portal del Salvador o desde la ficha del paciente al abrir el laboratorio; sin él, la referencia se rotula como incierta y **no produce alertas** por sí sola. El grupo elegido se ve en la celda y en el informe.
- «Rango terapéutico: 2,0 - 3,0» ya no secuestra la referencia del INR; «Fecha de toma», «Médico solicitante» y similares dejan de ser hallazgos; «Leucocitos: 2 - 4 por campo» se conserva como texto, no como el número 2; «ESCASAS» y «ABUNDANTES» en plural se reconocen.
- Regresiones para cada caso, en el parser, en la matriz y en la lectura del informe.

## 2.19.0 — 2026-09-04

Etapa 5, puntos 2 a 5 del quinto balance (4,9/7).

- **Tabla de Atenciones**: la columna Estado deja de recortar «Confirmado» en todas las filas; la celda de interconsulta vuelve a ser celda de tabla (como flex, vacía medía media fila y su borde dibujaba una línea fantasma); con chapa GES o «+n» al lado, lo que se recorta es el nombre del diagnóstico, nunca la chapa; sombra interior en el borde derecho mientras queden columnas fuera de la vista; bajo 700 px sólo el nombre queda fijo (Fecha + Nombre ocupaban 445 de 548 px).
- **Tooltips que el lector de pantalla oye**: `role="tooltip"` y `aria-describedby` mientras está visible. Fuera el subrayado punteado en todas las edades y prioridades.
- **Laboratorio**: dos comprobaciones simultáneas de sesión comparten una sola (SysLab recibía cuatro inyecciones por un clic); la pestaña deja de espejar el estado del buscador y lee sus getters; la descarga de informes de SysLab y la inyección de scripts tienen tiempo límite (20 y 25 s); tres pruebas de mutación que antes sobrevivían; la prueba de retención de interconsultas usa fechas que sólo pasan con la preferencia.
- **Voz**: «Prior.» sin contradicción entre cabecera y celda; «Desde la ficha clínica» en vez de la ruta interna; «La primera carga tarda más» en vez de megabytes; «Equipo · tú 86 %»; «79 años»; el indicador «Mías» sólo cuando no son todas; fechas de sincronización en un solo formato; pie «289 atenciones»; el chip de fuentes fallidas no repite el número; espacios en las interconsultas de Pacientes; «13 meses» completo en Preferencias.

## 2.18.0 — 2026-09-04

Laboratorio: el orquestador se parte por sus costuras reales.

- **`src/lab-search.js`**: la búsqueda sin DOM. RUT buscado, token que descarta respuestas tardías o canceladas, filtro de período para SysLab y resultados por origen entregados por callbacks. Nueve pruebas: RUT sin verificador rechazado antes de tocar la red, respuesta tardía de una búsqueda reemplazada descartada, cancelación, respuesta discordante del Salvador, período, sesión vs. red, desfase del campo.
- **`src/lab-session.js`**: el estado de sesión sin DOM. Qué se muestra por cada resultado (conectado, sin sesión con enlace, no responde con causa) y la ventana de cinco segundos que evita comprobar cuatro veces por un clic. Cuatro pruebas.
- La pestaña ([src/tabs/laboratorio.js](src/tabs/laboratorio.js)) baja de 863 a 737 líneas y sólo pinta: pierde el token propio, la comprobación de sesión, el filtro de fechas y un formateador de RUT duplicado (usa `formatRun`). Sin cambio de comportamiento: los mismos textos, el mismo recorrido de Playwright.

## 2.17.1 — 2026-09-03

Decisión clínica: **sólo tus diagnósticos**.

- Una cita atendida sin registro tuyo **ya no hereda la atención de otro profesional**. Antes tomaba la primera del día (la matrona, el kinesiólogo) y ese diagnóstico ajeno seguía a Pacientes, a Hoy, a las estadísticas y a las exportaciones como si fuera tuyo. La fila queda «Atendido» sin diagnóstico, y el guion del diagnóstico dice al pasar el cursor quién registró atención ese día, sin traer nada de ella.
- Se conserva lo de siempre: si tú figuras como prestador de una atención del día, esa es la que se cruza.

## 2.17.0 — 2026-09-03

UX, estética y accesibilidad: lo que el cuarto balance dejó abierto en su lente.

- **Desaparece la «i» de 9 px** que en cada fila sólo decía el día de la semana: ese dato va en el tooltip de la fecha, y la hora ya está a la vista. Los iconos de una letra (U, E, adjuntos) llevan nombre accesible.
- **Estadísticas**: indicadores en rejilla, todos del mismo ancho, también el que queda solo en su fila; a menos de 760 px los gráficos van a una columna en vez de encogerse a texto de 7 px; «Visitas por paciente» en su orden natural (1, 2, 3–4, 5+).
- **Interconsultas**: la estrella «tuya» desaparece cuando el filtro ya muestra sólo las tuyas; el tooltip de «Prior.» explica P1/P2/P3 sin hablar de la API; el pie dice «28 interconsultas» o «5 de 28 interconsultas», como en Atenciones y Pacientes.
- **La barra de estado se recorta con «…»** en anchos medios en vez de cortarse a cuchillo («90 días no se pud»).
- **Laboratorio**: la comprobación de sesión del Hospital Salvador tiene tiempo límite y distingue «no responde» de «sin sesión»; el aviso del RUT incompleto cabe en dos frases.
- «Guardar nota» deja de ser un botón a todo el ancho que competía con «Actualizar».

## 2.16.0 — 2026-09-03

Etapa 4: lo que el cuarto balance (4,8/7) encontró abierto, verificado ejecutando.

- **El PDF único lleva el RUT que se buscó**, no lo que haya escrito en el campo: editarlo sin volver a buscar guardaba los informes de una persona con el RUT de otra. Con la tabla desfasada, «Todos los PDF» queda deshabilitado.
- **Exportar interconsultas pide confirmación** con recuento de pacientes y aviso de contenido, como Atenciones. **El almacén de interconsultas se poda con la retención elegida** (llevaba teléfono y dirección sin límite).
- **Parser**: con varios rótulos de grupo («Niños: … Adultos: …») la unidad queda limpia y rige la referencia de adultos; los resultados en texto libre de orina y cultivos se conservan («Cultivo: Se observa desarrollo de Escherichia coli…», «Aspecto: Ligeramente turbio», «Color: AMARILLO» seguido de un numérico), sin convertir en resultado un dato administrativo; un «4.500» sin unidad en un recuento se marca ambiguo y no entra a la tendencia.
- **Pestañas con afordancia de desborde** (degradado en el borde y la activa siempre a la vista) y **tabla de Atenciones que cabe a 1440 px** con Notas visible.
- **Panel honesto**: «Ficha parcial · 7 fuentes fallaron · 22:39» en vez de «Ficha completa · 0 atenciones»; el tooltip de fallos habla en frases, no en rutas; el RUN va primero y ya no se recorta.
- **Foco visible** en filas y campos que apagaban el outline; `--ink-4` deja de usarse como texto en cuatro sitios más; horas siempre en 24 h; «Desde caché» pasa a «Guardadas antes».
- Limpieza tras el merge: once reglas CSS sin emisor y el guion muerto de contrarreferencias en las pruebas.

## 2.15.1 — 2026-09-03

Integración con `main`. La rama de trabajo nació antes de dos pull requests que se mergearon hoy en `main` (#6, smoke de navegador en CI; #7, sincronización compacta y **retirada del metadato «contrarreferencia»** de filtros, tablas, pendientes, estadísticas, informes y exportaciones, con su petición adicional). Al integrar prevalece esa decisión de producto, que es la más reciente: desaparecen aquí también el cruce de contrarreferencias, el gráfico «% sin contrarreferencia», la regla de pendientes «sin contrarreferencia» y su umbral. Todo lo demás de esta rama se conserva; el riel de estado y el panel de sincronización quedan en la versión de esta rama, que ya integraba lo que #7 buscaba. La 2.6.0 que `main` declaraba para #7 queda absorbida por esta entrada.

## 2.15.0 — 2026-09-03

Etapa 3, segunda tanda: datos del paciente, gráficos y cromo medio.

- **Exportar pide confirmación y dice lo que sale**: «¿Exportar 289 atenciones de 120 pacientes a Excel? El archivo incluye nombre, RUN y diagnósticos. Guárdalo sólo en un equipo del hospital.» Antes el archivo se generaba sin más.
- **Retención de datos locales configurable** en Preferencias: 3, 6 o 13 meses. La poda de agenda, ficha e interconsultas respeta la elección en la siguiente carga. Antes eran 13 meses fijos.
- **Estadísticas sin colisiones**: el valor y el porcentaje de la barra más alta ya no pisan el título; los títulos largos se ajustan al ancho en vez de recortarse; un indicador que queda solo en su fila ya no se estira a todo el ancho.
- **El riel no crece en anchos medios**: entre 760 y 1100 px el estado se acorta con «…» (texto completo en su título) y la sincronización se reduce a un punto de color más «Detalle»; la cabecera y el riel siguen en dos líneas en vez de tres.
- Hoy aprovecha hasta 1200 px de ancho; la columna Razón ya no recorta «Resultado de exámenes».

## 2.14.0 — 2026-09-03

Etapa 3, primera tanda: lo que el tercer balance (4,6/7) encontró abierto y verifiqué ejecutando.

- **Parser de laboratorio: nuevo algoritmo de troceo.** Cada «: valor» es el ancla de un analito y, entre dos anclas, la frontera entre la cola del anterior (unidad y rango) y la cabeza del siguiente se busca palabra a palabra. Antes, un nombre de tres palabras tras otro analito («Volumen Corpuscular Medio: 110 fL 80 - 100 Hb Corpuscular Media: 30») dejaba el VCM sin rango y **sin alerta**, y «Recuento de Plaquetas» se llevaba el rango del hematocrito. «Hasta 5», «Menor a 200» y «Mayor de 3» son ahora referencias; los rótulos de grupo («Adultos:») ya no contaminan la unidad, que partía una misma variable en dos filas sin tendencia. Corpus de catorce líneas reales como regresión, más una propiedad: ninguna unidad contiene dos puntos.
- **La hora de la cita se ve junto a la fecha**; antes vivía sólo en el tooltip de una «i» de 9 px. Nombre y RUN completos a 1440 px (columna de 280 px); Razón sin recortes.
- **Toda celda recortada con «…» entrega su texto completo** como título al pasar el cursor o enfocar. El nombre del paciente en el panel puede ocupar dos líneas en vez de recortarse.
- **La búsqueda de laboratorio tiene salida.** Veinte segundos de límite contra el portal del Hospital Salvador (SysLab ya los tenía por paso) y el botón «Buscar» pasa a «Cancelar» mientras busca; lo que llegue después de cancelar se descarta.
- **Seguridad y contraste.** El estado de programa que llega de Eloisa se escapa antes de pintarlo en el panel; `--ink-4` deja de usarse como texto (guion de nota vacía y porcentajes de gráficos, 2,6:1). La sincronización se protege una vez, adentro, en vez de con ocho `catch` vacíos repartidos.

## 2.13.0 — 2026-09-03

Etapa 2, fase D: una sola gramática de controles, y Laboratorio sobre ella.

- **Dos alturas de control en toda la aplicación**: 32 px para acciones e inputs (`--h-ctl`) y 26 px para lo compacto dentro de una fila —chips, botones pequeños, pestañas del análisis— (`--h-ctl-sm`). Antes convivían botones de 25, 27 y 34 px e inputs de 19, 21, 29 y 31 px; en una sola fila de búsqueda de Laboratorio había cinco alturas.
- **Laboratorio deja de parecer otra aplicación.** Mismos inputs y selects que el resto, etiquetas en línea («Período [6 meses]») en vez de apiladas, tabla alineada al margen (sangraba 24 px extra), cabeceras de tabla como las demás, y un solo indicador de sesión por origen con la acción de volver a comprobar integrada.
- **Los datos que el laboratorio entrega en mayúsculas se leen en caja de oración**: «PACIENTE EJEMPLO, ROSA» → «Paciente Ejemplo, Rosa», «QUÍMICA» → «Química», conservando siglas de exámenes (VHS, TSH). Sólo cambia lo que llega íntegramente en mayúsculas; lo mixto se respeta.
- `hidden` manda sobre cualquier `display` de clase: con los controles en `inline-flex`, un botón oculto reaparecía.

## 2.12.0 — 2026-09-03

Vacíos y mensajes: la interfaz deja de hablarle al programador.

- **Los errores se traducen a frases** (`src/errors.js`). «HSR: error — Failed to fetch» pasa a «No se pudo conectar con el portal del Hospital Salvador. Revisa la conexión o la red del hospital.»; «Error: HTTP 500 /Citas/…» a «Eloisa tuvo un error interno (código 500). Inténtalo más tarde.»; un 401/403 invita a iniciar sesión en el sitio correcto. Nunca se muestra una ruta interna ni un error del motor de JavaScript. Aplicado en carga, interconsultas, laboratorio, panel de paciente y borrado de datos.
- **Atenciones ya no es una página en blanco** antes de cargar: la tabla se muestra desde el inicio con un estado vacío que dice qué hacer y qué se va a traer. Sin coincidencias, dice que es por los filtros. Mismo componente de vacío que Hoy.
- **El pie de tabla dice lo que cuenta.** «120 de 289 de 289 registros» pasa a «120 en pantalla · 289 registros», «150 de 289 registros» o «289 registros».
- **Interconsultas informa en palabras.** «28 SIC · caché · 8:37:29 p. m.» pasa a «28 interconsultas · actualizadas a las 20:37», «guardadas a las…» o «se muestra la copia anterior (…); la actualización no se completó».
- **La barra de estado ya no esconde los fallos en un color.** «289 atenciones · 3 días no se pudieron cargar» en vez de un ámbar mudo; y si el refresco automático falla, lo dice con la hora y la causa en vez de callar.
- **Guardar una preferencia que falla avisa** (orden, columnas, densidad, período) en vez de fingir que quedó.
- Textos: «Pulsa «Cargar datos»» con comillas españolas; «órdenes» con tilde; el aviso de primera lectura de novedades explica qué se vigila y cuándo aparecerá algo.

## 2.11.0 — 2026-09-03

Etapa 2, fase E: el panel de paciente es un diálogo de verdad.

- **Cerrado, no existe para el teclado ni el lector de pantalla.** Seguía visible desplazado 560 px fuera de la pantalla, con catorce controles alcanzables con Tab: en un recorrido de cuarenta pulsaciones, nueve caían en botones de un panel invisible. Ahora queda inerte e invisible al terminar la animación de salida (y al instante con movimiento reducido).
- **Abierto, el fondo queda inerte.** Cabecera y contenido no reciben foco ni clics mientras el diálogo está delante; Tab y Shift+Tab dan la vuelta dentro del panel. El foco entra al diálogo (el lector anuncia «diálogo, nombre del paciente») y al cerrar vuelve a la fila o celda desde donde se abrió, tanto con Escape como con el velo o la ✕.
- **«Lab» cierra el panel antes de saltar a Laboratorio.** Con el fondo inerte, la pestaña quedaba inutilizable detrás del diálogo.
- El bloqueo por inactividad deja inertes también el panel y su velo, que viven fuera de `<main>`.
- Recorrido de Playwright en ambos anchos: foco dentro, fondo inerte, veinticinco Tab sin salir, Escape devuelve el foco a la fila, y cerrado ningún control es alcanzable.

## 2.10.1 — 2026-09-03

Etapa 2½: los cuatro defectos que el segundo balance (tres revisores independientes, 4,3/7) encontró en código de esta misma serie. Dos eran regresiones mías y pasaron 353 pruebas porque las pruebas usaban datos con la forma cómoda, no con la real.

- **Corregido: los analitos de varias palabras se truncaban.** El troceo de «dos analitos en una línea» cortaba en cualquier «palabra: número»: «Bilirrubina Total» quedaba como «Total», «Colesterol Total» también, y los dos colapsaban en una sola fila donde un valor pisaba al otro; «Proteína C Reactiva» quedaba como «Reactiva». Ahora el plegado distingue cola del analito anterior (unidad, rango) de cabeza del siguiente. Regresión con los seis nombres reales y con la fila fusionada de bilirrubinas.
- **Corregido: una cita «No se presentó» heredaba la atención de otro prestador.** El criterio de «atendida» aceptaba la palabra «presentó» dentro de la negación; el diagnóstico de la matrona seguía a Pacientes, Hoy y estadísticas. Un estado negado ya no cuenta; la atención del propio oficial sí se cruza. Regresión a nivel de `mergeHistorial`.
- **Corregido: un RUT sin dígito verificador podía buscar a otra persona.** Con 7 u 8 dígitos y sin guion, la última cifra se tomaba como verificador si cuadraba el módulo 11 (una de cada once veces), y SysLab devolvía los exámenes de ese otro RUT. Laboratorio ahora pide el RUT con guion y verificador y explica por qué; con 9 dígitos o K no hay ambigüedad.
- **Corregido: cerrar el panel «⋯» con Preferencias abiertas dejaba Preferencias marcado abierto.** Los menús tienen ahora un registro único: abrir uno cierra los que no lo contienen, cerrar uno cierra los anidados, y Escape cierra el más interno devolviendo el foco a su botón. Recorrido de Playwright en ambos anchos.
- ARCHITECTURE.md decía que sólo se hablaba con Eloisa y sin dependencias de ejecución: ahora nombra los tres transportes con su guardia de origen y las dos librerías de `vendor/`.

## 2.10.0 — 2026-09-03

Etapa 2: cierre de la fase A y fase C completa.

- **Cabecera de una línea bajo 1100 px.** Título, «Actualizar» y un botón «⋯» que despliega Período, Ficha clínica, Exportar y Preferencias en un panel bajo la cabecera (mismo mecanismo que los demás menús: `aria-expanded`, cierre al hacer clic fuera). Desplegados piden ~1080 px y antes se apilaban en dos o tres líneas. En escritorio todo sigue a la vista; la acción primaria pasa al extremo derecho en todos los anchos.
- **Un solo acento.** Desaparecen los tonos `--info` (azul) y `--violet`: eran decoración con seis significados distintos (rol «Recibí», fila desde ficha, «+n» de diagnósticos, cita espontánea, avisos, gráficos). El verde de marca queda para la acción primaria, la pestaña activa, los enlaces y el foco; el resto pasa a neutro: roles Emití/Recibí tipográficos, «mío» en negrita, avatar del panel, marca de fila desde ficha, barras de gráficos (el valor se lee en el número).
- **Estados con menos color.** «Completado» lleva el punto verde y el texto neutro; sólo atención y alerta colorean la palabra. GES pasa de bloque relleno a contorno. El riesgo de multimorbilidad se muestra en tono de atención (antes violeta).
- Contraste comprobado en el harness: cada par recoloreado queda entre 5,1:1 y 17,7:1.

## 2.9.0 — 2026-09-03

Etapa 2, fases A y B del balance: devolver pantalla. Cuatro bandas de cromo (cabecera, estado, sincronización, pestañas) pasan a dos, y las filas de la tabla pasan a una línea. Medido en el harness a 1280×800: el cromo superior baja de 174 a 97 px y las filas de 55–132 a 39–40 px; se ven 15 atenciones donde antes cabían 5.

- **Riel único.** El estado de los datos («289 atenciones», errores de sesión) y la sincronización viven ahora a la derecha de las pestañas, dentro del mismo `#topbar`; el detalle de sincronización se despliega sobre el contenido en vez de empujarlo. Los identificadores, el `aria-live` y el texto de estado no cambian, así que ningún módulo ni recorrido tuvo que tocarse. Bajo 760 px el estado baja a una segunda línea del riel.
- **Una línea por fila.** Nombre y RUN en la misma línea (el nombre se recorta, el RUN nunca); una sola interconsulta por fila y las demás en «+n» con su detalle al pasar el cursor; la nota se recorta y se lee completa al editarla; diagnóstico y tipo de atención dejan de envolver. La columna de fecha crece de 118 a 128 px: antes «03-09-2026» se recortaba con el punto de información.
- **Una parada de tabulación por fila.** Cada fila tenía tres (nombre, información, RUN) más una por interconsulta: unas 400 pulsaciones para recorrer una tabla. Ahora Tab entra en la tabla una vez, ↑/↓ recorren las filas y Enter abre al paciente; las acciones internas siguen con el ratón. Fila enfocada visible.
- **La cabecera envuelve** en vez de desbordar entre 900 y 1100 px; el texto de estado recortado conserva el completo en su `title`.

## 2.8.4 — 2026-09-03

Etapa 1 del balance: pruebas donde viven los fallos. Las 334 pruebas anteriores cubrían funciones puras; ninguna tocaba la carga de interconsultas, la ficha del paciente, el bloqueo ni la pestaña Laboratorio. Escribirlas destapó dos defectos más, que se corrigen aquí.

- **`loadSICs` con `fetch` simulado** (6 pruebas): carga completa, cruce de contrarreferencias, grupo que falla conservando la instantánea anterior, carga parcial que no se persiste, cancelación declarada y caché dentro del TTL.
- **Corregido: el cruce de contrarreferencias dependía del tipo del id.** El mapa se indexaba por `IdSolicitud` tal como llegaba y se buscaba con `Number(...)`; si el endpoint devolvía el id como texto —como ya hace su hermano `NumeroSolicitud` en los datos reales— todas las contrarreferencias desaparecían en silencio y cada SIC atendida pasaba a «sin contrarreferencia». La prueba falló antes de la corrección y pasa después.
- **`loadFicha` con `fetch` simulado** (5 pruebas): una RAM registrada llega al modelo, un fallo del endpoint queda registrado con el nombre de la fuente en vez de disfrazarse de «sin alergias», un fallo en una fuente no impide las demás, y sin identificador no se consulta nada.
- **Recorrido de navegador del bloqueo por inactividad**, armado por la vía real (Preferencias): contenido y cabecera inertes, ⌘K y «/» bloqueados, foco confinado, restauración al desbloquear.
- **Corregido: ⌘K atravesaba el bloqueo con el foco en el botón de desbloqueo.** La guardia dejaba pasar las teclas cuyo objetivo estaba dentro del velo; ahora sólo pasan Enter, Espacio y Tab sin modificadores. Lo encontró el recorrido de Playwright, no la verificación manual.
- **Recorrido de navegador de Laboratorio**, con los dos laboratorios interceptados en el propio navegador y un paciente sintético: sesión, búsqueda, cuatro órdenes con su detalle de prestaciones, selección y contador «Analizar 2», aviso de tabla desfasada al editar el RUT, y solicitud con sus 67 casillas sin la palabra «enviar». Ninguna petición sale a la red.

## 2.8.3 — 2026-09-03

Etapa 0 del balance: las once correcciones que hacían que la aplicación mostrara un dato falso, callara uno verdadero o expusiera datos de pacientes. Todas verificadas sin la red del hospital; las de interfaz, además, en el navegador con los módulos recargados.

- **Alergias y RAM ya no desaparecen en silencio.** Las tres llamadas de la ficha que devolvían una lista vacía ante cualquier fallo ahora registran el error como sus hermanas, y el panel lo cuenta. Un paciente con reacción adversa registrada ya no se ve igual que uno sin ella cuando el endpoint falla.
- **El bloqueo por inactividad bloquea de verdad.** La pantalla de bloqueo pasa por encima de todo (z 3000), deja inertes cabecera y contenido, y corta en fase de captura los atajos globales: ⌘K y «/» ya no abren la paleta con doce pacientes sobre el velo.
- **Una cita no atendida no hereda el diagnóstico de otro prestador.** El cruce sólo cae en una atención ajena del día si la cita consta como atendida; antes una cita en «Citado» tomaba el diagnóstico de la matrona y lo arrastraba a Pacientes, Hoy y estadísticas.
- **Las reglas de pendientes vuelven a contar días.** `AntiguedadDias` ausente pasa a `null` en vez de 0, de modo que «sin contrarreferencia» y «SIC sin cursar» calculan la antigüedad por la fecha. Una SIC de ocho meses sin contrarreferencia vuelve a aparecer.
- **El refresco automático respeta la carga en curso.** Comparte el cerrojo de la carga manual: ya no entra encima de una carga, ni descancela una recién cancelada, ni dos cargas se pisan el store. Y no repinta la tabla mientras hay una nota a medio escribir, que antes se perdía sin aviso cada 15 minutos.
- **«Vaciar caché» borra también el informe pendiente de impresión**, que es una historia clínica completa y sólo desaparecía si la pestaña de impresión llegaba a abrirse.
- **Los gráficos se van con los datos.** Tras borrar, la sección de estadísticas vuelve al estado vacío en vez de conservar los diagnósticos más frecuentes en pantalla.
- **Clic en un diagnóstico del gráfico ya encuentra sus filas**: la búsqueda incluye la clasificación con que se rotula la barra. Y una barra cuyo valor no exista como filtro lo dice —«No hay un filtro de tabla para…»— en vez de mostrar la tabla completa con un aviso de «Filtrado por…».
- **Contrarreferencias por especialidad** muestra recuentos («Reumatología (4/6)») en vez de un porcentaje de porcentajes.
- **Tres variables CSS que no existían** (`--radius`, `--surface`, `--shade`) dejaban las tarjetas de sincronización cuadradas y sin fondo. Corregidas.
- **Texto oscuro sobre el acento en modo oscuro**: el botón primario pasa de 2,37:1 a 7,67:1.

## 2.8.2 — 2026-09-03

Blindaje de la identidad del paciente en la pestaña Laboratorio. Todo verificable sin la red del hospital.

- **Verificación de identidad en Hospital Salvador.** Hanga Roa ya comprobaba que las órdenes devueltas fueran del RUN consultado; Salvador no. Ahora se decodifica el documento que declara cada orden —el portal lo emite relleno con ceros, `0119570018` para el RUT 11.957.001-8— y si una sola no coincide se rechaza el lote entero.
- **Una respuesta atrasada ya no se pinta sobre otro paciente.** Cada búsqueda toma un número; la que llega cuando ya empezó otra se descarta. Abrir el laboratorio de un paciente y pasar al siguiente antes de que respondiera dejaba las órdenes del primero bajo el RUT del segundo.
- **La tabla declara de quién es.** El contador dice «HSR: 4 órdenes de 11.957.001-8», así que nunca hay que deducir a qué paciente corresponde lo que se ve.
- **Editar el RUT sin buscar avisa.** Antes las tablas del paciente anterior quedaban en pantalla sin ninguna señal; ahora se atenúan y se explica qué se está viendo.
- El análisis y la solicitud impresa se anclan al RUT de la búsqueda que produjo las filas, no al campo del buscador: editarlo sin volver a buscar imprimía un par nombre/RUN cruzado en un papel que viaja al laboratorio.

## 2.8.1 — 2026-09-03

Correcciones surgidas de una revisión adversarial del módulo de laboratorio. Las cuatro primeras hacían que la aplicación mostrara un dato clínico equivocado como si fuera correcto, que es peor que un fallo visible.

- **Dos analitos en una misma línea ya no se mezclan.** Un informe a dos columnas podía reconstruirse como `Sodio: 140 mEq/L 135 - 145 Potasio: 6,8 mEq/L 3,5 - 5,1`: el sodio se quedaba con el rango del potasio —quedando marcado como alterado sin estarlo— y el potasio de 6,8 desaparecía por completo, sin error ni contador. Ahora la línea se separa y cada analito conserva su unidad y su rango. Un encabezado de rango («Adultos:», «Hombres:») no abre un analito nuevo.
- **Una bilirrubina elevada ya no se pinta como normal.** La fila fusionada «T/D/I» fijaba la alerta en falso, borraba la referencia e inventaba la unidad; una bilirrubina de 15,4 se veía como un valor cualquiera mientras la cabecera la seguía contando entre las alteradas. Ahora hereda alerta, unidad y referencias de sus componentes.
- **Una bilirrubina urinaria ya no fabrica una fila de perfil hepático** con valores vacíos, ni pierde el dato urinario: conserva su propia fila y su muestra.
- **Un sedimento urinario ya no se abrevia como recuento sanguíneo.** Un «25 x campo» en un informe que no rotula la muestra se pegaba en la evolución como «RGB 25», es decir, una leucocitosis inexistente. El guardia que lo detecta buscaba «x campo» sólo en el resultado y no en la unidad, y además no estaba conectado al resumen.
- Las tendencias se agrupan por familia clínica —electrolitos, función renal, perfil hepático— con ventana temporal anclada en el examen más reciente, búsqueda y filtro de «sólo alteradas». Ese módulo existía y estaba probado, pero no lo usaba nadie.
- Se elimina `validateDetailBatch`, que documentaba una política de «todo o nada» que la aplicación no aplica: ante un informe ilegible se muestran los demás y se declara cuál faltó, que para el clínico es más útil que no mostrar nada. Mantener código que promete otra cosa desorienta a quien lo lea.
- Los avisos del análisis se anuncian a lectores de pantalla.

## 2.8.0 — 2026-09-03

- Corrige la búsqueda en el Hospital Salvador, que devolvía cero órdenes para pacientes que sí tenían exámenes: el portal espera `rangofecharut=false` cuando la consulta por RUT debe respetar el rango de fechas. Verificado contra tráfico real y fijado con una prueba de regresión.
- La ventana por omisión pasa de uno a dos años; con un año se perdían exámenes reales de mediados del año anterior.
- Selector de período (6 meses a 5 años, o todo) que rellena las fechas; editarlas a mano sigue mandando. SysLab no filtra por fecha en el servidor, así que su rango se aplica localmente y se indica cuántas órdenes quedaron fuera.
- Las órdenes del Hospital Salvador despliegan su detalle de prestaciones con estado, fecha de validación y derivación.
- Análisis de laboratorio: se seleccionan órdenes de ambos hospitales y se obtiene una matriz comparativa por fecha, tendencias y el detalle de cada informe.
- Interpretación clínica portada desde el módulo de HHR, validada contra informes reales de SysLab: números en formato chileno, rangos de referencia, comparadores y detección de fuera de rango.
- Las muestras biológicas no se mezclan: un sodio en orina ocupa su propia fila y queda fuera de las tendencias sistémicas; las razones RAC y RPC sí entran por ser de lectura sistémica.
- Verificación de identidad por informe: uno que declare otro RUN se rechaza, y uno sin RUT legible se incluye marcado como no verificado en vez de darse por confirmado.
- Un informe que falle no cancela el análisis; se informa cuántos quedaron fuera y por qué.
- Vista de microbiología: cultivos, antibiogramas y paneles virales salen de la tabla numérica y se presentan como tarjetas, destacando sólo lo que merece atención. Un cultivo negativo o una cepa sensible no se marcan como alerta; un desarrollo o una resistencia sí.
- Las tres bilirrubinas se leen juntas: se muestran en una sola fila «T/D/I», en su lugar del perfil hepático.
- Cuando un informe trae la razón proteinuria/creatininuria, sus componentes crudos se omiten: el valor con significado clínico es el cociente.
- Botón «Resumen»: copia el resumen de una línea por informe, con siglas y las alteraciones marcadas, para pegar en la evolución.
- Solicitud de exámenes: el formulario del laboratorio con sus 10 categorías, 65 exámenes y sus tubos, para marcar e imprimir. Se imprime y se entrega en mano, igual que el de papel: no existe envío electrónico y nada en la interfaz sugiere que la solicitud quede registrada en un sistema.
- Matriz copiable como texto para pegar en una planilla.
- Las tendencias dibujan la banda de valores normales, y sólo cuando todos los informes declaran el mismo rango: con rangos distintos, una banda única daría por normal un valor que no lo era en su momento.
- El dígito verificador del RUT se quita sólo si de verdad lo es. Antes se cortaba el último carácter a ciegas, de modo que un RUT escrito sin verificador quedaba mutilado y la búsqueda no encontraba nada.
- Sólo se ofrece marcar para análisis lo que tiene informe descargable, para que el contador no prometa más informes de los que puede incluir.
- La lectura del PDF aplica la matriz de la página: un informe declarado con rotación de 90° pegaba en una misma línea celdas de columnas distintas y quedaba ilegible.
- Se corrigen los artefactos de codificación de estos informes («ó» llega como «¢»): sin eso, analitos como «Nitrógeno Ureico» no coincidían con su alias y desaparecían del análisis sin ningún error visible.
- «PCR» a secas se interpreta según la sección: proteína C reactiva en bioquímica, reacción en cadena de la polimerasa en microbiología. El módulo original lo traducía siempre a proteína C reactiva, rotulando paneles virales como marcador inflamatorio.
- Se añaden los sinónimos de analito que faltaban: VCM, HCM, Segmentados, «Rcto. Leucocitos», «Creatinina sérica» y el desglose de bilirrubinas.

## 2.7.0 — 2026-09-03

- Integra el laboratorio de Hospital Hanga Roa (SysLab) como segunda fuente en la pestaña Laboratorio; la búsqueda consulta HSR y HHR en paralelo.
- Agrega botón «Lab» en el panel lateral del paciente para buscar exámenes directamente desde la vista de paciente.
- «Todos los PDF» descarga un único PDF con todos los informes de ambas fuentes, en vez de abrir una pestaña por informe (pdf-lib local, cargado bajo demanda).
- Si algún informe no se puede incluir, el PDF se genera igual pero declara cuántos quedaron fuera: un documento clínico incompleto nunca se presenta como completo.
- Indicadores de sesión independientes para ProactiveLIS (HSR) y SysLab (HHR).
- SysLab se consulta conduciendo la pestaña que el usuario ya tiene abierta con sesión: su búsqueda por RUT es navegación con estado, no una URL consultable, y sus cookies HTTP no viajan en un `fetch` desde la extensión.
- Un lote de exámenes se descarta completo si alguna fila no corresponde al RUN consultado, antes que mostrar resultados de otro paciente.

## 2.6.0 — 2026-09-03

- Añade la pestaña Laboratorio para consultar órdenes de exámenes desde ProactiveLIS (Hospital El Salvador) usando la sesión autenticada del navegador.
- Transporte cookie-based independiente (`lab-http.js`) con detección de sesión expirada por redirección o contenido HTML.
- Búsqueda por RUT con rango de fechas, tabla de órdenes con progreso de prestaciones expandible y descarga de informe PDF.
- Documenta ~30 endpoints del sistema de laboratorio en `ACCESS_MAP.md` para automatización futura.

## 2.5.0 — 2026-09-03

- Separa las 569 líneas del sistema visual de `app.html` hacia `styles/app.css`, sin cambiar su resultado renderizado.
- Añade acceso «Saltar al contenido» para navegación por teclado.
- Protege automáticamente la hoja visual empaquetada, las referencias ARIA y los contratos de foco, modo oscuro, movimiento reducido y pantallas estrechas.
- Añade un smoke reproducible en Chromium para carga, filtros, teclado y diseño estrecho usando exclusivamente datos sintéticos y red local.
- Separa en CI la calidad estática del recorrido de navegador y evita duplicar ambos trabajos en cada push de una rama con PR.

## 2.4.0 — 2026-09-03

- Añade un mapa arquitectónico canónico, una ruta de lectura para futuras contribuciones y una verificación automática contra la estructura real de `src/`.
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
