# Manifest de Loquera MVP

## Identidad

- **Nombre:** `loquera-mvp`
- **Propósito:** app desktop local-first para crear notas Markdown y recibir
  capturas desde una extensión de navegador.
- **Estado:** MVP funcional implementado y validado en Windows para desarrollo.

## Stack

- Tauri 2.
- Rust 2021.
- React 19 y TypeScript.
- Vite 8.
- Axum para el servidor HTTP local.
- Manifest V3 para la extensión.
- Archivos Markdown como único almacenamiento.

## Arquitectura

La aplicación tiene tres partes:

1. **UI desktop:** React invoca comandos Tauri mediante
   `@tauri-apps/api/core`.
2. **Backend nativo:** Rust administra toda lectura y escritura en disco.
3. **Extensión:** obtiene datos de la pestaña activa y envía JSON al servidor
   local. Nunca accede al filesystem.

`Storage` es la única capa que construye rutas y escribe archivos. Los comandos
Tauri y el servidor Axum comparten una instancia clonable de esta capa. El
servidor escucha únicamente en `127.0.0.1:3210`.

## Estructura

```text
loquera-mvp/
  manifest.md
  README.md
  package.json
  index.html
  src/
    main.tsx
    App.tsx
    api.ts
    styles.css
  src-tauri/
    Cargo.toml
    tauri.conf.json
    capabilities/default.json
    src/
      main.rs
      lib.rs
      storage.rs
      local_server.rs
  extension/
    manifest.json
    popup.html
    popup.js
    content.js
```

## Almacenamiento

La raíz se obtiene con `dirs::document_dir()` y se añade `Loquera`. Si la ruta
de documentos no está disponible, se usa `~/Documents/Loquera`.

Formato:

```text
<raíz>/Loquera/<proyecto>/<nota>.md
```

Los nombres se normalizan antes de construir cualquier ruta:

- Solo se conservan caracteres alfanuméricos, espacios, guiones y guiones bajos.
- Otros caracteres se reemplazan por `-`.
- Se elimina una extensión `.md` recibida en nombres de nota.
- Nombres vacíos, `.` y `..` se rechazan.
- Ningún path proporcionado por frontend o extensión se concatena sin pasar por
  sanitización.

## Comandos Tauri

| Comando | Entrada | Salida |
| --- | --- | --- |
| `list_projects` | Ninguna | `string[]` |
| `create_project` | `name` | Nombre sanitizado |
| `list_notes` | `project` | `string[]` sin extensión |
| `read_note` | `project`, `note` | Contenido Markdown |
| `create_note` | `project`, `title`, `content` | Nombre sanitizado |
| `save_note` | `project`, `note`, `content` | Sin contenido |
| `get_notes_root` | Ninguna | Ruta absoluta |

## Servidor local

Base URL: `http://localhost:3210`

### `GET /api/health`

Respuesta:

```json
{ "ok": true }
```

### `POST /api/capture`

Body:

```json
{
  "project": "Inbox",
  "note": "Capturas",
  "title": "Título de la página",
  "url": "https://example.com",
  "selectedText": "Texto opcional",
  "comment": "Comentario opcional",
  "youtubeTimestamp": 123
}
```

El endpoint crea proyecto y nota si no existen, y añade al final un bloque:

```markdown
## Captura - AAAA-MM-DD HH:MM

**Título:** Título de la página
**URL:** https://example.com
**YouTube timestamp:** 02:03

### Texto seleccionado

> Texto opcional

### Comentario

Comentario opcional

---
```

La fecha usa la zona horaria local del equipo. Los campos opcionales vacíos no
se escriben.

## Decisiones técnicas

- **Axum embebido:** evita procesos auxiliares y mantiene el servidor dentro del
  ciclo de vida de Tauri.
- **Sin plugins de filesystem:** el frontend no necesita permisos de disco.
- **Servidor en loopback:** no queda expuesto a la red local.
- **CORS abierto en MVP:** permite orígenes `chrome-extension://` y
  `extension://` sin conocer el ID antes de instalar. Debe endurecerse después.
- **Puerto fijo:** simplifica la extensión inicial.
- **Bundle desactivado:** el objetivo actual es desarrollo end-to-end, sin
  introducir iconos ni configuración de instaladores.
- **Creación no destructiva:** `create_note` falla si ya existe; `save_note`
  actualiza o crea explícitamente.

## Estado actual

- [x] Scaffold Tauri 2 + React + TypeScript + Vite.
- [x] Capa de almacenamiento Markdown en Rust.
- [x] Sanitización y mitigación de path traversal.
- [x] Siete comandos Tauri requeridos.
- [x] Servidor HTTP local con health y capture.
- [x] UI para listar, crear, leer y guardar.
- [x] Extensión MV3 con selección, comentario y timestamp de YouTube.
- [x] README operativo.
- [x] Pruebas unitarias básicas de storage.
- [x] Build de frontend y `cargo check`.
- [x] Prueba HTTP de health/capture y verificación real de `/api/health`.
- [ ] Prueba manual completa de la extensión en Chrome y Edge.
- [ ] Prueba de empaquetado para distribución.

## Pendientes

1. Añadir autenticación local o token efímero para `/api/capture`.
2. Restringir CORS a los IDs de extensión instalados.
3. Gestionar el error de puerto ocupado desde la UI.
4. Añadir autosave y guardas frente a cambios sin guardar.
5. Añadir borrar, renombrar, buscar y previsualizar Markdown.
6. Hacer configurable la carpeta de notas.
7. Activar y probar el empaquetado para distribución.

## Registro de cambios

### 2026-06-14

- Creado el scaffold inicial.
- Implementada la persistencia en archivos `.md`.
- Añadidos comandos Tauri y servidor HTTP local.
- Añadida UI desktop mínima.
- Añadida extensión Manifest V3.
- Añadidas pruebas unitarias y documentación inicial.
- Actualizado a Vite 8 tras auditoría; `npm audit` reporta 0 vulnerabilidades.
- Verificados `npm run build`, `cargo check`, tests Rust y health con Tauri activo.

## Instrucciones para futuros agentes

1. Leer este archivo y `README.md` antes de modificar arquitectura.
2. Mantener toda escritura al filesystem dentro de `src-tauri/src/storage.rs`.
3. Reutilizar `Storage` para cualquier nuevo canal de entrada.
4. No aceptar paths completos desde clientes.
5. Actualizar la tabla de comandos o endpoints cuando cambien sus contratos.
6. Añadir una entrada al registro de cambios con fecha concreta.
7. Ejecutar como mínimo:

```powershell
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

8. Para comprobar `/api/health`, ejecutar la app con `npm.cmd run tauri dev` y
   consultar `http://localhost:3210/api/health`.
