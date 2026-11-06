# The Daily Edit

*A little space for everything that matters.*

Aplicación personal de tareas, proyectos y planificación diaria, diseñada primero para iPad. Funciona sin conexión, se instala en la pantalla de inicio desde Safari y guarda todo **solo en tu dispositivo** (IndexedDB). No usa cuentas, servidores, analítica ni publicidad.

---

## Qué incluye

| Área | Funciones |
|---|---|
| **Dashboard** | Saludo según la hora, fecha en español, progreso del día, pendientes de hoy, captura en línea, próximos vencimientos, proyectos activos, acceso a la revisión semanal |
| **Tareas** | Crear (solo con título), editar, completar, reabrir, eliminar con *deshacer*, duplicar, posponer (mañana / +1 día / próxima semana), reordenar arrastrando o con Alt+↑/↓, prioridad (4 niveles, con barras + texto, no solo color), categoría, proyecto, etiquetas, subtareas, descripción, notas, fecha, hora, “Atender hoy”, recurrencia |
| **Secciones** | Inbox, Hoy (vencidas separadas), Próximamente (Mañana / Esta semana / Próxima semana / Más adelante), Proyectos, Calendario (mes y semana), Completadas (búsqueda, filtros, reabrir), Revisión semanal, Búsqueda global |
| **Proyectos** | Nombre, descripción, color, fecha objetivo, estado (activo, en pausa, completado, archivado), avance %, vista propia. Al eliminar: mover tareas al Inbox o eliminarlas (con confirmación y deshacer) |
| **Categorías** | 6 iniciales editables; crear, renombrar, cambiar color, reordenar, eliminar **reasignando** sus tareas (nunca se borran) |
| **Orden y filtros** | Manual, fecha, prioridad, recientes, título; filtros por prioridad, categoría, etiqueta y proyecto |
| **Respaldos** | Exportar JSON (`the-daily-edit-backup-AAAA-MM-DD.json`), importar con validación, vista previa, fusión o reemplazo, transacción atómica y copia automática del estado previo |
| **PWA** | Manifest, service worker, íconos propios (192, 512, maskable, Apple Touch), modo standalone, aviso de nueva versión, aviso sin conexión |
| **Accesibilidad** | Navegación por teclado, foco visible, etiquetas para VoiceOver, objetivos táctiles ≥ 44 px, contraste AA, `prefers-reduced-motion` |

### Atajos con teclado externo

`N` nueva tarea · `/` o `⌘K` buscar · `⌘S` o `⌘Enter` guardar y cerrar la tarea · `Esc` cerrar · `Alt+↑/↓` mover tarea o subtarea · `G` y luego `H`/`I`/`P`/`C`/`U`/`D`/`A` para ir a Hoy, Inbox, Proyectos, Calendario, Próximamente, Dashboard o Análisis.

---

## Novedades de la versión 2.0

| Área | Qué hay |
|---|---|
| **Apariencia** (Configuración) | 3 tipografías locales (*Playful Minimalism*: Outfit + Plus Jakarta Sans, predeterminada; *Editorial*: Instrument Serif + Instrument Sans; *Clean*: Inter), 4 paletas claras (Olive & Blush, Rose & Cream, Sage & Linen, Blue & Ivory), esquinas suaves o más redondeadas. Vista previa inmediata, **Guardar**, **Cancelar** y **Restablecer diseño original**. Se aplica antes de pintar la app (sin destellos) y viaja en los respaldos. |
| **Panel de detalle** | Botón para **expandir** a una vista amplia de dos columnas y volver al panel lateral. Secciones plegables: Planificación, Subtareas, Campos personalizados, Documentos, Seguimiento y cierre, Repetición, Notas, Historial. |
| **Subtareas** | Crear, editar, completar, reabrir, eliminar, **reordenar** (arrastrando o Alt+↑/↓) y barra de progreso. Una actividad con subtareas pendientes **no puede completarse**; la última subtarea no la cierra sola; añadir o reabrir una subtarea en una actividad completada pide confirmar su reapertura. |
| **Datos de la actividad** | Fecha de inicio, responsable, folio/referencia y estado **Cancelada** (separado de Completada). |
| **Registro de cierre** | Al completar aparece un panel breve y opcional: resultado de atención, tipo de atención, fecha efectiva, responsable, folio, observaciones y evidencia documental, con tiempo transcurrido y cumplimiento de plazo calculados. Se puede omitir y editar después. Las opciones de resultado y tipo de atención se personalizan en Configuración. |
| **Campos personalizados** | Texto corto/largo, número, fecha, selección única/múltiple, casilla e importe. Ámbito: todas las actividades, una categoría o un proyecto. Se renombran sin perder valores, se archivan sin perder datos y avisan antes de un cambio de tipo que borraría información. |
| **Documentos adjuntos** | PDF, Word (.docx), Excel (.xlsx), TXT e imágenes (máx. 25 MB c/u), guardados en IndexedDB. Nombre, tipo, tamaño, fecha, abrir, compartir/guardar en Archivos, eliminar con deshacer y descripción editable con **extracto automático** (ver abajo). |
| **Hoy** | Agrupado **por categoría** (predeterminado), por proyecto, por prioridad o sin agrupar. Grupos plegables y orden manual dentro de cada grupo. |
| **Análisis** (nueva sección) | 12 indicadores, filtros (periodo, categoría, proyecto, estado, prioridad, responsable, resultado, campos personalizados), gráficas con los colores del tema, personalización (mostrar/ocultar, reordenar) y **tabla de registros** con búsqueda, orden y selección de columnas. |
| **Excel** | **Exportar a Excel** genera un `.xlsx` real con 3 hojas: Actividades (una fila por actividad principal), Subtareas (vinculadas por ID) y Resumen (indicadores, filtros, fórmulas). Registros filtrados o todos. |
| **Historial** | Creación, cambios de estado, responsable y vencimiento, finalización, reapertura, cancelación y ediciones del cierre, con valores anteriores y nuevos. |
| **Respaldos** | JSON v2 (todo menos el contenido de los documentos) y **Respaldo completo (.zip)** con manifiesto `backup.json` + carpeta `files/`. La importación acepta ambos y respaldos v1. |

