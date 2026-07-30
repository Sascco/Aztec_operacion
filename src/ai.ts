/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 *  CAPA DE IA — Aztec · Operaciones
 * ============================================================================
 *
 *  Añade dos asistencias de IA sobre el motor de priorización:
 *    1) Briefing operativo diario en lenguaje natural.
 *    2) Sugerencia de "siguiente paso" para proyectos que no lo tienen.
 *
 *  GUARDRAILS (diseño responsable — el punto clave para el video):
 *    - El sistema funciona SIN API key: hay un FALLBACK DETERMINISTA que se
 *      arma con los datos del motor. La IA solo *mejora* la redacción; nunca
 *      es un punto único de falla.
 *    - La IA solo SUGIERE; el humano decide y edita.
 *    - Se le prohíbe inventar: el prompt le pasa SOLO los datos calculados y
 *      le pide no agregar información externa.
 *    - Salida validada: para el siguiente paso se pide JSON estructurado y se
 *      valida su forma; si algo falla, se cae al fallback.
 *    - La llamada tiene timeout; cualquier error -> fallback (nunca rompe la UI).
 * ============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import { Project } from './types';
import {
  RankedProject,
  PortfolioSummary,
  classifyBlockerText,
} from './engine';

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 12_000;

export type AiSource = 'ai' | 'fallback';

/** Un proyecto en el "foco de hoy" del briefing. */
export interface BriefingItem {
  code: string;
  client: string;
  action: string;
}

/**
 * Briefing estructurado. Las CIFRAS (priorities, metrics, escalation,
 * development, bottleneck) siempre las calcula el motor; la IA solo redacta
 * las partes narrativas (headline y recommendation). Así la IA nunca inventa
 * números — un guardrail clave.
 */
export interface BriefingData {
  headline: string;
  priorities: BriefingItem[];
  metrics: { label: string; value: string }[];
  escalation: number;
  development: number;
  bottleneck: string;
  recommendation: string;
  overdue: number;
}

/** Lee la API key (Vite expone las variables con prefijo VITE_). */
function getApiKey(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  return env?.VITE_GEMINI_API_KEY || undefined;
}

/** ¿Hay credenciales para usar la IA? La UI lo usa para mostrar el estado. */
export function aiAvailable(): boolean {
  return Boolean(getApiKey());
}

/** Envuelve una promesa con timeout para no colgar la UI. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ===========================================================================
//  FALLBACKS DETERMINISTAS (funcionan sin IA — son la red de seguridad)
// ===========================================================================

/** Parte factual del briefing — SIEMPRE calculada por el motor (no la IA). */
function buildBriefingBase(summary: PortfolioSummary, ranked: RankedProject[]) {
  const priorities: BriefingItem[] = ranked.slice(0, 3).map((r) => ({
    code: r.project.project_code,
    client: r.project.client_alias,
    action: r.primaryAction,
  }));
  const metrics = [
    { label: 'Bloqueados', value: `${summary.blocked} de ${summary.total}` },
    { label: 'Valor atrapado', value: `~$${Math.round(summary.blockedValueUSD / 1000)}k` },
    { label: 'Sin siguiente paso', value: `${summary.withoutNextStep}` },
  ];
  const bottleneck = summary.overloadedOwners.length
    ? `${summary.overloadedOwners.join(', ')} concentra la carga — reasignar para liberar capacidad.`
    : 'Sin saturación crítica de capacidad.';
  return { priorities, metrics, bottleneck, overdue: summary.overdue };
}

/** Narrativa determinista (titular + recomendación) cuando no hay IA. */
function fallbackNarrative(summary: PortfolioSummary): { headline: string; recommendation: string } {
  return {
    headline:
      `${summary.blocked} de ${summary.total} proyectos están bloqueados: hoy el foco es ` +
      `desatascar valor, no avanzar lo que ya fluye.`,
    recommendation:
      `Enruta los ${summary.escalationQueue.length} bloqueos externos a escalamiento comercial y ` +
      `reasigna la carga del cuello de botella; reserva al equipo para los ` +
      `${summary.developmentQueue.length} bloqueos internos.`,
  };
}

export function fallbackBriefingData(summary: PortfolioSummary, ranked: RankedProject[]): BriefingData {
  const base = buildBriefingBase(summary, ranked);
  const narrative = fallbackNarrative(summary);
  return {
    ...narrative,
    ...base,
    escalation: summary.escalationQueue.length,
    development: summary.developmentQueue.length,
  };
}

