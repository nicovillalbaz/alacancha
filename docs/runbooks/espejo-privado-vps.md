# Espejo privado de Copa Caacupé en el VPS

El espejo sirve para ensayar sorteos, partidos, actas, pagos y flyers con una copia de los datos actuales. Está en `torneos_stage` y `/srv/torneos/staging-media`; las escrituras no alcanzan `torneos_prod` ni `/srv/torneos/media`. La copia es puntual: los cambios posteriores de la Copa real no aparecen automáticamente.

## Instalación única

1. Confirmar que `torneos-api`, `torneos-worker` y PostgreSQL están activos y que existe una copia restaurable de producción.
2. Ejecutar como root `bash /srv/torneos/app/scripts/vps-create-private-mirror.sh`. Cancela si la base, la carpeta de medios o el archivo de entorno del espejo ya existen. Guarda un respaldo nuevo en `/srv/torneos/backups` y comprueba el número de tablas restauradas.
3. Copiar `deploy/systemd/torneos-staging-api.service` y `deploy/systemd/torneos-staging-worker.service` a `/etc/systemd/system/`; ejecutar `systemctl daemon-reload` y `systemctl enable --now torneos-staging-api torneos-staging-worker`.
4. Verificar `systemctl is-active torneos-staging-api torneos-staging-worker`, `curl http://127.0.0.1:4313/ready` y `ss -ltn`: el puerto 4313 debe escuchar solo en `127.0.0.1`. Comprobar que no exista ruta Caddy hacia 4313.

El script copia el secreto de aplicación para que la identidad cifrada de la instantánea pueda leerse. No imprime ese secreto. Revoca las sesiones e invitaciones pendientes en el espejo; cada persona debe ingresar allí otra vez. La cuenta de producción conserva su propia sesión y sus datos.

## Abrirlo desde la computadora autorizada

En una terminal propia, dejar abierto:

```sh
ssh -i C:/Users/info/.ssh/alacancha_ovh_20261111 -N -L 4313:127.0.0.1:4313 ubuntu@40.160.139.5
```

Abrir `http://127.0.0.1:4313/` en el navegador de esa misma computadora. La gestión está en `http://127.0.0.1:4313/acceso`; ingresar con la cuenta de la Copa. Cerrar la terminal corta el túnel. Ningún visitante de `https://alacancha.webs.vc/` ve el espejo.

El puerto local es distinto de la web local de desarrollo (`4311`) y de la API de producción (`4312`). No abrir 4313 en el firewall, no añadir un host público a Caddy, no distribuir el respaldo ni el archivo `staging.env`.

## Uso y límites

- Marcar visiblemente las pruebas como tales en el espejo. Un resultado o flyer publicado allí nunca llega al sitio público real.
- Antes de un refresco del espejo, conservar su respaldo y ensayar restauración. Este script no sustituye la base existente; para recrearla se requiere un procedimiento separado y revisado.
- Verificar cada nuevo despliegue en el espejo antes de producción. Ambos servicios leen el mismo código del servidor, pero datos, medios y colas de trabajo están separados.
- La apertura en un teléfono real requiere un túnel SSH en ese teléfono o una solución privada adicional. El acceso por navegador de escritorio no demuestra experiencia física en Android o iOS.
