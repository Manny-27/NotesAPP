# Loquera MVP

Loquera es una aplicación desktop open source para tomar notas locales en
Markdown y capturar contenido desde el navegador. La app usa Tauri 2, React,
TypeScript y Rust. No necesita cuenta, base de datos ni servicios cloud.

## Qué incluye

- Proyectos representados por carpetas.
- Notas guardadas físicamente como archivos `.md`.
- Editor Markdown básico.
- Servidor HTTP local en `http://127.0.0.1:3210`.
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
backend Rust inicia automáticamente la API en `http://127.0.0.1:3210`.

La misma interfaz también puede abrirse en el navegador en
`http://localhost:1420` mientras `tauri dev` está activo. La vista web y la
ventana desktop usan la misma API HTTP y reciben cambios en tiempo real.

## Uso de la app

1. Crea o selecciona un proyecto.
2. Crea una nota.
3. Edita el Markdown en el panel principal.
4. Pulsa **Guardar cambios**.
5. Los cambios se sincronizan automáticamente. **Actualizar** queda disponible
   como recuperación manual.

El indicador superior muestra **Sincronización activa** cuando la conexión SSE
está disponible. El botón **Día / Noche** cambia el tema.

### Edición y lectura

Usa el selector **Editar / Lectura** encima de la nota:

- **Editar** muestra el Markdown crudo.
- **Lectura** renderiza headings, listas, enlaces, imágenes, blockquotes,
  tablas y código.

La preferencia queda guardada localmente.

### Autosave

En modo edición no hay botón Guardar. Loquera guarda automáticamente unos
`850 ms` después de dejar de escribir. La barra superior muestra:

- **Editando...**
- **Guardando...**
- **Guardado**
- **Error al guardar**

El auto-renombrado desde `# Título` sigue aplicándose durante autosave. Si se
cambia de nota con modificaciones pendientes, Loquera intenta guardarlas antes
de abrir la siguiente.

### Barra lateral

La biblioteca usa un árbol compacto tipo Obsidian:

- cada proyecto puede expandirse o colapsarse;
- las notas aparecen debajo de su proyecto;
- el menú discreto de cada nota contiene renombrar y eliminar;
- las notas pueden arrastrarse sobre otro proyecto;
- los botones superiores crean nota, crean carpeta o colapsan todo;
- Ajustes permanece fijo al pie de la barra.

El árbol, editor y vista de lectura tienen scroll independiente.

### Renombrar y eliminar

Al pasar el cursor por una nota aparecen las acciones **Renombrar** y
**Eliminar**. El borrado pide confirmación y elimina únicamente el archivo
Markdown seleccionado.

### Auto-renombrado

Si el primer renglón de una nota es:

```markdown
# Nueva Idea de Producto
```

al guardar, el archivo pasa a llamarse `Nueva Idea de Producto.md`. Si ya existe
una nota con ese nombre, el contenido se guarda en el archivo actual y la app
muestra un warning sin sobrescribir nada.

### Mover notas

Arrastra una nota mediante el handle `::` y suéltala sobre otro proyecto.
También puedes usar el selector **Mover a...** del editor. Si el destino ya
contiene una nota con el mismo nombre, la operación se rechaza.

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
Invoke-RestMethod http://127.0.0.1:3210/api/health
```

La respuesta esperada es `{ "ok": true }`.

## Probar YouTube

1. Abre un video de YouTube y deja que avance.
2. Abre la extensión sin cerrar la pestaña del video.
3. Pulsa **Guardar captura**.
4. La sección añadida incluirá una miniatura clickeable, enlace con timestamp y
   el tiempo actual con formato `MM:SS` o `HH:MM:SS`.

En modo Lectura, la miniatura se muestra como una tarjeta visual enlazada al
video.

## Modos de la extensión

- **Captura rápida:** guarda directamente en `Inbox/Capturas`.
- **Enviar a nota:** permite elegir un proyecto y una nota existente o crear
  una nueva.
- **Nota rápida:** escribe una idea breve y la agrega como sección Markdown a
  una nota.

El popup carga proyectos y notas desde Loquera, muestra preview de la página,
detecta YouTube y permite copiar la URL. Si la aplicación no está abierta,
muestra un error de conexión.

## Limitaciones actuales

- No hay renombrado ni borrado de proyectos.
- CORS permite cualquier origen durante el MVP.
- El servidor solo escucha en `127.0.0.1`, sin autenticación.
- El puerto `3210` es fijo.
- No hay autosave.
- No hay watcher para cambios hechos directamente por otro editor.
- El orden de notas no se persiste.
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
