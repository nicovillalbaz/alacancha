# Observaciones generales de la aplicación

## Escudos, logos y emblemas

- Usar la misma lógica en todos los torneos. En Fixture, Partidos, Clasificación, fichas y editores de marca, las imágenes pequeñas piden la miniatura WebP de hasta 128 px con `?size=128`. Se preservan la proporción y la transparencia. Los originales se mantienen para flyers y descargas.
- Reutilizar una sola URL por escudo para listas, tablas y fichas dentro de cada ámbito. Reservar el tamaño desde el primer render. Cargar los escudos al acercarse a la vista y recuperar de inmediato los ya descargados. Cuando no hay escudo, mostrar las iniciales donde la vista tenga ese espacio previsto.
- En el portal, la API comprueba la publicación del recurso y el navegador puede reutilizar la miniatura durante cinco minutos. Al vencer, el ETag permite revalidarla sin bajar otra copia si sigue vigente.
- En el panel, servir los archivos desde las rutas privadas que verifican sesión, organización y recurso. Las respuestas usan `private, no-store`. Reutilizar las miniaturas solo en la memoria de la página para la sesión y organización activas. Las solicitudes simultáneas al mismo recurso comparten una descarga. El acceso que falle debe respetar el estado vacío del componente.
- El panel reaprovecha una miniatura hasta dos minutos, con un límite de 128 imágenes y 4 MiB. Al cambiar de sesión u organización, se cancelan las cargas pendientes y se liberan las imágenes. Al reemplazar un escudo o logo, invalidar esa miniatura para descargar la nueva. El service worker conserva su exclusión de la API.
- Para verificar el rendimiento, medir la primera apertura con caché vacía y el recorrido Fixture → Partidos → Clasificación → Fixture. Contar bytes y descargas de imágenes por separado del tiempo hasta ver los escudos. Comprobar el tamaño, la lectura habilitada y la denegación entre organizaciones. Las pruebas de actualizaciones deportivas usan datos de ensayo.
