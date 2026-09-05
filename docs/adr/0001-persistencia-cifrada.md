# ADR 0001 · Persistencia cifrada de los datos clínicos

Estado: **propuesto** (04-09-2026). Decide Daniel.

## Contexto

La extensión guarda en `chrome.storage.local`, en claro, hasta trece meses de agenda, ficha clínica e interconsultas (unos 300 KB por cada doce pacientes sintéticos; en real, varios MB), más las notas propias por paciente. El README lo advierte y recomienda un equipo propio con disco cifrado. Dos revisiones independientes lo señalaron como el riesgo principal en un PC compartido de hospital: el perfil de Chrome es legible por quien lo abra, y la pantalla de bloqueo por inactividad es visual (se salta desde la consola y «Continuar» no pide nada).

Todo lo que se persiste pasa por dos funciones de `src/io/cache.js` (`storageGet`, `storageSet`) que usan nueve módulos. Es un único punto de cambio.

## Opciones

### A · Mantener en claro y avisar en la aplicación
Un aviso en el primer uso y en Preferencias. Sin cambio técnico.
- (+) Cero riesgo de pérdida de datos por olvido de PIN.
- (−) No protege nada. Sólo mueve la responsabilidad a quien instala.

### B · Cifrar con clave derivada de un PIN (recomendada)
`storageGet`/`storageSet` cifran y descifran con WebCrypto: AES-GCM 256 con clave derivada por PBKDF2 (300 000 iteraciones, sal aleatoria por instalación) de un PIN de 6 dígitos que se pide al abrir la aplicación y al salir del bloqueo por inactividad. La clave derivada vive sólo en memoria de la pestaña (nunca en disco ni en `storage.session`).
- (+) Un perfil de Chrome copiado o abierto por otra persona no muestra pacientes: sólo bytes.
- (+) El bloqueo por inactividad pasa a ser real: sin PIN no hay datos, no importa lo que se haga en la consola.
- (+) Un solo punto de cambio; el resto del código no se entera.
- (−) Olvidar el PIN equivale a perder la caché **y las notas propias** (lo único que no se puede volver a bajar de Eloisa). Mitigación: «Exportar mis notas» antes de cambiar el PIN, y aviso explícito al crearlo.
- (−) Un PIN de 6 dígitos frente a un atacante con el disco y tiempo: PBKDF2 con 300 000 iteraciones da del orden de segundos por intento en un equipo normal; un millón de combinaciones son horas o días, no segundos. Protege frente al colega curioso y al equipo perdido, no frente a un adversario dedicado. Se dice tal cual.
- (−) Un PIN más al día. Se pide una vez por sesión de navegador y tras el bloqueo.

### C · Cifrar con clave guardada en `chrome.storage.session`, sin PIN
Transparente para la persona; la clave muere al cerrar Chrome.
- (+) Sin PIN.
- (−) Con Chrome abierto, cualquiera en el equipo tiene los datos; y `storage.session` de una extensión no es un secreto frente a quien tiene el perfil. Protege sólo el disco apagado, que ya cubre el cifrado del sistema operativo. No vale lo que cuesta.

## Decisión propuesta

**B**, con estas reglas:

1. PIN de 6 dígitos, creado en el primer uso tras actualizar, con aviso de que olvidarlo borra caché y notas. Cambio de PIN en Preferencias (descifra y vuelve a cifrar todo).
2. Migración: al primer arranque con PIN se lee lo que hay en claro, se cifra y se borra el original. Si no se crea PIN, la aplicación no carga datos (no hay modo «en claro» silencioso).
3. Bloqueo por inactividad: pide el PIN; sin él, la clave se descarta de memoria. «Continuar» desaparece.
4. `report.html` (impresión) deja de guardar el fragmento en `storage.local` en claro: viaja por `storage.session` cifrado con la misma clave, y se borra al abrir, como ahora.
5. Retención por defecto de tres meses (hoy trece), ajustable como ahora.
6. Pruebas: cifrado y descifrado en `node --test` (WebCrypto está en Node), migración desde datos en claro, PIN incorrecto, bloqueo que descarta la clave, y un recorrido de Playwright con PIN.

## Consecuencias

- Rendimiento: descifrar 1 MB con AES-GCM tarda decenas de milisegundos; la derivación de clave, uno o dos segundos una vez por sesión. Aceptable.
- Lo que no cambia: con la pantalla abierta y desbloqueada, quien esté delante ve lo mismo que hoy. El cifrado protege el disco y el perfil, no la atención.
- Lo que se pierde: la posibilidad de mirar `chrome.storage.local` en DevTools para depurar. El Explorador API y el arnés siguen funcionando (el arnés no cifra: datos sintéticos).

## Qué necesito de Daniel

Una de tres: **B** tal como está, **B con cambios** (por ejemplo PIN de 4 dígitos, o retención distinta), o **A** por ahora. Con la respuesta parto la implementación en un solo PR con sus pruebas.
