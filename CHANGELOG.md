# Historial de cambios

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
