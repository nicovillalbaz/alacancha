# 04. Estructura prevista del repositorio

**Estado al 28/10/2026:** existen web Vue, API Fastify, worker de mantenimiento, DB/migraciones 001–016, contratos compartidos, estilos UI, scripts y pruebas de integración de T01, T02, núcleo T03 y núcleo T04, además de documentación y prototipo. El editor móvil de reglamentos vive en `apps/web/src/RulesEditor.vue`; las rutas T02–T04 están en `apps/api/src/app.ts` y los generadores de liga, grupos y eliminatoria en `packages/shared/src/fixture.ts`. `infra/`, pruebas unitarias y e2e del diagrama son propuestas para sus necesidades futuras; no se crearon carpetas vacías para simular progreso. `.local/` contiene la instancia nativa y archivos privados y queda ignorada por Git.

```text
alacancha/
├── README.md
├── AGENTS.md
├── package.json, package-lock.json, .env.example, .gitignore
├── PROYECTO_TORNEOS_ESPECIFICACION_MAESTRA_CODEX.md
├── prototipos/01-direccion-visual/ # exploración estática aislada, ya existente
├── docs/
│   ├── README.md, 01-... a 13-..., avances.md
│   ├── tandas/01-... a 09-...
│   ├── decisiones/             # ADR futuros cuando una elección técnica lo requiera
│   ├── evidencias/             # resultados, capturas y actas reales
│   └── runbooks/              # desarrollo, respaldo y operación al implementarse
├── apps/
│   ├── web/                   # Vue/PWA, rutas por rol, portal público
│   ├── api/                   # Fastify: auth, organizaciones, torneos y deporte
│   └── worker/                # render PDF/flyers, jobs y reconstrucciones
├── packages/
│   ├── db/                    # SQL versionado, migrador, consultas, seeds ficticios
│   ├── shared/                # contratos, tipos y validadores compartidos
│   └── ui/                    # tokens y componentes accesibles
├── infra/
│   ├── local/                 # configuración de procesos nativos; sin contenedores
│   └── backups/               # scripts y documentación, nunca respaldos reales en Git
├── scripts/                   # entorno nativo, arranque, respaldo/restauración y prototipo
└── tests/
    ├── unit/
    ├── integration/            # access.test.ts existente
    ├── e2e/
    └── security/
```

## Responsabilidad de cada zona

- `apps/web`: navegación y estados por perfil; ninguna autorización depende solo de ocultar botones. El portal público usa contratos separados de los privados.
- `apps/api`: comandos de dominio y comprobación de actor/contexto. Monolito modular inicial, evitando dependencias circulares entre torneos, deporte, disciplina y publicación.
- `apps/worker`: trabajos repetibles e idempotentes. Renderiza localmente y consume outbox; no inventa resultados deportivos.
- `packages/db`: migraciones SQL revisables, restricciones y acceso transaccional. Seeds solo con datos ficticios; producción nunca ejecuta seeds de demo.
- `packages/shared`: esquemas de solicitud/respuesta y errores con versión. No colocar secretos ni acceso a DB aquí.
- `packages/ui`: tokens semánticos, controles móviles, estados y ejemplos con marcas distintas.
- `infra`: despliegue y respaldo; archivos de entorno reales, llaves, documentos personales y dumps quedan fuera del control de versiones.

## Convenciones iniciales

- Un módulo por dominio: identidad, activación de acceso, organizaciones, torneos, reglamentos, equipos/comisión, jugadores/buena fe/procedencia, fixture/jornadas, partidos/actas, estadísticas, disciplina, medios/publicación.
- Rutas API privadas versionadas `/api/v1`; rutas públicas `/public/v1`. Comandos explícitos para aprobar/publicar/corregir/confirmar, no CRUD genérico en transiciones sensibles.
- Migraciones numeradas e irreversibilidad documentada cuando aplique; usar tablas y columnas con nombres estables en inglés técnico, UI y docs en español.
- IDs internos UUID; fecha UTC en DB y zona IANA configurada por torneo para mostrar/programar; PYG como entero.
- Toda carpeta nueva debe tener propósito y prueba o ejemplo de uso. El README se actualiza cuando la estructura real difiera de esta propuesta.
