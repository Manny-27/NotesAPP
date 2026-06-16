# Manifest de Loquera MVP

## Identidad

- **Nombre:** `loquera-mvp`
- **Propósito:** aplicación local-first de notas Markdown con captura desde el
  navegador.
- **Estado:** octava iteración implementada y validada en Windows.
- **Última actualización:** 2026-06-15.

## Stack

- Tauri 2 y Rust 2021.
- React 19, TypeScript y Vite 8.
- Axum y Server-Sent Events.
- `react-markdown` y `remark-gfm`.
- `@dnd-kit/core`.
- `tldraw`.
- Tailwind CSS 4 y primitivas shadcn/ui basadas en Radix.
- Lucide React y Sonner.
- Extensión Manifest V3.
- Archivos Markdown y pizarras JSON; sin base de datos.

## Arquitectura

`Storage`, en Rust, sigue siendo el único dueño del filesystem:

```text
Extensión ─┐
UI web ────┼─ HTTP API 127.0.0.1:3210 ─ Storage ─ Documents/Loquera
UI Tauri ──┘                  │
                             └─ EventBus ─ SSE /api/events
```

La UI web y Tauri usan `src/api.ts`. HTTP es el transporte principal; los
comandos Tauri existentes son fallback durante el arranque. Toda escritura
HTTP o Tauri publica eventos.

## Almacenamiento y seguridad

```text
~/Documents/Loquera/<proyecto>/<nota>.md
~/Documents/Loquera/<proyecto>/<pizarra>.loqboard.json
```

- Proyectos y notas se sanitizan antes de crear rutas.
- Solo se conservan caracteres alfanuméricos, espacios, `_` y `-`.
- No se aceptan rutas absolutas ni componentes `..`.
- Delete opera exclusivamente sobre el archivo `.md` calculado.
- Rename y move rechazan destinos existentes.
- Move nunca acepta una ruta; solo un nombre de proyecto sanitizado.
- El endpoint move no crea el destino salvo que
  `createTargetProject: true`.
- Las pizarras usan el mismo saneamiento de nombres y se guardan con extension
  `.loqboard.json`.

## API frontend común

`src/api.ts` expone:

- `listProjects`
- `createProject`
- `listNotes`
- `listBoards`
- `readNote`
- `readBoard`
- `createNote`
- `createBoard`
- `saveNote`
- `saveBoard`
- `appendBoardItem`
- `deleteNote`
- `renameNote`
- `moveNote`
- `getNotesRoot`
- `captureNote`
- `subscribe`

## API HTTP

Base: `http://127.0.0.1:3210/api`

| Método | Endpoint | Función |
| --- | --- | --- |
| `GET` | `/health` | Estado |
| `GET` | `/root` | Ruta de notas |
| `GET` | `/projects` | Lista proyectos |
| `POST` | `/projects` | Crea proyecto |
| `GET` | `/projects/:project/notes` | Lista notas |
| `GET` | `/projects/:project/boards` | Lista pizarras |
| `GET` | `/projects/:project/notes/:note` | Lee nota |
| `POST` | `/projects/:project/notes` | Crea nota |
| `POST` | `/projects/:project/boards` | Crea pizarra |
| `PUT` | `/projects/:project/notes/:note` | Guarda y puede auto-renombrar |
| `GET` | `/projects/:project/boards/:board` | Lee pizarra |
| `PUT` | `/projects/:project/boards/:board` | Guarda pizarra |
| `POST` | `/projects/:project/boards/:board/items` | Agrega item a pizarra |
| `DELETE` | `/projects/:project/notes/:note` | Elimina nota |
| `PATCH` | `/projects/:project/notes/:note/rename` | Renombra nota |
| `PATCH` | `/projects/:project/notes/:note/move` | Mueve nota |
| `POST` | `/capture` | Añade captura |
| `GET` | `/events` | Stream SSE |

### Rename

```json
{ "newName": "Nuevo nombre" }
```

Conflictos devuelven HTTP `409`; nunca se sobrescribe otro archivo.

### Move

```json
{
  "targetProject": "Archivo",
  "createTargetProject": false
}
```

