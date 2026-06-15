# Loquera MVP

Loquera es una aplicación desktop open source para tomar notas locales en
Markdown y capturar contenido desde el navegador. La app usa Tauri 2, React,
TypeScript y Rust. No necesita cuenta, base de datos ni servicios cloud.

## Qué incluye

- Proyectos representados por carpetas.
- Notas guardadas físicamente como archivos `.md`.
- Editor Markdown básico.
- Servidor HTTP local en `http://localhost:3210`.
- Extensión Manifest V3 para Chrome y Edge.
- Captura de título, URL, texto seleccionado, comentario y timestamp de YouTube.

## Requisitos

- Node.js 20 o posterior y npm.
- Rust estable con Cargo.
- Dependencias de sistema de Tauri 2 para tu plataforma.
- En Windows: Microsoft C++ Build Tools y WebView2.

Consulta los [prerrequisitos oficiales de Tauri](https://v2.tauri.app/start/prerequisites/)
si es la primera vez que ejecutas una app Tauri.

## Instalación

Desde la raíz del proyecto:

```powershell
npm install
npm run tauri dev
```

En PowerShell con ejecución de scripts restringida se puede usar:

```powershell
npm.cmd install
npm.cmd run tauri dev
```

Vite abre el frontend en el puerto `1420`, Tauri crea la ventana desktop y el
backend Rust inicia automáticamente el servidor de capturas en el puerto `3210`.

## Uso de la app

1. Crea o selecciona un proyecto.
2. Crea una nota.
3. Edita el Markdown en el panel principal.
4. Pulsa **Guardar cambios**.
5. Usa **Refrescar** para volver a leer proyectos y notas del filesystem.

Las notas se guardan en la carpeta de documentos del usuario, dentro de
`Loquera`. Normalmente:

```text
~/Documents/Loquera/<proyecto>/<nota>.md
```

La ruta exacta aparece en la parte superior de la app. En sistemas donde la
carpeta Documents está redirigida, Loquera usa esa ubicación del sistema.

## Cargar la extensión

### Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta `extension/` de este proyecto.

### Edge

1. Abre `edge://extensions`.
2. Activa **Modo para desarrolladores**.
3. Pulsa **Cargar desempaquetado**.
4. Selecciona la carpeta `extension/`.

La app desktop debe estar abierta para recibir capturas.

## Probar una captura normal

1. Ejecuta `npm run tauri dev`.
2. Abre cualquier página web normal.
3. Selecciona texto de la página, si quieres.
4. Abre la extensión Loquera.
5. Mantén `Inbox` y `Capturas` o escribe otros nombres.
6. Añade un comentario y pulsa **Guardar captura**.
7. En la app, pulsa **Refrescar** y abre la nota de destino.

También puedes comprobar el servidor directamente:

```powershell
Invoke-RestMethod http://localhost:3210/api/health
```

La respuesta esperada es `{ "ok": true }`.

## Probar YouTube

1. Abre un video de YouTube y deja que avance.
2. Abre la extensión sin cerrar la pestaña del video.
3. Pulsa **Guardar captura**.
4. La sección añadida incluirá el tiempo actual con formato `MM:SS` o
   `HH:MM:SS`.

## Limitaciones actuales

- No hay vista previa de Markdown.
- No hay renombrado ni borrado de proyectos o notas.
- CORS permite cualquier origen durante el MVP.
- El servidor solo escucha en `127.0.0.1`, sin autenticación.
- El puerto `3210` es fijo.
- No hay autosave ni aviso al cambiar de nota con cambios pendientes.
- La extensión no funciona en páginas internas del navegador como
  `chrome://extensions`.
- No se generan instaladores porque `bundle.active` está desactivado.

## Próximas iteraciones sugeridas

1. Restringir CORS y añadir un token local compartido con la extensión.
2. Añadir renombrado, borrado seguro y confirmaciones.
3. Incorporar autosave y protección de cambios pendientes.
4. Añadir preview Markdown y búsqueda local.
5. Hacer configurable la carpeta raíz y el puerto.
6. Añadir iconos y habilitar bundles de distribución.

La referencia técnica y el registro de continuidad están en
[`manifest.md`](manifest.md).
