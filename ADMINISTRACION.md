# Administración privada de MISO CR

El catálogo público permanece en https://misocr.github.io/miso-cr-catalogo/.
El panel Node se aloja por separado; guarda los cambios en este mismo repositorio.

## Funciones

- Inicio de sesión con una GitHub App; cuenta inicial autorizada: `misocr`.
- Editar nombre, categoría, descripción, palabras de búsqueda y precio.
- Ocultar y restaurar diseños.
- Agregar fotos JPEG, PNG y WebP. El navegador reduce la foto a un máximo de 2000 píxeles y la convierte a JPEG.
- Guardar en `catalog.json`; GitHub Pages publica los cambios en unos minutos.
- Las fichas existentes conservan sus referencias y las correcciones revisadas.

## Activación pendiente

1. Alojar este repositorio como servicio Node 22+ con `npm start` y healthcheck `/health`. Mantener una sola réplica: las sesiones viven en memoria y duran como máximo una hora.
2. Establecer `APP_ORIGIN` con el origen HTTPS exacto del servicio, sin ruta ni barra final.
3. Crear una **GitHub App** propiedad de `misocr`, para instalar únicamente en esta cuenta. Callback: `APP_ORIGIN/auth/callback`. Desactivar webhooks y el flujo de dispositivos. Mantener la caducidad de tokens de usuario activada.
4. Permisos del repositorio: **Contents: Read and write** y **Metadata: Read-only**. Sin permisos de cuenta, organización, administración ni workflows. Instalar la app solamente en `misocr/miso-cr-catalogo`.
5. Guardar `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` exclusivamente en variables privadas del servicio. Nunca en el repositorio, el navegador o el catálogo.
6. `ADMIN_LOGINS=misocr`. Para otra persona, agregar su usuario exacto separado por coma y darle permiso de escritura sobre este repositorio. Debe iniciar sesión con su propia cuenta de GitHub.
7. Validar el inicio de sesión real y una edición autorizada después de completar la conexión. Hasta entonces el panel permanece cerrado.

## Seguridad y operación

El servidor verifica la lista de cuentas y el permiso de escritura de GitHub. Cada operación vuelve a comprobar el permiso. Los tokens permanecen en memoria del servidor; el navegador recibe solamente una cookie opaca HttpOnly, Secure y SameSite=Lax. Se validan estado OAuth, PKCE, origen y token CSRF. El servidor solo sirve los tres archivos públicos de la interfaz; no sirve variables, archivos fuente ni archivos arbitrarios.

Las ediciones comprueban la versión de `catalog.json`. Una foto nueva y su ficha se publican en un único commit, con actualización de rama sin `force`. Si alguien cambió el catálogo, se debe recargar antes de volver a guardar. No se borran fotos al ocultar diseños. Los archivos de un repositorio público siguen siendo públicos aunque una ficha esté oculta.

Para reducir reinicios, configurar el servicio para desplegarse únicamente cuando cambien `miso-admin-server.mjs`, `miso-admin.js`, `miso-admin.html`, `miso-admin.css` o `package.json`. Reiniciar el servicio cierra las sesiones. Cerrar sesión invalida la sesión inmediatamente.

Pruebas locales: `npm test`. Las pruebas usan GitHub simulado; no sustituyen la validación de la conexión real después de instalar la app.

## Recuperación

Cada guardado crea un commit en GitHub. Se puede restaurar `catalog.json` desde el historial. El panel no agrega administradores a través de la interfaz ni permite cambiar el repositorio destino.