La UI solo mueve a proyectos existentes. El soporte para crear destino queda
disponible para clientes explícitos.

### Guardado y auto-renombrado

El primer renglón se considera título solo si comienza exactamente con `# `.
Al guardar:

1. El contenido se escribe en el archivo actual.
2. El heading se sanitiza.
3. Si difiere del nombre actual y el destino no existe, se renombra el archivo.
4. Si el destino existe, el contenido queda guardado en el archivo actual y se
   devuelve un warning.

Respuesta:

```json
{
  "ok": true,
  "note": "Nueva Idea",
  "renamed": true,
  "warning": null
}
```

## Capturas enriquecidas

Rust detecta estas variantes:

- `youtube.com/watch?v=VIDEO_ID`
- `youtu.be/VIDEO_ID`
- `youtube.com/shorts/VIDEO_ID`

No se consultan APIs externas. El thumbnail se deriva de:

```text
https://img.youtube.com/vi/<VIDEO_ID>/hqdefault.jpg
```

El enlace canónico incluye `&t=<segundos>s` cuando existe timestamp. El bloque
Markdown contiene miniatura clickeable, título, URL, origen y timestamp.

Para otros enlaces se escribe título, URL y dominio obtenidos de la URL. En
ambos casos se conservan selección y comentario opcionales.

## Pizarras

Las pizarras viven junto a las notas con extensión `.loqboard.json`. El schema
actual es local-first y versionado:

```json
{
  "schemaVersion": 1,
  "type": "loqboard",
  "title": "Clase YouTube",
  "createdAt": "2026-06-15T12:00:00Z",
  "updatedAt": "2026-06-15T12:30:00Z",
  "items": [],
  "snapshot": null
}
```

`snapshot` guarda el estado de `tldraw`; `items` guarda tarjetas propias de
Loquera como videos de YouTube y texto. La UI permite crear y abrir pizarras
desde el árbol, dibujar/escribir con tldraw, agregar tarjetas de texto y pegar
videos de YouTube como tarjetas movibles con embed y nota asociada.

Desde la séptima iteración, los items de pizarra soportan `pinned`,
`pinnedX`, `pinnedY`, resize persistente por `width`/`height`, tarjetas
`youtube`, `link`, `code` y `text`. Desde la octava iteración también soportan
`locked`: bloquea movimiento, resize y edición sin sacar la tarjeta del canvas.
`pinned` es distinto: fija la tarjeta en la capa de pantalla. Solo YouTube se
embebe como iframe; los enlaces normales se renderizan como preview y se abren
externamente con validación `http`/`https`.

La extensión Manifest V3 incluye modo **Pizarra**: puede enviar la pestaña
actual de YouTube o cualquier web normal a una pizarra existente o nueva usando
el endpoint `/boards/:board/items`. La metadata viene solo del DOM activo:
Open Graph, Twitter cards, canonical, favicon, dominio, descripción y texto
seleccionado. No hay fetch externo ni scraping desde backend.

## Eventos SSE

Eventos específicos:

- `project:created`
- `note:created`
- `note:saved`
- `note:deleted`
- `note:renamed`
- `note:moved`
- `board:created`
- `board:saved`
- `board:item-added`
- `capture:created`

Después de cada evento específico también se publica `notes:changed` para
compatibilidad con clientes genéricos. La UI actual escucha los específicos
para evitar refrescos duplicados.

Campos disponibles según el evento:

```json
{
  "type": "note:moved",
  "project": "Archivo",
  "note": "Idea",
  "oldNote": null,
  "newNote": null,
  "fromProject": "Inbox",
  "toProject": "Archivo"
}
```

La UI:

- conserva selección después de rename y move;
- limpia editor y selección después de delete;
- recarga una nota modificada externamente;
- no sobrescribe contenido local con cambios sin guardar;
- muestra toasts para acciones y conflictos.

## UI de notas

### Edición

- Editor Markdown crudo.
- Autosave con debounce de 850 ms.
- Auto-renombrado desde el primer `# heading`.

