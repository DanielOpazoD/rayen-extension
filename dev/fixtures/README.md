# Capturas anonimizadas para el arnés

Aquí van las copias anonimizadas que descarga el Explorador API («Descargar copia anonimizada»), importadas con:

```bash
node scripts/import-capture.mjs ~/Descargas/captura-anonimizada-historial.json historial
```

Endpoints: `master` (UsuarioApsRut), `historial` (HistorialAtencion), `antecedentes`, `programas`, `vigencias`, `riesgo`, `ram`. El script vuelve a pasar el anonimizador y rechaza cualquier RUT, correo o teléfono que quede. Los archivos `.json` de esta carpeta no se versionan: son datos locales para que el arnés muestre la forma real de las respuestas al abrir `/dev/?ficha=capturas`. Sin capturas, el arnés usa la ficha sintética de `dev/ficha-fixture.js`.
