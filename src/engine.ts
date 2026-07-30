/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 *  MOTOR DE PRIORIZACIÓN — Aztec · Operaciones
 * ============================================================================
 *
 *  Este módulo es el "cerebro" del sistema. Convierte 22 proyectos crudos en
 *  un ranking accionable respondiendo la pregunta operativa real:
 *      "¿Qué hará la persona correcta HOY para mover la mayor cantidad de valor?"
 *
 *  Decisiones de diseño (para defender en el video):
 *
 *  1) NO priorizamos por valor bruto, sino por VALOR EN RIESGO.
 *     Un proyecto sano de $30k tiene poco valor en riesgo; uno bloqueado y
 *     vencido de $30k lo tiene casi todo. -> valor × riesgo × urgencia.
 *
 *  2) Derivamos un campo que NO viene en los datos: `blockerType` (Externo/Interno).
 *     El ~76% de los bloqueos "esperan a un tercero" (cliente, accesos, credenciales)
 *     y NO se resuelven programando -> van a una cola de ESCALAMIENTO, no de desarrollo.
 *     Esto libera al cuello de botella sin consumir capacidad técnica.
 *
 *  3) Superponemos una CAPA DE CAPACIDAD: penalizamos lo que depende de una
 *     persona saturada (Camila: 28 tareas abiertas) y sugerimos reasignar.
 *
 *  4) Recalculamos riesgo/urgencia desde las fechas CRUDAS contra un "hoy"
 *     configurable, en vez de confiar en los flags `is_overdue`/`health`
 *     precalculados (que en el dataset venían de un snapshot desactualizado).
 *
 *  Todos los PESOS viven en DEFAULT_CONFIG y son ajustables: el criterio es
 *  una hipótesis explícita, no una verdad absoluta.
 * ============================================================================
 */

import { Project, Task, TeamMember, EngagementType, ProjectHealth } from './types';

// ---------------------------------------------------------------------------
// Configuración (los pesos SON el criterio; cámbialos y el ranking cambia)
// ---------------------------------------------------------------------------
export interface EngineConfig {
  /** Fecha de referencia para calcular urgencia/vencimiento. */
  today: Date;
  /** Tasa de conversión COP -> USD para normalizar el valor de negocio. */
  copToUsd: number;
  /** Factor de riesgo por estado de salud del proyecto (0..1). */
  healthRisk: Record<ProjectHealth, number>;
  /**
   * Valor (USD) de último recurso cuando el proyecto no trae business_value Y
   * además no hay ningún proyecto con valor del cual calcular la mediana.
   * En la práctica se usa la mediana del portafolio (ver `rankProjects`).
   */
  defaultValueUSD: number;
  /** Umbrales de score (0..100) para etiquetar la prioridad. */
  criticalThreshold: number;
  highThreshold: number;
  /** Umbrales de carga (tareas abiertas) para categorizar al responsable. */
  loadSaturated: number;
  loadHigh: number;
  loadMedium: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  today: new Date('2026-07-29'),
  copToUsd: 1 / 4000,
  healthRisk: { Bloqueado: 1.0, 'En riesgo': 0.6, Sano: 0.15 },
  defaultValueUSD: 8000,
  criticalThreshold: 50,
  highThreshold: 20,
  loadSaturated: 25,
  loadHigh: 15,
  loadMedium: 8,
};

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------
export type BlockerType = 'Externo' | 'Interno' | 'N/A';
export type OwnerLoad = 'SATURADO' | 'Alto' | 'Medio' | 'Holgura' | 'NO-TRACK';
export type AssignedPriority = 'Critica' | 'Alta' | 'Baja';

export interface RankedProject {
  project: Project;
  /** Valor de negocio normalizado a USD. */
  valueUSD: number;
  /** true si el valor fue asumido (el proyecto no traía business_value). */
  valueEstimated: boolean;
  /** Días de atraso vs `today`: >0 vencido, <=0 a tiempo, null si no hay fecha. */
  daysLate: number | null;
  hasNoDate: boolean;
  blockedTaskCount: number;
  /** Externo (escalar) / Interno (desarrollar) / N/A (sin bloqueo). */
  blockerType: BlockerType;
  ownerLoad: OwnerLoad;
  ownerOpenTasks: number | null;
  /** false si el proyecto no tiene un `next_step` definido por un humano. */
  hasNextStep: boolean;
  /** valor × riesgo × urgencia — el núcleo del criterio. */
  valueAtRisk: number;
  /** Score normalizado 0..100 (100 = mayor valor en riesgo del portafolio). */
  score: number;
  assignedPriority: AssignedPriority;
  /** Segmento de trabajo (se prioriza distinto según el tipo). */
  segment: EngagementType;
  /** Todas las acciones sugeridas, en orden. */
  actions: string[];
  /** Acción principal (la primera) — alimenta el "siguiente paso". */
  primaryAction: string;
}