### Regla de contabilización

**La actividad principal es la unidad de análisis.** Una actividad con 5 subtareas concluidas cuenta como *1 actividad completada* y *5 subtareas ejecutadas*, nunca como 6 actividades. Las canceladas no cuentan como concluidas.

### Fórmulas y fechas de los indicadores

- **Fecha de conclusión** = fecha efectiva de atención del registro de cierre si existe; si no, la fecha en que se marcó completada.
- **Creadas** usa la fecha de creación; **completadas**, distribuciones y tiempos usan la fecha de conclusión; **pendientes** y **vencidas** son el estado de hoy (no dependen del periodo); la **tabla de registros** y el **promedio de subtareas** usan la *fecha de referencia* que elijas (creación, conclusión o vencimiento).
- **Cumplimiento de plazos (%)** = concluidas con fecha de conclusión ≤ vencimiento ÷ concluidas con vencimiento y conclusión válidos × 100.
- **Tiempo promedio de atención** = Σ días calendario de creación a conclusión ÷ nº de concluidas con fechas válidas (no son horas trabajadas; también se muestra desde la fecha de inicio cuando existe).
- **Promedio de subtareas** = nº de subtareas del conjunto ÷ nº de actividades principales del conjunto.
- Si un denominador es 0 se muestra **“Sin datos suficientes”**; nunca se inventan valores.

### Descripción automática de documentos (privacidad)

El texto se extrae **en el propio iPad** (TXT, Word, Excel y PDF con texto; el lector de PDF se descarga con la app y funciona sin conexión). La descripción es un **extracto** del documento —título y primeras frases, recortado a unas 20–50 palabras— y se etiqueta como “Extracto automático”: **no es un resumen redactado por IA**. Puedes editarla o regenerarla. Las imágenes y los PDF escaneados requieren OCR, que no está incluido: la app lo indica y puedes escribir la descripción a mano. Nada se envía a ningún servicio.

**Opciones para resúmenes inteligentes (no implementadas; requieren tu decisión):**

| Opción | Calidad | Privacidad | Costo | Limitaciones |
|---|---|---|---|---|
| Modelo de IA local en el navegador (WebGPU/WASM) | Media | Total (todo en el iPad) | Gratis | Descarga de 0.5–2 GB, lento y con poca memoria en iPad; compatibilidad de WebGPU en Safari aún irregular |
| API externa (p. ej. Claude API) | Alta | Los documentos salen del dispositivo hacia el proveedor | De pago por uso | Requiere conexión, clave de API y un servidor intermedio para no exponer la clave en la app |
| OCR local (Tesseract.js) para imágenes/escaneos | Extrae texto, no resume | Total | Gratis | ~10–20 MB adicionales y varios segundos por página en iPad |

---

## Usarla en tu iPad (resumen)

1. Publica la app en un hosting HTTPS (abajo: GitHub Pages, gratis).
2. Abre la URL en **Safari** del iPad.
3. Toca **Compartir** → **Añadir a pantalla de inicio** → **Añadir**.
4. Ábrela desde el ícono: se abre a pantalla completa, sin barra de Safari.
5. Úsala una vez con conexión; desde ese momento funciona sin internet.