El indicador de estado muestra `Editando`, `Guardando`, `Guardado` o error. Las
escrituras se serializan: si cambia contenido durante un request, se encola un
nuevo guardado. Los eventos SSE originados por ese mismo autosave se ignoran
mientras la escritura está activa para evitar carreras con auto-renombrado.

### Lectura

`react-markdown` con `remark-gfm` renderiza:

- headings;
- listas y tablas GFM;
- negritas;
- enlaces externos;
- blockquotes;
- imágenes y thumbnails;
- código inline y bloques.

El modo se persiste en `localStorage`.

### Gestión

- Rename y delete desde cada fila.
- Confirmación antes de delete.
- Selector `Mover a...`.
- Drag handle para soltar una nota sobre otro proyecto.
- El proyecto destino se resalta durante el drop.
- El orden de lista no se persiste todavía.

### Árbol y scroll

La vista anterior de proyectos/notas separados fue sustituida por un árbol
único tipo Obsidian:

- carpetas colapsables;
- notas anidadas;
- acciones en hover mediante Dropdown Menu;
- drop target visual por proyecto;
- cabecera compacta con crear nota/carpeta y colapsar;
- botón Ajustes fijo al pie.

`html`, `body`, `#root` y el shell usan altura completa y overflow bloqueado.
El árbol usa `ScrollArea`, mientras editor y lectura tienen scroll propio con
`min-height: 0`.

Componentes shadcn locales:

- `Button`
- `ScrollArea`
- `Tooltip`
- `DropdownMenu`
- `Dialog`
- `Separator`

Los diálogos sustituyen `window.prompt` y confirmaciones nativas.

## Extensión

El popup consulta proyectos y notas existentes y ofrece:

1. **Captura rápida:** guarda en `Inbox/Capturas`.
2. **Enviar a nota:** elige proyecto y nota, crea una nota si se solicita y
   permite comentario.
3. **Nota rápida:** agrega una sección con fecha a una nota existente o nueva.

También incluye:

- preview de pestaña;
- miniatura y timestamp visual para YouTube;
- preview textual del contenido que se guardará;
- copiar URL;
- estado de conexión y errores claros.

La extensión solo usa HTTP y nunca escribe archivos directamente.

En la cuarta iteración, el popup adoptó las mismas variables visuales: fondos
neutros, bordes finos, controles compactos, estados discretos y modo oscuro
automático mediante `prefers-color-scheme`. También limita su altura y permite
scroll vertical.

## Decisiones técnicas

- **Markdown renderer conocido:** evita mantener un parser incompleto.
- **Dnd Kit core:** ofrece drag and drop accesible sin introducir orden
  persistente.
- **Rename con conflicto no destructivo:** nunca se reemplaza un archivo.
- **Guardado antes del intento de auto-rename:** el contenido del usuario no se
  pierde aunque exista conflicto.
- **Metadata sin terceros:** título y URL vienen de la pestaña; YouTube usa su
  thumbnail pública derivable.
- **Eventos específicos más agregado:** permite clientes detallados y clientes
  simples.
- **Destino de move existente por defecto:** evita crear carpetas por un drop
  accidental.

## Toolbar y menus contextuales

La toolbar Markdown compacta vive encima del editor:

- undo y redo con historial local de hasta 200 cambios;
- limpiar formato y headings H1-H6;
- negrita, cursiva, tachado y codigo inline;
- cita, checkbox, enlace, imagen, tabla, listas y bloque de codigo;
- separador horizontal;
- modo enfoque, que oculta sidebar, cabecera y pie sin desmontar el editor;
- tooltips para cada accion y dropdown para headings secundarios.

Las transformaciones viven en `src/lib/markdown-actions.ts` y operan sobre la
seleccion actual del `textarea`. `src/lib/editor-selection.ts` restaura foco y
seleccion despues de cada cambio. Todas las acciones pasan por el mismo estado
`content`, por lo que conservan el autosave existente.

Atajos: `Ctrl/Cmd+B`, `Ctrl/Cmd+I`, `Ctrl/Cmd+\``, `Ctrl/Cmd+Z` y
`Ctrl/Cmd+Shift+Z`. No se agrega subrayado porque Markdown/GFM no define una
sintaxis estandar.

