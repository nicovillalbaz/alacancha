# Observaciones generales de la aplicación

## Funciones compartidas entre torneos

- Implementar cada función o corrección en el flujo común cuando los torneos compartan el mismo comportamiento. Usar la configuración del torneo y su reglamento versionado para elegir formatos, tarifas, tarjetas y demás variantes. Un torneo nuevo con esa configuración debe poder usar la función desde el principio.
- Mantener los datos propios en su organización y copa. Los dorsales, las nóminas, las actas y las fichas de equipo usan las mismas reglas de aplicación. El importe sugerido del derecho de partido se guarda por torneo y puede quedar vacío. Los Gs. 20.000 de Caacupé corresponden a su configuración.
- Antes de publicar un cambio compartido, probar con datos de ensayo un torneo existente y uno recién creado. Cuando cambie el flujo según el formato, cubrir al menos dos formatos representativos y el estado sin configuración. Cotejar las actas, las publicaciones y los cobros previos que el cambio pueda afectar. Documentar las diferencias deportivas que requieran una plantilla adicional.

## Escudos, logos y emblemas

- Usar la misma lógica en todos los torneos. En Fixture, Partidos, Clasificación, fichas y editores de marca, las imágenes pequeñas piden la miniatura WebP de hasta 128 px con `?size=128`. Se preservan la proporción y la transparencia. Los originales se mantienen para flyers y descargas.
- Reutilizar una sola URL por escudo para listas, tablas y fichas dentro de cada ámbito. Reservar el tamaño desde el primer render. Cargar los escudos al acercarse a la vista y recuperar de inmediato los ya descargados. Cuando no hay escudo, mostrar las iniciales donde la vista tenga ese espacio previsto.
- En el portal, la API comprueba la publicación del recurso y el navegador puede reutilizar la miniatura durante cinco minutos. Al vencer, el ETag permite revalidarla sin bajar otra copia si sigue vigente.
- En el panel, servir los archivos desde las rutas privadas que verifican sesión, organización y recurso. Las respuestas usan `private, no-store`. Reutilizar las miniaturas solo en la memoria de la página para la sesión y organización activas. Las solicitudes simultáneas al mismo recurso comparten una descarga. El acceso que falle debe respetar el estado vacío del componente.
- El panel reaprovecha una miniatura hasta dos minutos, con un límite de 128 imágenes y 4 MiB. Al cambiar de sesión u organización, se cancelan las cargas pendientes y se liberan las imágenes. Al reemplazar un escudo o logo, invalidar esa miniatura para descargar la nueva. El service worker conserva su exclusión de la API.
- Para verificar el rendimiento, medir la primera apertura con caché vacía y el recorrido Fixture → Partidos → Clasificación → Fixture. Contar bytes y descargas de imágenes por separado del tiempo hasta ver los escudos. Comprobar el tamaño, la lectura habilitada y la denegación entre organizaciones. Las pruebas de actualizaciones deportivas usan datos de ensayo.

## Primera carga de Fixture

- Medir cuándo se ve el primer partido y cuándo terminan de cargar los escudos. Son momentos distintos.
- Al abrir Fixture directamente, verificar la sesión y adelantar las lecturas del torneo elegido mientras se descarga el panel. Reutilizar cada respuesta al montar la vista. Cancelar las lecturas pendientes al salir o cambiar de sesión.
- Para un formato por posiciones, cargar el calendario y el estado resumido desde la misma revisión. En los demás formatos, pedir las fechas, el calendario anunciado cuando exista y el contexto necesario para mostrarlos en paralelo.
- Mostrar hasta cuatro cruces conocidos cuando esté disponible la información autorizada. Montar después la pantalla completa con esos mismos cruces, sus controles y escudos. Si la lectura inicial falla, la pantalla completa conserva su carga y su error habituales.

## Regreso de una ficha de partido

- Al abrir un partido desde un listado, guardar la fecha o jornada, el selector y la posición en el historial de esa pantalla. Al cerrar, recuperar la misma entrada. Si el partido cambió de lugar en el listado, usar su fila para recuperar la posición visible.
- Revisar el regreso por el botón de la ficha y por Atrás en el navegador en el panel y el portal. Cubrir listados largos, jornadas seleccionables y rondas del cuadro.
