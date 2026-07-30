# Aztec · Operaciones — Sistema de gestión y priorización de proyectos

Sistema de gestión de proyectos para una operación de consultoría de IA. No es un
tablero que *describe* el portafolio: es uno que **dirige la acción**. Convierte
22 proyectos y 82 tareas en unas pocas decisiones claras — qué escalar, qué
desarrollar, a quién descargar y qué datos limpiar.

Reto técnico para el rol de **Desarrollador de Soluciones con IA** en Aztec.

---

##  Cómo levantarlo

**Requisitos:** Node.js 18 o superior.

```bash
# 1. Instalar dependencias
npm install

# 2. Levantar el servidor de desarrollo
npm run dev
```

Abre **http://localhost:3000**.

### (Opcional) Activar la IA con Gemini

El sistema **funciona sin API key** — la capa de IA usa un fallback determinista.
Para usar Gemini de verdad, crea un archivo `.env.local` en la raíz con:

```
VITE_GEMINI_API_KEY=tu_api_key_de_google_ai_studio
```

(La consigues gratis en https://aistudio.google.com/apikey.)
Con la clave, el briefing y las sugerencias muestran *"Fuente: IA (Gemini)"*;
sin ella, *"Fuente: Fallback determinista"*.

---

##  Qué hace

| Vista | Para qué sirve |
|-------|----------------|
| **Resumen** | Centro de operaciones: qué atender hoy, colas de escalar/desarrollar, cuello de botella y calidad de datos. |
| **Priorización** | Ranking completo por valor en riesgo + briefing operativo generado con IA. |
| **Equipo** | Carga por persona; identifica al cuello de botella. |
| **Portafolio** | Crear y editar proyectos (con sugerencia de "siguiente paso" por IA). |

- Los cambios **persisten** en `localStorage`. El botón **"Restablecer"** (en Portafolio)
  vuelve a los datos originales — útil para demos.

---

##  El criterio de priorización

El núcleo del sistema. Responde: *"¿qué debe hacer la persona correcta HOY para
mover la mayor cantidad de valor?"*. Tiene **tres capas**:

### 1. El score — ¿qué está más en riesgo?

No prioriza por valor bruto, sino por **valor en riesgo**:

```
Valor en riesgo = Valor × Riesgo × Urgencia
```

| Factor | Fuente | Valores |
|--------|--------|---------|
| Valor | `business_value` normalizado a USD (COP÷4000) | número real |
| Riesgo | salud del proyecto | Bloqueado 1.0 · En riesgo 0.6 · Sano 0.15 |
| Urgencia | días a la fecha límite | Vencido 1.0 · ≤30d 0.7 · lejano 0.3 · sin fecha 0.7 |

Un proyecto sano de $30k puntúa bajo; uno bloqueado y vencido de $38k puntúa 100.
El riesgo decide si el valor es real o teórico.

### 2. El ruteo — ¿qué tipo de acción se necesita?

Se **deriva** un campo que no viene en los datos: si el bloqueo es **Externo**
(cliente / accesos / credenciales → *escalar*, no se resuelve programando) o
**Interno** (dependencia técnica → *desarrollar*). El ~76% de los bloqueos son
externos: separarlos evita saturar al equipo con trabajo que no puede destrabar.

### 3. La capacidad — ¿quién lo hace?

Encima del score, el sistema señala al **cuello de botella** (la persona más
saturada) y sugiere reasignar. En una operación de servicios, el rendimiento del
portafolio es igual al de la persona más cargada.

> Los pesos viven en `DEFAULT_CONFIG` (`src/engine.ts`) y son ajustables: el
> criterio es una **hipótesis explícita**, no una verdad absoluta.

---

##  Capa de IA (con guardrails)

- **Briefing operativo:** resumen de qué atender hoy. Las **cifras siempre las
  calcula el motor**; la IA solo redacta el titular y la recomendación → no inventa números.
- **Sugerir siguiente paso:** propone un siguiente paso para proyectos que no lo tienen.
- **Guardrails:** funciona sin API key (fallback determinista); la IA solo *sugiere*
  (el humano edita); salida en **JSON estructurado y validada**; timeout + `try/catch`
  que nunca rompe la UI; badge transparente de la fuente (IA vs fallback).

---

##  Arquitectura

```
src/
├── engine.ts       Motor de priorización (puro, desacoplado de la UI, testeable)
├── ai.ts           Capa de IA (Gemini) + fallbacks deterministas
├── types.ts        Modelo de datos (Project, Task, TeamMember)
├── data.ts         Dataset semilla (22 proyectos, 82 tareas, equipo)
├── App.tsx         UI: vistas Resumen / Priorización / Equipo / Portafolio
├── ProjectModal.tsx  Crear / editar proyectos
└── index.css       Estilos (Tailwind CSS v4)
```

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · date-fns · `@google/genai`.

El motor (`engine.ts`) no depende de React: recibe datos, devuelve el ranking y las
señales. Eso lo hace testeable de forma aislada.

---

##  Requisitos del reto cubiertos

- [x] Crear y actualizar proyectos.
- [x] Guardar responsable, estado, prioridad, fecha límite, **siguiente paso**, bloqueos y notas.
- [x] Detectar proyectos en riesgo, bloqueados o **sin siguiente paso claro**.
- [x] Vista útil para seguimiento operativo.
- [x] Criterio claro de priorización.
- [x] Ejemplos con distintos estados y prioridades (dataset real de Aztec).

---

##  Decisiones de alcance (qué dejé afuera a propósito)

- **Sin autenticación, multiusuario ni base de datos productiva** — usé `localStorage`.
  En 24h prioricé el criterio y la utilidad operativa, no la infraestructura.
- **No confío ciegamente en los datos precalculados.** El flag `is_overdue` del
  dataset venía de un snapshot desactualizado, así que **recalculo riesgo y urgencia
  desde las fechas crudas** contra un "hoy" configurable.
- **Los datos incompletos se marcan como riesgo, no se ignoran:** proyectos sin
  fecha, sin valor, sin siguiente paso, "zombie" (sanos pero sin tareas), y un dueño
  (Andrea) que tiene proyectos pero no aparece en la tabla de capacidad.

### Cómo lo escalaría en producción
Backend real + automatización de las dos colas con **n8n**: el escalamiento externo
dispararía alertas al equipo comercial y el briefing correría cada mañana.

---

##  Nota sobre los datos

El dataset usa alias: nombres de clientes, proyectos y miembros fueron cambiados.
La lógica operativa y el nivel de detalle sí reflejan un entorno real.