En la sexta iteración se corrigió el bug visual de tema: la toolbar dejó de
usar tokens oscuros propios en modo claro y ahora se apoya en `--card`,
`--card-foreground`, `--muted-foreground`, `--accent`,
`--accent-foreground` y `--border`.

Menus de click derecho:

- sidebar: nueva nota, nueva carpeta y colapsar todo;
- nota: renombrar, duplicar, mover a otro proyecto y eliminar;
- editor: formatos inline y de bloque frecuentes.

Duplicar usa las APIs existentes: lee el Markdown, calcula un nombre libre,
actualiza el primer H1 cuando existe y crea una nota nueva sin sobrescribir.
Mover desde el menu contextual reutiliza el flujo seguro de drag and drop.

Componentes agregados: `EditorToolbar`, `ToolbarButton`,
`SidebarContextMenu`, `NoteContextMenu`, `EditorContextMenu` y el primitive
shadcn/Radix `ContextMenu`.

## Estado actual

- [x] Delete de notas.
- [x] Rename de notas.
- [x] Auto-renombrado por primer heading.
- [x] Move por selector y drag and drop.
- [x] Eventos SSE para todas las mutaciones.
- [x] Lectura Markdown.
- [x] Capturas YouTube con thumbnail y timestamp.
- [x] Extensión con tres modos.
- [x] Extensión con proyectos y notas existentes.
- [x] Toasters y estados vacíos.
- [x] Doce pruebas Rust.
- [x] Build frontend y validación de extensión.
- [x] Árbol único colapsable tipo Obsidian.
- [x] Autosave sin botón Guardar.
- [x] Scroll independiente en árbol, editor y lectura.
- [x] Ajustes fijo en la barra lateral.
- [x] Base shadcn/ui, Tailwind y Lucide.
- [x] Extensión alineada visualmente.
- [x] Toolbar Markdown compacta sobre el editor.
- [x] Menús contextuales para sidebar, notas y editor.
- [x] Duplicar y mover notas desde click derecho.
- [x] Modo enfoque.
- [x] Toolbar alineada a tema claro/oscuro.
- [x] Pizarras `.loqboard.json` con tldraw.
- [x] Tarjetas YouTube con embed y nota en pizarra.
- [x] Extensión capaz de enviar YouTube a pizarras.
- [x] Resize de tarjetas de pizarra.
- [x] Lock/unlock para bloquear movimiento, resize y edición de tarjetas.
- [x] Pin/unpin independiente para tarjetas fijas en pantalla.
- [x] Code cards con lenguaje, copiar y bloque monoespaciado.
- [x] Link cards con preview de metadata local.
- [x] Icono diferenciado para pizarras en sidebar.
- [x] Extensión capaz de enviar enlaces normales a notas y pizarras.
- [ ] Prueba manual completa en Chrome y Edge.
- [ ] Watcher para cambios hechos por otros procesos.
- [ ] Orden persistente de notas.

## Registro de cambios

### 2026-06-15 - Iteración 8

- Separado `locked` de `pinned` en tarjetas de pizarra.
- `locked` bloquea movimiento, resize y edición, pero mantiene la tarjeta en
  la capa normal del canvas.
- `pinned` mantiene una tarjeta fija en pantalla con coordenadas `pinnedX` y
  `pinnedY`.
- Optimizado drag/resize para actualizar el DOM con `requestAnimationFrame` y
  persistir una sola vez al soltar el puntero.
- Agregado `openExternalUrl` con validación `http`/`https`, intento de opener
  Tauri y fallback a `window.open`.
- La extensión envía capturas de pizarra con `locked: false` y `pinned: false`.

### 2026-06-15 - Iteración 7

- Añadido resize con handle discreto para tarjetas de board.
- Añadido pin/unpin con `Lock`/`Unlock` y persistencia en `.loqboard.json`.
- Añadidas tarjetas `code` con título, selector de lenguaje, copiar y preview
  en `pre/code`.
- Añadidas tarjetas `link` con imagen OG, favicon, dominio, descripción,
  selección y comentario.
