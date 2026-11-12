# Copa Sanber 2026 — fuentes y alcance de la carga

El propietario pidió crear la Federación San Bernardinense de Fútbol de Salón y la Copa Sanber, con categoría Primera y diez equipos. Confirmó `usuariofsbfs` como cuenta organizadora y la presentación pública de la Copa y los equipos, aun sin programación. El formato, grupos, reglamento deportivo, precios por tarjeta, fechas y fixture no están confirmados y permanecen en borrador. La publicación de presentación no habilita resultados.

Los originales están en `img/FSBFS`. La primera carga los usó sin modificar:

| Entidad | Archivo | Nombre visible |
|---|---|---|
| Federación | `615424389_122199289082369201_3548612563604717913_n.jpg` | Federación San Bernardinense de Fútbol de Salón |
| Copa | `WhatsApp Image 2026-11-12 at 09.44.56.jpeg` | Copa Sanber |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.11.jpeg` | Deportivo Puerta del Lago |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.11 (1).jpeg` | Sport Center |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.12.jpeg` | Sport Santa Lucía |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.12 (1).jpeg` | San Cristóbal |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.12 (2).jpeg` | Concepción Fútbol Club |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.12 (3).jpeg` | 3 de Febrero |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.13.jpeg` | Los Russia FC |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.13 (1).jpeg` | Villa Delfina |
| Equipo | `WhatsApp Image 2026-11-12 at 09.39.14.jpeg` | Santa Rosa FC |
| Equipo | `WhatsApp Image 2026-11-12 at 09.42.21.jpeg` | Sport Comando |

`FPFS.pdf` queda como fuente aportada, sin importar ni publicar por ahora. El emblema entregado dice «Campeonato San Bernardino 2026»; se utiliza como imagen, mientras que el nombre visible solicitado es «Copa Sanber».

El 12/11/2026 se prepararon doce derivados en `img/FSBFS/logos-blanco/`: solo el escudo o emblema, centrado en lienzo blanco de 512 × 512. El recorte conserva los píxeles del arte original y no redibuja nombres, formas ni símbolos. `scripts/prepare-fsbfs-logos.py` permite repetir el proceso; `scripts/refresh-fsbfs-logos.ts` sustituye la referencia a cada medio mediante la API, sin borrar los originales ni alterar equipos, torneo o fixture.

La carga debe ensayarse con respaldo restaurado y medios separados, y confirmar diez escudos, ninguna jornada o partido creado, reglamento en borrador y enlace público `/copa-sanber`. El acceso del organizador se entrega manualmente; la contraseña aleatoria queda en archivo privado del VPS con permisos `0600`.