---

## 1. Desarrollo

Requiere Node.js 20 o superior en una computadora (o en un entorno en la nube como Claude Code).

```bash
npm install
```

```bash
npm run dev
```

Abre la URL que muestra la terminal. En desarrollo el service worker está desactivado (para que siempre veas los cambios).

Pruebas unitarias (lógica de datos, recurrencias, respaldos):

```bash
npm test
```

## 2. Versión de producción

```bash
npm run build
```

```bash
npx vite preview --port 4173
```

`npm run build` revisa los tipos, genera `dist/` con el service worker y el manifest. Para la prueba de extremo a extremo (requiere Playwright con Chromium y la vista previa en marcha):

```bash
npm run test:e2e
```

## 3. Publicar en GitHub Pages (recomendado, gratis)

El repositorio ya incluye el flujo `.github/workflows/deploy.yml`.

1. En GitHub, abre el repositorio → **Settings** → **Pages**.
2. En *Build and deployment → Source* elige **GitHub Actions**.
3. Fusiona los cambios en la rama `main` (por ejemplo, aceptando el pull request). El flujo instala, ejecuta las pruebas, compila y publica.
4. La app quedará en `https://<tu-usuario>.github.io/<nombre-del-repositorio>/` (la URL exacta aparece en la pestaña **Actions** y en **Settings → Pages**).

Todo esto se puede hacer desde Safari en el iPad, en github.com.

**Alternativa: Cloudflare Pages.** Conecta el repositorio, comando de compilación `npm run build`, carpeta de salida `dist`. La app usa rutas relativas y navegación con `#`, así que funciona en la raíz o en una subcarpeta sin configuración extra.

> Importante: los datos se guardan por **origen** (dominio). Si cambias de URL, la nueva dirección empezará vacía: exporta un respaldo en la URL anterior e impórtalo en la nueva.

## 4–5. Abrir en Safari y añadir a la pantalla de inicio

1. Abre la URL publicada en **Safari** (no en Chrome ni dentro de otra app: solo Safari permite instalarla en iPadOS).
2. Toca el botón **Compartir** (cuadro con flecha hacia arriba, en la barra superior).
3. Elige **Añadir a pantalla de inicio**. Si no lo ves, desliza la lista o toca *Editar acciones*.
4. Deja el nombre **Daily Edit** y toca **Añadir**.
5. Abre la app desde el nuevo ícono. Se abrirá en modo *standalone* (sin barra de direcciones).

La sección **Configuración → Instalar en tu iPad** repite estas instrucciones dentro de la app.

## 6. Confirmar que funciona sin conexión

1. Abre la app instalada con conexión y navega un poco (esto termina de guardar la app en caché).
2. Cierra la app por completo (desliza hacia arriba en el selector de apps).
3. Activa el **Modo avión**.
4. Abre la app desde el ícono: debe cargar, mostrar el aviso “Sin conexión” y dejarte crear, editar, completar y eliminar tareas.
5. Desactiva el Modo avión: todo lo que hiciste sigue ahí (nunca se envió a ningún servidor).

## 7. Actualizar la app

1. Haz cambios en el código y súbelos a `main` (o fusiona un pull request). GitHub Pages publica la nueva versión.
2. Al abrir la app con conexión, verás el aviso **“Hay una nueva versión”**. Toca **Actualizar** cuando quieras.
3. La actualización **no** se aplica sola: así nunca se interrumpe una edición. Los datos están en IndexedDB, separados de la caché de la app, por lo que actualizar no los toca.
4. Si cambias el esquema de datos, añade una nueva versión en `src/db/db.ts` (Dexie aplica las migraciones en orden y de forma transaccional) y súbele la versión a `package.json`.

> **Al pasar de la 1.0 a la 2.0**: antes de tocar **Actualizar**, exporta un respaldo desde la versión 1.0. La migración solo añade tablas y campos (no borra nada) y guarda una copia interna de tus tareas y proyectos previos (`preMigration-v2`), pero un respaldo propio es la protección más segura.

## 8. Respaldar y recuperar tus datos

**Exportar:** Configuración → **Exportar mis datos** (JSON, sin el contenido de los documentos) o **Respaldo completo (.zip)** (incluye los documentos). En iPad se abre la hoja de compartir: elige **Guardar en Archivos** (por ejemplo, en iCloud Drive). La app confirma que generó el archivo, pero no puede verificar dónde lo guardaste.

**Importar:** Configuración → **Importar respaldo** → elige el `.json` o `.zip` → revisa la vista previa → elige:

- **Fusionar**: añade lo nuevo y conserva lo tuyo. Si una tarea, proyecto, categoría o campo personalizado existe en ambos lados (mismo id), se queda la versión con la fecha de modificación más reciente. Las etiquetas con el mismo nombre se unifican. Los documentos se añaden sin sobrescribir los locales. Se conserva tu configuración actual (incluida la apariencia).
- **Reemplazar**: sustituye todo por el contenido del archivo. Requiere marcar una confirmación explícita y te ofrece exportar antes.

La importación ocurre en una sola transacción: si algo falla, no cambia nada. Además se guarda una copia del estado anterior y puedes volver a él desde **Configuración → Respaldos → Restaurar ese estado**.

### Sobre la conservación de los datos

Los datos viven únicamente en el almacenamiento del navegador para esta URL, **sin cifrado propio de la app**. La app solicita almacenamiento persistente, pero el navegador puede no concederlo. iPadOS puede borrar datos de sitios web en algunos casos (poco espacio, borrar el historial/datos de Safari, desinstalar el ícono, largos periodos sin uso). Instalarla en la pantalla de inicio reduce el riesgo, pero no lo elimina: **exporta respaldos con regularidad**.

---

## Si usas Claude Code desde el iPad

Claude Code en la web o en la app se ejecuta en un **entorno en la nube**, no en tu iPad. Desde ahí sí se puede: instalar dependencias, compilar, ejecutar pruebas (unitarias y de navegador), hacer commits y subirlos a GitHub. Lo que **no** puede hacerse ahí, y debes hacer tú:

- Activar GitHub Pages (Settings → Pages → Source: GitHub Actions) y fusionar el pull request a `main` (desde github.com en Safari).
- Abrir la URL publicada en Safari, instalarla y comprobar el modo sin conexión en tu iPad real.

No necesitas instalar nada en el iPad: ni Node ni terminal.

---

## Arquitectura

React 19 + TypeScript + Vite, IndexedDB con Dexie, íconos Lucide, `vite-plugin-pwa` (Workbox). Sin CDNs: las fuentes Inter y DM Serif Display se incluyen en el paquete y se guardan en la caché offline.

```
src/
  domain/         Lógica pura y tipada (sin interfaz)
    types.ts        Modelos: Task, Project, Category, Tag, Settings…
    dates.ts        Fechas locales 'AAAA-MM-DD' y formato es-MX
    recurrence.ts   Cálculo de la siguiente ocurrencia (reglas documentadas)
    selectors.ts    Hoy, Inbox, Próximamente, agrupación, búsqueda, orden, filtros
    analytics.ts    Indicadores y fórmulas (unidad de análisis: actividad principal)
    records.ts      Columnas de la tabla de registros y del Excel
    validate.ts     Validación/normalización (escrituras e importaciones)
  db/             Persistencia
    db.ts           Esquema Dexie y migraciones
    repo.ts         Todas las escrituras (transaccionales)
    backup.ts       Exportar (JSON y ZIP) / validar / importar / restaurar
  export/         Escritor XLSX real (sobre fflate) y libro de 3 hojas
  docs/           Extracción local de texto y descripción por extracto
  theme.ts        Sistema de temas (paletas, tipografías, esquinas)
  state/          Contextos: datos en vivo (liveQuery), navegación, avisos
  hooks/          Acciones de tareas con deshacer, listas, atajos
  components/     Navegación, filas, detalle, captura rápida, modales…
  pages/          Dashboard, Listas, Proyectos, Calendario, Completadas, Revisión, Configuración
  pwa/            Registro del service worker y avisos
  styles/         tokens.css (paleta y escala), base, layout, componentes, páginas
public/icons/     Íconos PNG generados desde SVG (npm run icons)
tests/            Pruebas unitarias (Vitest + fake-indexeddb)
scripts/          Generador de íconos y prueba de extremo a extremo
```

**Decisiones clave**

- **Navegación con `#`**: funciona en cualquier hosting estático y sin conexión, sin reglas de redirección.
- **Caché de la app ≠ datos personales**: el service worker solo precachea archivos de la app; las tareas viven en IndexedDB.
- **Actualización con aviso** (`registerType: 'prompt'`): nunca se recarga la app sin tu permiso.
- **Recurrencias por calendario**: al completar una ocurrencia se crea la siguiente fecha posterior a su vencimiento (saltando fechas pasadas para no acumular vencidas). La completada queda en el historial. La creación es transaccional y verifica `[seriesId+dueDate]`, así que reiniciar o completar dos veces no duplica. Reabrir una ocurrencia retira la siguiente si aún no la habías tocado. Los meses conservan el día de anclaje (31 → último día del mes).
- **Rendimiento**: cada tabla se observa por separado; las filas se memorizan por `id + updatedAt`, así que cambiar una tarea no vuelve a dibujar las demás.
- **Migración**: si existían tareas de la versión anterior (lista en `localStorage`), se importan una sola vez al Inbox sin borrar el original.