- Añadido menú contextual básico de board para crear texto, código y enlaces.
- Cambiado icono de pizarras en sidebar a `PencilRuler`.
- Extendida la extensión para capturar metadata local de cualquier web.
- Enriquecido el bloque Markdown para capturas web normales.
- Añadido evento SSE `board:item-added`.

### 2026-06-15 - Iteración 6

- Corregida toolbar para usar tokens de tema en modo claro y oscuro.
- Añadido `tldraw` como motor de pizarra.
- Añadido formato local `.loqboard.json`.
- Añadidos endpoints HTTP y comandos Tauri para listar, crear, leer y guardar
  pizarras.
- Añadida vista de pizarra con autosave, tarjetas de texto y tarjetas YouTube.
- Añadido modo Pizarra en la extensión para enviar videos de YouTube.
- Añadidas pruebas Rust para storage y API HTTP de pizarras.

### 2026-06-15 - Iteración 5

- Agregada toolbar Markdown horizontal, oscura y compacta.
- Agregadas acciones sobre selección y líneas completas.
- Agregado historial explícito para undo/redo de escritura y formatos.
- Agregados atajos de teclado para formato e historial.
- Agregados menús contextuales de sidebar, nota y editor.
- Agregadas acciones de duplicar y mover desde el árbol.
- Agregado modo enfoque sin afectar autosave.
- Agregado `@radix-ui/react-context-menu`.

### 2026-06-15 - Iteración 4

- Sustituida la UI de tres columnas por sidebar de árbol y área principal.
- Añadido autosave debounceado y serialización de escrituras pendientes.
- Eliminado el botón de guardado manual.
- Corregido el scroll con shell de altura completa y áreas independientes.
- Añadidos ajustes fijos al pie y tema dentro del diálogo.
- Añadidos Tailwind 4, componentes shadcn locales, Radix, Lucide y Sonner.
- Sustituidos prompts y confirmaciones por diálogos.
- Mejorados tooltips, dropdowns, toasts y estados de selección/drop.
- Alineada visualmente la extensión con soporte de tema oscuro del sistema.
- Protegida la carrera SSE/HTTP durante auto-renombrado por autosave.

### 2026-06-15 - Iteración 3

- Añadidos delete, rename y move seguros.
- Añadido auto-renombrado desde `# Título`.
- Añadidas respuestas de warning no destructivas.
- Añadidos previews Markdown de YouTube y dominio para enlaces normales.
- Añadidos eventos SSE específicos y agregado.
- Añadidos modo edición y modo lectura.
- Añadido drag and drop con Dnd Kit.
- Añadidos toasts y acciones por nota.
- Rediseñada la extensión con tres modos y selectores dinámicos.
- Añadidas `react-markdown`, `remark-gfm`, `@dnd-kit/core` y `url`.
- Ampliada la suite a doce tests.

### 2026-06-15 - Iteración 2

- Unificada la API HTTP para web y Tauri.
- Añadidos CRUD HTTP, SSE, modo oscuro y sincronización automática.

### 2026-06-14 - Iteración 1

- Creado el MVP Tauri, almacenamiento Markdown, UI y extensión inicial.

## Limitaciones y próximos pasos

1. Delete no usa papelera.
2. No hay watcher de filesystem.
3. No existe orden persistente dentro de un proyecto.
4. El árbol representa proyectos y notas, pero no subcarpetas arbitrariamente
   profundas porque el almacenamiento actual tiene dos niveles.
5. CORS sigue abierto durante el MVP y no hay token local.
6. Añadir búsqueda global, tags, backlinks y preview lado a lado.
7. Añadir panel de capturas recientes, plantillas y soporte Firefox.
8. Probar bundles instalables.

## Instrucciones para futuros agentes

1. Mantener `Storage` como única capa de filesystem.
2. Rechazar conflictos de nombre sin sobrescribir.
3. Emitir evento específico y `notes:changed` tras cada escritura.
4. Mantener `src/api.ts` como contrato común web/Tauri.
5. Proteger cambios locales pendientes al reaccionar a SSE.
6. Actualizar este archivo después de cada iteración.
7. Ejecutar:

```powershell
npm.cmd run build
npm.cmd audit --audit-level=high
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
node --check extension/popup.js
```
