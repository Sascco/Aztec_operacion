# Estrategia de Priorización

## 1. Fórmula principal (valor en riesgo)
`Score = Valor × Riesgo × (0.6 + 0.4 × Urgencia)`

| Componente | Cómo se calcula |
|------------|------------------|
| **Valor** | Normalizado en USD (COP ÷ 4,000). Si no hay valor, usar la **mediana del portafolio** (marcar como incompleto). |
| **Riesgo** | **Bloqueado** → 1.0  ·  **En riesgo** → 0.6  ·  **Sano** → 0.15 |
| **Urgencia** | **Vencido** → 1.0  ·  **≤30 días** → 0.7  ·  **>30 días** → 0.3  ·  **Sin fecha** → 0.7 |
| **Resultado** | ≥ 50 → **Crítica**, ≥ 20 → **Alta**, < 20 → **Baja** (luego de escalar a 0‑100). |

## 2. Ruteo – Bloqueos externos vs internos

| Tipo de bloqueo | Palabras clave (ejemplos) | Acción |
|----------------|----------------------------|---------|
| **Externo** | *cliente, credenciales, accesos, permisos, definición de negocio* | **Escalar** (escalamiento comercial) – no consume capacidad técnica. |
| **Interno** | *dependencia técnica, validación, issue en producción* | **Desarrollar** – trabajo del equipo. |

> ~76 % de los bloqueos son externos; separarlos evita que el equipo técnico se atasque en cosas que solo un cliente puede destrabar.

## 3. Capacidad – ¿Quién puede hacerlo?

- Detectar la persona con **mayor carga** (ejemplo: Camila = 34 % de las tareas abiertas, $152 k en proyectos, todas bloqueadas). 
- Sugerir **reasignaciones** para equilibrar la carga y mantener el flujo de trabajo. 

## 4. Ejemplos clave (usando la fórmula)

| Proyecto | Valor | Riesgo | Urgencia | Score | Prioridad |
|----------|-------|--------|----------|-------|-----------|
| PRJ‑22 Vector Partners | $38 k | Bloqueado (1.0) | Vencido (1.0) | 100 | **Crítica** |
| PRJ‑08 Vector Partners | $35 k | Bloqueado (1.0) | Vencido (1.0) | 92 | **Crítica** |
| PRJ‑06 Nova Recovery | $30 k | Bloqueado (1.0) | Vencido (1.0) | 79 | **Crítica** |
| PRJ‑20 Nova Recovery | $30 k | Sano (0.15) | >30 días (0.3) | ~9 | **Baja** |
| PRJ‑15 Orion (diagnóstico) | $1 k | En riesgo (0.6) | Sin fecha (0.7) | ~1 | **Baja** |

### Lo importante:
Ambos proyectos tienen valor similar (~$30 k), pero uno saca 79 y el otro ~9. Exactamente lo que la estrategia hace: **separar el valor en peligro del valor que ya fluye.**

## 5. Resultado práctico (acciones diarias)

1. **Escalar** todos los proyectos con bloqueos externos (≈9 proyectos). 
2. **Desarrollar** proyectos con bloqueos internos (≈4 proyectos). 
3. **Reasignar** trabajo de la persona con mayor carga (Camila) a quien tenga capacidad. 
4. Marcar como **alta‑riesgo** los proyectos sin fecha, sin valor, sin siguiente paso o sin dueños (zombies).

---

*Resumen breve:* **Priorizo por valor en riesgo (no bruto), ruteo según si el bloqueo es externo (escalar) o interno (desarrollar), y superpongo la capacidad, porque el sistema debe decir no solo "qué proyecto", sino "quién hace qué mañana".**