### Formato del respaldo (v1)

```json
{
  "format": "the-daily-edit-backup",
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "schemaVersion": 1,
  "exportedAt": "2026-11-02T18:00:00.000Z",
  "data": { "tasks": [], "projects": [], "categories": [], "tags": [], "settings": {}, "activity": [] }
}
```

---

## Pruebas

**Automatizadas (ejecutadas en el entorno de desarrollo):**

- 41 pruebas unitarias. Nuevas en 2.0: migración v1→v2 sin pérdida, bloqueo de cierre con subtareas pendientes, reapertura confirmada, registro de cierre (la fecha efectiva histórica no se sobrescribe), cancelación, historial con valores previos, conversiones de tipo de campos, documentos (alta, tipos no admitidos, deshacer, eliminación en cascada), respaldo ZIP ida y vuelta, respaldos v1, fórmulas de indicadores (subtareas no cuentan como actividades, sin divisiones entre cero, fecha efectiva), Excel válido de 3 hojas con protección contra fórmulas, extracción de .docx y descripción por extracto. Desde 1.0: recurrencias (diaria, semanal con días, cada N semanas, día 31, 29 de febrero, sin acumular vencidas, fecha fin), CRUD, deshacer, reordenar, eliminar categoría/proyecto sin perder tareas, exportar/importar (reemplazo, fusión, unificación de etiquetas, archivos inválidos, referencias rotas), restaurar estado previo, migración de `localStorage`, selectores.
- Prueba de extremo a extremo en Chromium (Playwright) sobre la versión de producción: 81 comprobaciones. Nuevas en 2.0: vista previa/cancelar/guardar/restablecer apariencia y su aplicación antes de cargar la app, campos personalizados, panel expandido, subtareas y reglas de cierre, registro de cierre, historial, extracto automático de un documento, Hoy agrupado y plegable, indicadores y filtros de Análisis, Excel real (3 hojas, campos personalizados, subtareas sin duplicar), respaldo ZIP con documentos (exportar e importar) y Análisis sin conexión. Desde 1.0: service worker, manifest, crear/editar/completar/deshacer/eliminar, persistencia tras recargar, recurrencia sin duplicados, proyectos y avance, búsqueda, exportar e importar, archivo inválido, texto con HTML mostrado como texto, **modo sin conexión** (abrir, crear y persistir), atajos de teclado y ausencia de desplazamiento horizontal en 1180×820, 820×1180 y 390×844.

**Requieren comprobación manual en un iPad físico** (no tengo acceso a uno; Chromium no es Safari):

- Instalación desde Safari y apertura en modo standalone; ícono en la pantalla de inicio.
- Funcionamiento con Modo avión tras la instalación.
- Hoja de compartir → Guardar en Archivos al exportar (JSON, ZIP y Excel); selector de Archivos al importar y al adjuntar documentos.
- Abrir documentos adjuntos desde la app instalada (Safari puede abrirlos en una vista propia o pasar a la hoja de compartir).
- Lectura de PDF reales con pdf.js en Safari de iPadOS y rendimiento con documentos grandes.
- Selectores nativos de fecha/hora, arrastrar para reordenar con el dedo y con Apple Pencil, teclado externo, áreas seguras, VoiceOver.

## Limitaciones conocidas

- Sin sincronización entre dispositivos (por diseño: todo es local). Para pasar datos a otro equipo, usa exportar/importar.
- Sin recordatorios ni notificaciones push.
- Los datos dependen de la política de almacenamiento de Safari/iPadOS (ver arriba).
- Reordenar manualmente está disponible en Inbox, Hoy y proyectos con “Orden manual”; Próximamente se ordena siempre por fecha.
- La descripción automática es un extracto, no un resumen de IA; las imágenes y los PDF escaneados no se describen (sin OCR).
- Límite de 25 MB por documento; el espacio total depende de lo que Safari conceda a la app.
- La vista expandida del panel no se recuerda entre sesiones (siempre abre en modo lateral).
- Las recurrencias personalizadas cubren “cada N días/semanas/meses/años”, días concretos de la semana y fecha de fin; no reglas tipo “el segundo martes de cada mes”.
- `npm audit` señala avisos moderados en dependencias de compilación de Workbox (`ejs`/`jake`); no forman parte de la app que se publica.
