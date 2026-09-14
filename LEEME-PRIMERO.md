# Actualización de MISO CR: fichas y administrador

Esta actualización está preparada y probada, pero todavía NO está publicada.
Se aplica al repositorio existente `misocr/miso-cr-catalogo`. No crea otra página ni otro repositorio.

## Contenido

- 289 fichas con 300 fotos de cuadros, incluidas las 11 fichas anteriores.
- Tomas del mismo cuadro agrupadas en su ficha; los nombres y archivos originales no se modifican.
- Las otras 7 fotos se conservan: 5 de presentación, 1 de ubicación y 1 ajena al catálogo de cuadros.
- 50 fichas tienen una descripción neutral y la marca interna «Por revisar». Son visibles como referencias; su temática se puede corregir desde el administrador.
- Búsqueda por nombre, temática, palabras clave y código. Filtros combinados con la búsqueda.
- Detalle con varias fotos; selección de diseños y contacto por WhatsApp con María o Ximena.
- Conserva precios, pagos, galerías, ubicación y el enlace Waze proporcionado.
- Administrador con contraseña: agregar fotos, crear y editar fichas, precio, categoría, palabras clave, contactos, retirar y restaurar.

## 1. Actualizar el mismo repositorio

Descomprimí el ZIP. Subí el CONTENIDO de la carpeta `archivos-para-repositorio` a la raíz de `misocr/miso-cr-catalogo`, conservando la carpeta `backend` con su archivo `app.py`.

En GitHub, dentro del repositorio, usá **Add file → Upload files**. Arrastrá los archivos y la carpeta `backend`, y confirmá con **Commit changes**. El archivo `index.html` debe reemplazar el existente; no debe quedar dentro de otra carpeta.

No borres ninguna imagen del repositorio. Este paquete no vuelve a incluir los 624 MB de fotos que ya están allí.

Cuando GitHub Pages termine de publicar, la página podrá mostrar las 289 fichas a partir de `products.json`, aunque Railway aún no esté configurado. Ese archivo es una copia inicial de referencia, no la base de datos editable. El enlace de administración se habilita cuando responde el nuevo backend.

## 2. Activar el administrador en Railway

Usá el servicio existente `miso-catalogo` del proyecto actual, conservando el volumen de datos montado en `/data`. Esta actualización sustituye la aplicación que corre en ese servicio por el catálogo de `misocr`; los datos anteriores del volumen no se borran.

Después de subir TODOS los archivos del paso anterior:

1. En **Settings → Source**, conectá el repositorio `misocr/miso-cr-catalogo`, rama `main`, raíz `/`. Si no aparece, la integración de Railway debe tener acceso a ese repositorio desde la cuenta propietaria `misocr`.
2. Usá el **Dockerfile** incluido para construir. Quitá cualquier comando de inicio anterior que reemplace el del Dockerfile.
3. Conservá el volumen `/data`. La aplicación crea su base de datos y nuevas fotos en `/data/misocr`, sin sobrescribir la base de la aplicación anterior.
4. Revisá estas variables en Railway; no las escribas en GitHub ni en el chat:

| Variable | Valor |
|---|---|
| `ADMIN_PASSWORD` | Contraseña privada aleatoria de al menos 16 caracteres. Se puede conservar la existente si cumple ese requisito. |
| `SESSION_SECRET` | Secreto aleatorio de al menos 32 caracteres. Se puede conservar el existente si cumple ese requisito. |
| `STORAGE_ROOT` | `/data` |
| `PUBLIC_URL` | `https://miso-catalogo-production.up.railway.app` |

5. Desplegá y verificá que `/health` devuelva `ok: true` y `catalog: misocr`.
6. Abrí `https://miso-catalogo-production.up.railway.app/admin` e ingresá con `ADMIN_PASSWORD`.
7. Abrí también `https://misocr.github.io/miso-cr-catalogo/`; el enlace **Administrar** debe quedar habilitado.

Si se usa un dominio distinto, actualizá `PUBLIC_URL` y `backendUrl` en `config.js` con ese mismo origen HTTPS. No agregues `/admin` ni una barra final al valor.

## Uso diario

En **Administrar → Agregar diseño**, cargá las fotos, completá los datos y tocá **Guardar diseño**. La primera foto será la portada. Los visitantes ven los cambios al cargar o recargar el catálogo conectado; no es necesario editar GitHub para cada foto nueva.

**Por revisar** permite encontrar las 50 fichas cuya temática conviene confirmar. **Retirar del catálogo** oculta el diseño sin borrar fotos; se puede restaurar desde **Retirados**.

Se admiten JPG, PNG y WebP de hasta 12 MB y 30 megapíxeles, máximo 12 fotos por ficha. Las nuevas fotos se convierten a WebP y se reducen a un máximo de 1800 píxeles; las miniaturas se generan por separado. Las fotos originales del repositorio no se alteran.

**Exportar fichas** descarga los datos en JSON. No incluye las imágenes ni equivale a un respaldo completo: para recuperar fotos subidas desde el administrador también se necesita conservar o respaldar el volumen `/data/misocr`.

Si Railway no responde, GitHub Pages muestra el catálogo inicial de referencia y una nota de disponibilidad. Durante esa interrupción, las ediciones recientes y retiros del administrador no estarán reflejados en esa copia inicial. GitHub Pages por sí solo no ejecuta el administrador ni guarda nuevas fotos.

## Verificación realizada

- Coinciden las huellas SHA-256 de las 307 imágenes originales.
- 289 identificadores únicos y 300 fotos asignadas a fichas.
- Inicio de sesión, bloqueo de acceso sin autenticación, protección contra solicitudes desde otros sitios y límite de intentos de contraseña.
- Rechazo de archivos inválidos y tipos no admitidos; subida válida y miniaturas.
- Alta, edición, conflicto de versiones, retiro, restauración y persistencia al reiniciar.
- Catálogo estático y conectado, búsquedas, filtros, detalle, selección y contactos comprobados mediante pruebas del DOM.
- No se ha comprobado visualmente esta actualización en un navegador publicado: falta el despliegue.

La carpeta `verificacion` del ZIP contiene las pruebas y el inventario, y no es necesario subirla para publicar.

Para repetir las pruebas técnicas, trabajá desde la raíz del repositorio con Python 3.12: instalá `requirements.txt`, `pytest` y `httpx`, copiá `verificacion/tests` y ejecutá `python -m pytest -q tests/test_admin.py`. Para las pruebas del DOM, instalá `jsdom` junto a `check-dom.cjs` y ejecutá `node check-dom.cjs /ruta/al/repositorio`. Estas pruebas usan credenciales de prueba y almacenamiento temporal; no se conectan al servicio publicado.
