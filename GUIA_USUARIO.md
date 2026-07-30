# Guía de usuario — Aztec · Operaciones

Esta guía explica, en lenguaje sencillo, cómo usar el dashboard y qué significa cada
elemento de cada pantalla. No necesitas conocimientos técnicos.

> 💡 **En una frase:** el dashboard no solo muestra tus proyectos, te dice **qué
> atender primero, quién debe hacerlo y por qué**.

---

## Conceptos clave (léelos una vez)

Antes de recorrer las pantallas, estos términos aparecen en todo el sistema:

- **Salud del proyecto:** su estado general.
  - 🔴 **Bloqueado:** está detenido, no puede avanzar.
  - 🟡 **En riesgo:** avanza, pero con problemas.
  - 🟢 **Sano:** va bien.
- **Score (0 a 100):** qué tan urgente es atender un proyecto. **Mientras más alto,
  más prioritario.** Combina cuánto dinero está en juego, qué tan bloqueado está y qué
  tan cerca (o pasada) está su fecha límite.
- **Tipo de bloqueo:**
  - 🔵 **Externo:** el proyecto espera a un tercero (el cliente, un acceso, una
    credencial). **No se resuelve programando** → alguien debe *escalar* (llamar,
    pedir, gestionar).
  - 🟣 **Interno:** es un problema técnico que **el equipo puede resolver** → *desarrollar*.
- **Cuello de botella:** la persona más recargada de trabajo. Aunque todo lo demás
  esté bien, la operación no avanza más rápido que ella.
- **Siguiente paso:** la acción concreta que sigue en un proyecto.

---

# 1. Pantalla RESUMEN

**Para qué sirve:** es tu punto de partida cada mañana. Responde *"¿qué hago hoy?"*.

> 📷 **[Insertar screenshot: pantalla Resumen completa]**