// ---------------------------------------------------------------------------
// Utilidades puras (exportadas para poder testearlas por separado — estilo QA)
// ---------------------------------------------------------------------------

/** Normaliza el valor de negocio a USD. Devuelve null si no hay valor. */
export function normalizeToUSD(
  value: string | null,
  currency: string,
  cfg: EngineConfig = DEFAULT_CONFIG,
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(num)) return null;
  return (currency || '').toUpperCase() === 'COP' ? num * cfg.copToUsd : num;
}

/** Parseo tolerante de fechas (ISO y dd/mm/yyyy). */
export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) return iso;
  const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(iso.getTime()) ? null : iso;
}

/** Días de atraso respecto a `today` (>0 vencido). null si no hay fecha. */
export function daysLate(targetDate: string | null, today: Date): number | null {
  const d = parseDate(targetDate);
  if (!d) return null;
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

// --- Accionabilidad del bloqueo: campo DERIVADO del texto -------------------
// El dataset describe el bloqueo en texto libre (`detail` / `blockers`).
// Lo clasificamos con reglas por palabras clave. En producción esto se
// reforzaría con la capa de IA (Claude/Gemini) usando ESTAS reglas como
// fallback determinista (guardrail): si la IA falla, el sistema sigue.
const EXTERNAL_KEYWORDS = [
  'client', 'credential', 'permission', 'access',
  'external', 'owner confirmation', 'business definition',
];
const INTERNAL_KEYWORDS = [
  'technical', 'automation', 'validation', 'edge case',
  'rule', 'issue in', 'stability', 'production',
];

export function classifyBlockerText(text: string | null): BlockerType {
  const t = (text || '').toLowerCase();
  if (EXTERNAL_KEYWORDS.some((k) => t.includes(k))) return 'Externo';
  if (INTERNAL_KEYWORDS.some((k) => t.includes(k))) return 'Interno';
  return 'N/A';
}

/**
 * Clasifica el bloqueo a nivel proyecto: vota sobre el `detail` de sus tareas
 * bloqueadas y, si no hay, cae al texto `blockers` del proyecto.
 */
export function classifyProjectBlocker(project: Project, tasks: Task[]): BlockerType {
  const blocked = tasks.filter(
    (t) => t.project_code === project.project_code && t.status === 'Bloqueada',
  );
  let ext = 0;
  let int = 0;
  for (const t of blocked) {
    const c = classifyBlockerText(t.detail);
    if (c === 'Externo') ext++;
    else if (c === 'Interno') int++;
  }
  if (ext === 0 && int === 0) return classifyBlockerText(project.blockers);
  return ext >= int ? 'Externo' : 'Interno';
}

/** Categoriza la carga del responsable a partir de sus tareas abiertas. */
export function ownerLoadCategory(
  openTasks: number | null,
  cfg: EngineConfig = DEFAULT_CONFIG,
): OwnerLoad {
  if (openTasks === null) return 'NO-TRACK'; // owner que no está en la tabla Team
  if (openTasks >= cfg.loadSaturated) return 'SATURADO';
  if (openTasks >= cfg.loadHigh) return 'Alto';
  if (openTasks >= cfg.loadMedium) return 'Medio';
  return 'Holgura';
}

/** Factor de urgencia (0..1) según cercanía/atraso de la fecha límite. */
function urgencyFactor(dLate: number | null): number {
  if (dLate === null) return 0.7; // sin fecha = riesgo medio-alto (cronograma infinito)
  if (dLate > 0) return 1.0; // vencido
  if (dLate > -30) return 0.7; // vence en <=30 días
  return 0.3; // lejano
}

// ---------------------------------------------------------------------------
// Acciones recomendadas (traducen el score en "qué hacer mañana")
// ---------------------------------------------------------------------------
function recommendActions(r: Omit<RankedProject, 'actions' | 'primaryAction'>): string[] {
  const a: string[] = [];
  const health = r.project.health;
  const type = r.segment;

  if (health === 'Bloqueado') {
    a.push(r.blockerType === 'Externo' ? 'Escalar (dependencia externa)' : 'Desarrollar (bloqueo interno)');
  }
  if ((r.ownerLoad === 'SATURADO' || r.ownerLoad === 'Alto') && health !== 'Sano') {
    a.push('Reasignar (dueño saturado)');
  }
  if (type === 'Mantenimiento o recurrente' && health === 'Bloqueado') {
    a.push('Proteger SLA (servicio en vivo)');
  }
  if (type === 'Diagnostico') {
    a.push('Time-box (no dejar enfriar)');
  }
  if (health === 'Sano' && (r.daysLate ?? 0) > 0) {
    a.push('Revisar (¿proyecto zombie?)');
  }
  if (health === 'Sano' && (r.daysLate === null || r.daysLate <= 0)) {
    a.push('Mantener curso');
  }
  // El reto pide detectar proyectos "sin siguiente paso claro".
  if (!r.hasNextStep) {
    a.push('Definir siguiente paso');
  }
  // Dedupe preservando el orden
  return Array.from(new Set(a.length ? a : ['—']));
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------
/**
 * Rankea el portafolio por valor en riesgo y adjunta las señales estratégicas
 * (tipo de bloqueo, carga del dueño, acción recomendada).
 *
 * @returns proyectos ordenados de mayor a menor score (0..100).
 */
export function rankProjects(
  projects: Project[],
  tasks: Task[],
  team: TeamMember[],
  config: Partial<EngineConfig> = {},
): RankedProject[] {
  const cfg: EngineConfig = { ...DEFAULT_CONFIG, ...config };

  // Índice de carga por responsable (tareas abiertas declaradas en Team).
  const loadByOwner = new Map<string, number>();
  for (const m of team) {
    const n = parseInt(m.open_tasks_assigned, 10);
    loadByOwner.set(m.member_alias, Number.isNaN(n) ? 0 : n);
  }

  // Mediana del valor (USD) de los proyectos que SÍ tienen valor. Se usa como
  // default para los que no lo traen, para que un dato faltante no los oculte
  // del ranking — pero con un valor representativo del portafolio, no un número
  // mágico. Si ningún proyecto tiene valor, cae al defaultValueUSD de la config.
  const valuedUSD = projects
    .map((p) => normalizeToUSD(p.business_value, p.currency, cfg))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const medianValueUSD = valuedUSD.length
    ? valuedUSD.length % 2 === 1
      ? valuedUSD[(valuedUSD.length - 1) / 2]
      : (valuedUSD[valuedUSD.length / 2 - 1] + valuedUSD[valuedUSD.length / 2]) / 2
    : cfg.defaultValueUSD;

  // 1) Calcular métricas y valor en riesgo por proyecto.
  const partial = projects.map((project) => {
    const valueRaw = normalizeToUSD(project.business_value, project.currency, cfg);
    const valueEstimated = valueRaw === null;
    const valueUSD = valueRaw ?? medianValueUSD;

    const dLate = daysLate(project.target_date, cfg.today);
    const risk = cfg.healthRisk[project.health] ?? 0.5;
    const urgency = urgencyFactor(dLate);

    // Núcleo del criterio: valor en riesgo.
    // La urgencia modula entre 0.6 y 1.0 para que nunca anule el valor por completo.
    const valueAtRisk = valueUSD * risk * (0.6 + 0.4 * urgency);

    const blockedTaskCount = tasks.filter(
      (t) => t.project_code === project.project_code && t.status === 'Bloqueada',
    ).length;
    const blockerType: BlockerType =
      project.health === 'Sano' ? 'N/A' : classifyProjectBlocker(project, tasks);

    const ownerOpenTasks = loadByOwner.has(project.owner_alias)
      ? (loadByOwner.get(project.owner_alias) as number)
      : null;
    const ownerLoad = ownerLoadCategory(ownerOpenTasks, cfg);
    const hasNextStep = Boolean(project.next_step && project.next_step.trim());

    return {
      project,
      valueUSD,
      valueEstimated,
      daysLate: dLate,
      hasNoDate: dLate === null,
      blockedTaskCount,
      blockerType,
      ownerLoad,
      ownerOpenTasks,
      hasNextStep,
      valueAtRisk,
      segment: project.engagement_type,
    };
  });

  // 2) Normalizar el score a 0..100 (relativo al mayor valor en riesgo).
  const maxVar = Math.max(...partial.map((p) => p.valueAtRisk), 1);

  const ranked: RankedProject[] = partial.map((p) => {
    const score = Math.round((100 * p.valueAtRisk) / maxVar * 10) / 10;
    const assignedPriority: AssignedPriority =
      score >= cfg.criticalThreshold ? 'Critica' : score >= cfg.highThreshold ? 'Alta' : 'Baja';

    const base = { ...p, score, assignedPriority };
    const actions = recommendActions(base);
    return { ...base, actions, primaryAction: actions[0] };
  });

  // 3) Ordenar de mayor a menor score.
  return ranked.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Explicación en lenguaje natural de cómo se llegó al Score de un proyecto.
// Narra los tres factores (valor, riesgo, urgencia) para que un usuario no
// técnico entienda el criterio.
// ---------------------------------------------------------------------------
export function explainScore(r: RankedProject): string {
  const p = r.project;
  const k = (n: number) => `$${Math.round(n / 1000)}k`;

  const valTxt = r.valueEstimated
    ? `no tiene valor registrado (se asumió la mediana del portafolio, ~${k(r.valueUSD)})`
    : `vale ${k(r.valueUSD)}`;

  const riskTxt =
    p.health === 'Bloqueado' ? 'está bloqueado (riesgo máximo)' :
    p.health === 'En riesgo' ? 'está en riesgo (riesgo medio)' :
    'está sano (riesgo bajo)';

  let urgTxt: string;
  if (r.daysLate === null) urgTxt = 'no tiene fecha límite (se trata como urgencia media-alta)';
  else if (r.daysLate > 0) urgTxt = `venció hace ${r.daysLate} días (urgencia máxima)`;
  else if (r.daysLate >= -30) urgTxt = `vence en ${-r.daysLate} días (urgencia alta)`;
  else urgTxt = `vence en ${-r.daysLate} días (todavía lejano)`;

  const closing = r.score >= 99.5
    ? 'tiene el mayor valor en riesgo de todo el portafolio, y por eso encabeza la lista con 100/100'
    : `su valor en riesgo equivale al ${Math.round(r.score)}% del proyecto más urgente, y por eso su Score es ${Math.round(r.score)}/100`;

  return `${p.client_alias} ${valTxt}, ${riskTxt} y ${urgTxt}. El Score multiplica esos tres factores — valor × riesgo × urgencia —, así que ${closing}.`;
}

// ---------------------------------------------------------------------------
// Agregados de portafolio (para el "briefing" y las tarjetas de resumen).
// ---------------------------------------------------------------------------
export interface PortfolioSummary {
  total: number;
  blocked: number;
  atRisk: number;
  healthy: number;
  overdue: number;
  noDate: number;
  withoutNextStep: number;
  totalValueUSD: number;
  blockedValueUSD: number;
  /** Colas derivadas de la estrategia. */
  escalationQueue: RankedProject[]; // bloqueo externo -> comercial
  developmentQueue: RankedProject[]; // bloqueo interno -> equipo técnico
  overloadedOwners: string[];
}

export function summarizePortfolio(ranked: RankedProject[]): PortfolioSummary {
  const blocked = ranked.filter((r) => r.project.health === 'Bloqueado');
  const totalValueUSD = ranked.reduce(
    (acc, r) => acc + (r.valueEstimated ? 0 : r.valueUSD),
    0,
  );
  const blockedValueUSD = blocked.reduce(
    (acc, r) => acc + (r.valueEstimated ? 0 : r.valueUSD),
    0,
  );
  const overloaded = new Set<string>();
  for (const r of ranked) {
    if (r.ownerLoad === 'SATURADO') overloaded.add(r.project.owner_alias);
  }

  return {
    total: ranked.length,
    blocked: blocked.length,
    atRisk: ranked.filter((r) => r.project.health === 'En riesgo').length,
    healthy: ranked.filter((r) => r.project.health === 'Sano').length,
    overdue: ranked.filter((r) => (r.daysLate ?? 0) > 0).length,
    noDate: ranked.filter((r) => r.hasNoDate).length,
    withoutNextStep: ranked.filter((r) => !r.hasNextStep).length,
    totalValueUSD,
    blockedValueUSD,
    escalationQueue: blocked.filter((r) => r.blockerType === 'Externo'),
    developmentQueue: blocked.filter((r) => r.blockerType === 'Interno'),
    overloadedOwners: Array.from(overloaded),
  };
}