/** Siguiente paso determinista según salud + tipo de bloqueo del texto. */
export function fallbackNextStep(project: Partial<Project>): string {
  const health = project.health;
  if (health === 'Bloqueado') {
    return classifyBlockerText(project.blockers ?? null) === 'Interno'
      ? 'Resolver el bloqueo técnico interno y validar en piloto/producción.'
      : 'Escalar la dependencia externa (cliente / accesos / credenciales).';
  }
  if (health === 'En riesgo') {
    return 'Agendar revisión con el stakeholder y definir quick wins del diagnóstico.';
  }
  return 'Confirmar el próximo entregable y su fecha con el responsable.';
}

// ===========================================================================
//  IA (Gemini) — con fallback en cada rama
// ===========================================================================

/**
 * Genera un briefing operativo. Devuelve el texto y la fuente ('ai' | 'fallback')
 * para que la UI sea transparente sobre de dónde viene la información.
 */
export async function generateBriefing(
  summary: PortfolioSummary,
  ranked: RankedProject[],
): Promise<{ data: BriefingData; source: AiSource }> {
  const base = buildBriefingBase(summary, ranked);
  const escalation = summary.escalationQueue.length;
  const development = summary.developmentQueue.length;

  const key = getApiKey();
  if (!key) return { data: fallbackBriefingData(summary, ranked), source: 'fallback' };

  // La IA solo redacta headline + recommendation; las cifras ya vienen calculadas.
  const facts = {
    total: summary.total,
    bloqueados: summary.blocked,
    valor_bloqueado_usd: Math.round(summary.blockedValueUSD),
    cola_escalamiento_externa: escalation,
    cola_desarrollo_interna: development,
    duenos_saturados: summary.overloadedOwners,
    sin_siguiente_paso: summary.withoutNextStep,
    top: base.priorities,
  };

  const prompt =
    'Eres el jefe de operaciones de una consultora de IA. Con EXCLUSIVAMENTE estos ' +
    'datos (no inventes cifras), devuelve un JSON con dos campos en español:\n' +
    '- "headline": una frase que capture el foco del día.\n' +
    '- "recommendation": una frase con la jugada recomendada (desatascar valor, ' +
    'separar escalamiento externo de desarrollo interno, aliviar el cuello de botella).\n' +
    'Tono directo, sin relleno.\n\nDATOS:\n' +
    JSON.stringify(facts, null, 2);

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const resp = await withTimeout(
      ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          temperature: 0.4,
          maxOutputTokens: 300,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              recommendation: { type: 'string' },
            },
            required: ['headline', 'recommendation'],
          },
        },
      }),
      TIMEOUT_MS,
    );
    const parsed = JSON.parse((resp.text ?? '').trim());
    const headline = typeof parsed?.headline === 'string' ? parsed.headline.trim() : '';
    const recommendation =
      typeof parsed?.recommendation === 'string' ? parsed.recommendation.trim() : '';
    if (!headline || !recommendation) throw new Error('JSON inválido');
    return {
      data: { headline, recommendation, ...base, escalation, development },
      source: 'ai',
    };
  } catch {
    // Guardrail: cualquier fallo cae al briefing determinista.
    return { data: fallbackBriefingData(summary, ranked), source: 'fallback' };
  }
}

/**
 * Sugiere un "siguiente paso" concreto para un proyecto. Pide JSON estructurado
 * y valida su forma; si algo falla, usa el fallback determinista.
 */
export async function suggestNextStep(
  project: Partial<Project>,
): Promise<{ nextStep: string; source: AiSource }> {
  const key = getApiKey();
  if (!key) return { nextStep: fallbackNextStep(project), source: 'fallback' };

  const facts = {
    tipo: project.engagement_type,
    salud: project.health,
    fecha_limite: project.target_date ?? null,
    bloqueos: project.blockers ?? null,
    resumen: project.summary ?? null,
  };

  const prompt =
    'Eres un líder de entrega en una consultora de IA. Con EXCLUSIVAMENTE estos datos ' +
    '(no inventes), propón UN siguiente paso accionable y específico para el proyecto. ' +
    'Si el bloqueo es una dependencia externa (cliente, accesos, credenciales), el paso ' +
    'debe ser escalar, no desarrollar. Responde en español.\n\nDATOS:\n' +
    JSON.stringify(facts, null, 2);

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const resp = await withTimeout(
      ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 200,
          // Salida estructurada = guardrail: validamos la forma antes de usarla.
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              next_step: { type: 'string' },
            },
            required: ['next_step'],
          },
        },
      }),
      TIMEOUT_MS,
    );
    const parsed = JSON.parse((resp.text ?? '').trim());
    const nextStep = typeof parsed?.next_step === 'string' ? parsed.next_step.trim() : '';
    if (!nextStep) throw new Error('JSON inválido');
    return { nextStep, source: 'ai' };
  } catch {
    return { nextStep: fallbackNextStep(project), source: 'fallback' };
  }
}
