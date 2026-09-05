# Mapa de documentación

Ruta corta para continuar el proyecto sin depender del contexto de una conversación anterior.

## Orden de lectura

1. [`README.md`](README.md): propósito, funciones visibles, privacidad e instalación.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md): límites, flujos, invariantes y mapa completo de módulos.
3. [`MAPA_API.html`](MAPA_API.html): endpoints y formas de datos observadas en Eloisa.
4. [`CHANGELOG.md`](CHANGELOG.md): decisiones visibles entregadas por versión.

## Flujo de contribución

1. Confirma rama, `origin/main` y estado del árbol de trabajo.
2. Ubica el flujo y el módulo dueño en `ARCHITECTURE.md`; evita añadir lógica al orquestador si ya existe un dueño específico. Respeta las capas (`core` → `io` → `ai` → `ui`) y las convenciones de código de esa misma página; el lint y `npm run cycles:check` las verifican.
3. Haz un cambio pequeño, con pruebas enfocadas y un commit comprensible.
4. Si agregas, renombras o eliminas un módulo de `src/`, actualiza el bloque `module-map` de la arquitectura y toda ruta que lo cite: `docs:check` falla con rutas inexistentes.
5. Ejecuta `npm run check` y `npm run test:e2e` antes de publicar; usa `npm run pack` cuando cambie una versión entregable.
6. Registra en el PR qué nivel de evidencia alcanzaste y qué quedó sin validar.

## Niveles de evidencia

| Nivel | Qué demuestra | Qué no demuestra |
|---|---|---|
| Fuente y pruebas locales | Contratos y lógica aislada | integración visual ni Chrome MV3 real |
| Arnés sintético en navegador | interacción, diseño y datos controlados | permisos, almacenamiento y sesión reales |
| Extensión cargada en Chrome | manifiesto, permisos y ejecución MV3 | exactitud frente a una sesión clínica concreta |
| Eloisa autenticada | comportamiento integrado con la API real | ausencia futura de cambios en la API |

No se usan datos clínicos reales en fixtures, capturas públicas, commits ni descripciones de PR.