## Sección: Panorama del Portafolio (arriba)
Una frase que resume el estado general (ej. *"59% de los proyectos están
bloqueados"*) y una tarjeta roja **"Valor Atrapado"** con el dinero total detenido en
proyectos bloqueados.
- **Qué hacer:** te da la magnitud del problema de un vistazo.

## Sección: Necesita atención hoy
La lista de los **3 proyectos más prioritarios** según el sistema. Cada uno muestra:
- Su **número de orden**, código y cliente.
- El **responsable**.
- El **siguiente paso sugerido** (ej. *"Escalar dependencia externa"*).
- Una **etiqueta** azul (Escalar) o morada (Desarrollar).
- Su **Score**.

> 📷 **[Insertar screenshot: sección "Necesita atención hoy"]**

- **Qué hacer:** empieza tu día por el #1. **Haz clic en cualquiera** para ver o
  editar sus detalles.

## Sección: La jugada operativa (las 3 fichas)
Resume la estrategia del día en tres números:

- **A escalar** (ficha azul): cuántos proyectos están bloqueados **por un tercero**.
  Estos **no los resuelve el equipo técnico** — hay que gestionarlos con el cliente o
  con quien tenga el acceso pendiente.
- **A desarrollar** (ficha morada): cuántos proyectos están bloqueados por algo
  **técnico que el equipo sí puede resolver**.
- **Cuello de botella** (ficha roja): la **persona más recargada** y qué porcentaje de
  toda la carga tiene. Haz clic para ir a la pantalla de Equipo. La sugerencia es
  **reasignar** parte de su trabajo.

> 📷 **[Insertar screenshot: las 3 fichas "A escalar / A desarrollar / Cuello de botella"]**

- **Qué hacer:** esta es la decisión grande del día — separar lo que se gestiona
  (escalar) de lo que se construye (desarrollar), y descargar a la persona saturada.

## Sección: Calidad de Datos
Muestra **proyectos con información incompleta o sospechosa**, que hay que limpiar:

- **Sin siguiente paso:** proyectos donde nadie definió qué sigue.
- **Sin fecha límite:** no tienen fecha de entrega → cronograma indefinido.
- **Sin valor de negocio:** no se sabe cuánto valen → no se pueden priorizar por dinero.
- **Proyectos zombie:** figuran como "sanos" pero **no tienen tareas abiertas** y su
  fecha ya pasó → probablemente están terminados sin cerrar, o abandonados.

> 📷 **[Insertar screenshot: sección "Calidad de Datos"]**

- **Qué hacer:** **haz clic en cualquier número** y el sistema te lista exactamente
  cuáles proyectos tienen ese problema, para corregirlos.

## Sección: Accesos rápidos (abajo)
Dos botones grandes para saltar a **Ver Priorización** o **Gestionar Portafolio**.

---

# 2. Pantalla PRIORIZACIÓN

**Para qué sirve:** el detalle completo de *en qué orden* atender todo y *por qué*.

> 📷 **[Insertar screenshot: pantalla Priorización completa]**

## Sección: Briefing Operativo
Un **resumen automático** de qué atender hoy, en lenguaje natural.
- Presiona **"Generar briefing"** para crearlo.
- Muestra: un **titular**, **métricas clave**, el **foco de hoy** (top 3), las **dos
  colas** (escalar / desarrollar), el **cuello de botella** y una **recomendación**.
- Puedes **Minimizar** para ocultarlo y **Mostrar** para volver a verlo, o
  **Regenerar** para actualizarlo.
- Una etiqueta indica la **fuente**: *"IA (Gemini)"* si hay inteligencia artificial
  conectada, o *"Fallback determinista"* si el resumen lo arma el sistema sin IA.

> 📷 **[Insertar screenshot: Briefing Operativo generado]**

- **Qué hacer:** léelo como tu "parte diario". Ideal para compartir en una reunión.

## Sección: Punto Crítico de Control (banner verde)
Destaca **el proyecto #1** que requiere intervención inmediata, con sus datos
separados: **Prioridad, Score, tipo de Bloqueo, Carga del dueño** y el **Próximo paso**.
- **Qué hacer:** haz clic para editarlo. Si la carga del dueño dice **SATURADO** (en
  rojo), considera reasignar.

> 📷 **[Insertar screenshot: banner "Punto Crítico de Control"]**

## Sección: Indicadores (3 tarjetas)
- **Proyectos Críticos:** cuántos están bloqueados o vencidos.
- **Tareas vencidas:** total de tareas pasadas de fecha.
- **Proyectos sin fecha:** cuántos no tienen fecha límite.

## Sección: Ranking de Riesgo · Qué atender primero
La **lista ordenada** de proyectos, del más al menos prioritario. Cada fila muestra el
código, cliente, responsable, si está vencido, el tipo de bloqueo (Escalar/Desarrollar),
la carga del dueño, el siguiente paso y el **Score**.
- **Qué hacer:** es tu lista de trabajo priorizada. Haz clic en cualquiera para editarlo.

> 📷 **[Insertar screenshot: "Ranking de Riesgo"]**

## Sección: Acciones Críticas sin Iniciar
Una tabla con las **tareas más urgentes que aún no han empezado** (prioridad crítica,
por hacer), con su fecha límite y responsable.
- **Qué hacer:** son focos rojos concretos que necesitan arrancar ya.

---

# 3. Pantalla EQUIPO

**Para qué sirve:** ver **cómo está repartida la carga** entre las personas y detectar
quién está saturado.

> 📷 **[Insertar screenshot: pantalla Equipo completa]**

Cada persona tiene una **tarjeta** con:

- **Nombre y rol.**
- **Portafolio:** cuántos proyectos tiene a cargo.
- **Tareas Abiertas:** cuántas tareas activas tiene.
- **Salud del Backlog:** cuántas de sus tareas están **bloqueadas** (si son muchas, se
  marca en rojo).
- Un texto que indica **cuántas de sus tareas son de prioridad Alta o Crítica**.
- **Etiquetas** con cuántos **Proyectos / Diagnósticos / Mantenimientos** lleva.

La persona identificada como **cuello de botella** aparece resaltada con una etiqueta
roja **"Cuello de Botella"**.

> 📷 **[Insertar screenshot: tarjeta de la persona marcada como "Cuello de Botella"]**

- **Qué hacer:** si alguien está muy cargado (muchas tareas abiertas y bloqueadas) y
  otra persona tiene holgura, es señal de **reasignar** trabajo entre ellas.

---

# 4. Pantalla PORTAFOLIO

**Para qué sirve:** **ver, buscar, crear y editar** todos los proyectos.

> 📷 **[Insertar screenshot: pantalla Portafolio completa]**

## Barra superior
- **Contador y valor filtrado:** cuántos proyectos ves y su valor total en dólares.
- **Buscador:** escribe un cliente o un código (ej. "PRJ-04") para filtrar.
- **Nuevo Proyecto:** abre el formulario para crear uno.
- **Restablecer:** devuelve los datos a su estado original. Útil si hiciste cambios de
  prueba y quieres empezar de cero.

## Filtros
Puedes filtrar la tabla por **Salud** (Bloqueado / En riesgo / Sano), **Responsable** o
**Cliente**.

> 📷 **[Insertar screenshot: filtros del Portafolio]**

## La tabla de proyectos
Cada fila es un proyecto: **Código, Cliente, Engagement (tipo), Tipo API, Salud, Valor,
Responsable y Bloqueos**.
- **Qué hacer:** **haz clic en cualquier fila** para ver y editar ese proyecto.

## El formulario de proyecto (crear / editar)
Al abrir un proyecto (o crear uno nuevo) verás un panel lateral con estos campos:

- **Código, Cliente, Nombre.**
- **Tipo de Engagement:** Proyecto / Mantenimiento / Diagnóstico.
- **Tipo de API:** Automatización / Consultoría.
- **Salud Operativa** y **Etapa.**
- **Moneda y Valor de Negocio.**
- **Responsable** y **Fecha Límite.**
- **Siguiente Paso:** la acción que sigue. El botón **"Sugerir con IA"** propone uno
  automáticamente (puedes editarlo).
- **Bloqueos y Notas Técnicas.**
- **Resumen Ejecutivo.**

Presiona **"Guardar Cambios"** para guardar. **Todo se guarda automáticamente** y
permanece aunque cierres o recargues la página.

> 📷 **[Insertar screenshot: formulario de proyecto con el botón "Sugerir con IA"]**

---

## Preguntas frecuentes

**¿Se pierden mis cambios si cierro el navegador?**
No. El sistema guarda todo automáticamente en tu navegador. Para volver a los datos
originales, usa **"Restablecer"** en Portafolio.

**¿Qué diferencia hay entre "Escalar" y "Desarrollar"?**
*Escalar* = el proyecto espera a alguien externo (cliente, accesos) → hay que
gestionarlo, no programarlo. *Desarrollar* = es un problema técnico que el equipo
resuelve.

**¿Por qué un proyecto de mucho dinero aparece abajo en el ranking?**
Porque el sistema prioriza por **riesgo**, no solo por valor. Un proyecto valioso pero
sano y al día no es urgente; uno bloqueado y vencido sí.

**¿Necesito una cuenta o contraseña?**
No. El dashboard funciona directamente en el navegador.
