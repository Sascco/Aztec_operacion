/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  Plus, 
  AlertCircle,
  Clock,
  Ban,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Target,
  ArrowUpRight,
  Settings2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { INITIAL_DATA } from './data';
import { Project, Task, TeamMember, ProjectHealth, TaskPriority } from './types';
import { rankProjects, summarizePortfolio, normalizeToUSD, explainScore } from './engine';
import { generateBriefing, aiAvailable, AiSource, BriefingData } from './ai';
import { Sparkles, Loader2 } from 'lucide-react';
import ProjectModal from './ProjectModal';
import InfoTip from './InfoTip';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'prioritization' | 'team' | 'portfolio'>('home');
  const STORAGE_KEY = 'aztec_projects_v1';
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as Project[];
    } catch { /* almacenamiento no disponible: usamos la semilla */ }
    return INITIAL_DATA.projects;
  });
  const [tasks] = useState<Task[]>(INITIAL_DATA.tasks);
  const [team] = useState<TeamMember[]>(INITIAL_DATA.team);

  // Persistencia local: los cambios (crear/editar) sobreviven al recargar.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch { /* ignore */ }
  }, [projects]);

  const handleResetData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setProjects(INITIAL_DATA.projects);
  };

  // --- Capa de IA: briefing operativo (con fallback determinista) ----------
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingSource, setBriefingSource] = useState<AiSource | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(true);

  const handleGenerateBriefing = async () => {
    setBriefingLoading(true);
    try {
      const ranked = rankProjects(projects, tasks, team, { today: new Date('2026-07-29') });
      const summary = summarizePortfolio(ranked);
      const result = await generateBriefing(summary, ranked);
      setBriefing(result.data);
      setBriefingSource(result.source);
      setBriefingOpen(true);
    } finally {
      setBriefingLoading(false);
    }
  };
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedAnomalyType, setSelectedAnomalyType] = useState<'dates' | 'value' | 'zombie' | 'nextstep' | null>(null);
  const [selectedQueue, setSelectedQueue] = useState<'escalation' | 'development' | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterHealth, setFilterHealth] = useState<string>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');

  // Derived stats
  const stats = useMemo(() => {
    const now = new Date('2026-07-29');
    const blockedCount = projects.filter(p => p.health === 'Bloqueado').length;
    const overdueProjectsCount = projects.filter(p => p.target_date && new Date(p.target_date) < now).length;
    // Proyectos "críticos" = distintos que están bloqueados O vencidos (unión, sin
    // doble conteo: un proyecto puede estar bloqueado y vencido a la vez).
    const criticalProjectsCount = projects.filter(
      p => p.health === 'Bloqueado' || (p.target_date && new Date(p.target_date) < now)
    ).length;
    const overdueCount = tasks.filter(t => t.is_overdue === 'Si').length;
    const uniqueClients = new Set(projects.map(p => p.client_alias)).size;
    
    const totalValueUSD = projects.reduce((acc, p) => acc + (normalizeToUSD(p.business_value, p.currency) ?? 0), 0);
    const blockedValueUSD = projects
      .filter(p => p.health === 'Bloqueado')
      .reduce((acc, p) => acc + (normalizeToUSD(p.business_value, p.currency) ?? 0), 0);

    // Data Anomalies
    const projectsWithoutDates = projects.filter(p => !p.target_date).length;
    const projectsWithoutStartDate = projects.filter(p => !p.start_date).length;
    const projectsWithoutValue = projects.filter(p => !p.business_value).length;
    const projectsWithoutNextStep = projects.filter(p => !p.next_step || !p.next_step.trim()).length;
    const zombieProjects = projects.filter(p => p.health === 'Sano' && p.open_tasks === '0' && p.status === 'Activo').length;

    // Motor de priorización (ver src/engine.ts): valor en riesgo + tipo de
    // bloqueo (externo/interno) + carga del dueño + acción recomendada.
    // Aplanamos el resultado para conservar compatibilidad con la UI.
    const rankedRich = rankProjects(projects, tasks, team, { today: now });
    const summary = summarizePortfolio(rankedRich);
    const rankedProjects = rankedRich.map(r => ({
      ...r.project,
      priority_score: r.score,
      assigned_priority: r.assignedPriority,
      is_overdue_actual: (r.daysLate ?? 0) > 0,
      days_late: r.daysLate,
      blocker_type: r.blockerType,
      owner_load: r.ownerLoad,
      value_at_risk: r.valueAtRisk,
      has_next_step: r.hasNextStep,
      primary_action: r.primaryAction,
      score_explanation: explainScore(r),
    }));

    // Carga del equipo (para el cuello de botella en el Home).
    const teamLoad = team
      .map(m => ({ alias: m.member_alias, open: parseInt(m.open_tasks_assigned, 10) || 0 }))
      .sort((a, b) => b.open - a.open);
    const totalOpenTasks = teamLoad.reduce((acc, m) => acc + m.open, 0);
    const topOwner = teamLoad[0] || { alias: '—', open: 0 };
    const topOwnerShare = totalOpenTasks ? Math.round((topOwner.open / totalOpenTasks) * 100) : 0;

    return { 
      blockedCount, 
      overdueProjectsCount,
      criticalProjectsCount,
      overdueCount,
      rankedProjects,
      uniqueClients, 
      totalValueUSD, 
      blockedValueUSD,
      summary,
      topOwner,
      topOwnerShare,
      totalOpenTasks,
      projectsWithoutDates,
      projectsWithoutStartDate,
      projectsWithoutValue,
      projectsWithoutNextStep,
      zombieProjects
    };
  }, [projects, tasks, team]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = p.client_alias.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.project_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesHealth = filterHealth === 'all' || p.health === filterHealth;
      const matchesOwner = filterOwner === 'all' || p.owner_alias === filterOwner;
      const matchesClient = filterClient === 'all' || p.client_alias === filterClient;
      return matchesSearch && matchesHealth && matchesOwner && matchesClient;
    });
  }, [projects, searchQuery, filterHealth, filterOwner, filterClient]);

  const uniqueOwners = useMemo(() => {
    const availableProjects = projects.filter(p => {
      const matchesSearch = p.client_alias.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.project_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesHealth = filterHealth === 'all' || p.health === filterHealth;
      const matchesClient = filterClient === 'all' || p.client_alias === filterClient;
      return matchesSearch && matchesHealth && matchesClient;
    });
    return Array.from(new Set(availableProjects.map(p => p.owner_alias))).sort();
  }, [projects, searchQuery, filterHealth, filterClient]);

  const uniqueClients = useMemo(() => {
    const availableProjects = projects.filter(p => {
      const matchesSearch = p.client_alias.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.project_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesHealth = filterHealth === 'all' || p.health === filterHealth;
      const matchesOwner = filterOwner === 'all' || p.owner_alias === filterOwner;
      return matchesSearch && matchesHealth && matchesOwner;
    });
    return Array.from(new Set(availableProjects.map(p => p.client_alias))).sort();
  }, [projects, searchQuery, filterHealth, filterOwner]);

  const uniqueHealths = useMemo(() => {
    const availableProjects = projects.filter(p => {
      const matchesSearch = p.client_alias.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.project_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesOwner = filterOwner === 'all' || p.owner_alias === filterOwner;
      const matchesClient = filterClient === 'all' || p.client_alias === filterClient;
      return matchesSearch && matchesOwner && matchesClient;
    });
    return Array.from(new Set(availableProjects.map(p => p.health))).sort();
  }, [projects, searchQuery, filterOwner, filterClient]);

  const filteredValue = useMemo(() => {
    return filteredProjects.reduce((acc, p) => acc + (normalizeToUSD(p.business_value, p.currency) ?? 0), 0);
  }, [filteredProjects]);

  const handleSaveProject = (data: Partial<Project>) => {
    if (selectedProject) {
      setProjects(prev => prev.map(p => p.project_code === selectedProject.project_code ? { ...p, ...data } : p));
    } else {
      const newProject: Project = {
        ...data as Project,
        project_code: `PRJ-${String(projects.length + 1).padStart(2, '0')}`,
        open_tasks: '0',
        overdue_tasks: '0',
        currency: 'USD',
        stage: 'Descubrimiento',
        status: 'Activo',
        recent_completed_examples: '',
      };
      setProjects(prev => [newProject, ...prev]);
    }
  };

  const openEdit = (p: Project) => {
    setSelectedProject(p);
    setIsModalOpen(true);
  };

  const openNew = () => {
    setSelectedProject(null);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Topbar */}
      <header className="sticky top-0 z-50 bg-bg border-border border-b px-4 md:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-brand" />
          <h1 className="text-lg font-extrabold tracking-tight">
            Aztec <span className="text-muted font-medium ml-1">· Operaciones</span>
          </h1>
        </div>

        <nav className="flex bg-surface border border-border p-1 rounded-full overflow-x-auto">
          {[
            { id: 'home', label: 'Resumen', icon: Target, desc: 'Centro de operaciones: qué atender hoy, colas de escalar/desarrollar, cuello de botella y calidad de datos.' },
            { id: 'prioritization', label: 'Priorización', icon: LayoutDashboard, desc: 'Ranking completo por valor en riesgo + briefing operativo generado con IA.' },
            { id: 'team', label: 'Equipo', icon: Users, desc: 'Carga de trabajo por persona; identifica al cuello de botella.' },
            { id: 'portfolio', label: 'Portafolio', icon: Briefcase, desc: 'Ver, buscar, crear y editar todos los proyectos.' },
          ].map((tab) => (
            <button
              key={tab.id}
              title={tab.desc}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap",
                activeTab === tab.id 
                  ? "bg-forest text-white" 
                  : "text-muted hover:text-ink hover:bg-bg"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.section
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12 py-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                <div className="max-w-2xl">
                  <h2 className="text-4xl font-extrabold tracking-tight mb-4 text-forest">
                    Panorama del Portafolio
                  </h2>
                  <p className="text-lg text-muted leading-relaxed">
                    El portafolio está en <span className="text-critical font-bold">crisis operativa</span>: {Math.round((stats.blockedCount / projects.length) * 100)}% de los proyectos están bloqueados y el {Math.round((stats.overdueCount / tasks.length) * 100)}% de las tareas están vencidas.
                  </p>
                </div>
                <div className="card bg-critical/5 border-critical/20 p-6 flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-black text-critical tracking-widest inline-flex items-center gap-1">Valor Atrapado <InfoTip text="Dinero total (USD) comprometido en proyectos bloqueados. Es lo que está en riesgo de perderse si no se destraban." /></span>
                  <span className="mono text-3xl font-bold text-critical">${Math.round(stats.blockedValueUSD / 1000)}k USD</span>
                  <span className="text-xs text-muted">En proyectos bloqueados</span>
                </div>
              </div>

              {/* La jugada operativa: dos colas + cuello de botella */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setSelectedQueue(q => q === 'escalation' ? null : 'escalation')}
                    className={cn(
                      "card p-5 border-blue-100 flex flex-col gap-1 text-left transition-all hover:border-blue-300",
                      selectedQueue === 'escalation' && "ring-2 ring-blue-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-blue-700">A escalar <InfoTip text="Cuenta los proyectos BLOQUEADOS cuyo bloqueo es externo (cliente, accesos, credenciales). No se resuelven programando: hay que gestionarlos." /></span>
                      <ArrowUpRight className="w-4 h-4 text-blue-700" />
                    </div>
                    <span className="mono text-3xl font-bold text-blue-700">{stats.summary.escalationQueue.length}</span>
                    <span className="text-xs text-muted">Bloqueo externo → acción comercial, no desarrollo</span>
                    <span className="text-[11px] font-bold text-blue-700 mt-1">{selectedQueue === 'escalation' ? '▲ Ocultar proyectos' : '▼ Ver proyectos'}</span>
                  </button>

                  <button
                    onClick={() => setSelectedQueue(q => q === 'development' ? null : 'development')}
                    className={cn(
                      "card p-5 border-purple-100 flex flex-col gap-1 text-left transition-all hover:border-purple-300",
                      selectedQueue === 'development' && "ring-2 ring-purple-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-purple-700">A desarrollar <InfoTip text="Cuenta los proyectos BLOQUEADOS cuyo bloqueo es interno: un problema técnico que el equipo sí puede resolver." /></span>
                      <Settings2 className="w-4 h-4 text-purple-700" />
                    </div>
                    <span className="mono text-3xl font-bold text-purple-700">{stats.summary.developmentQueue.length}</span>
                    <span className="text-xs text-muted">Bloqueo interno → trabajo del equipo</span>
                    <span className="text-[11px] font-bold text-purple-700 mt-1">{selectedQueue === 'development' ? '▲ Ocultar proyectos' : '▼ Ver proyectos'}</span>
                  </button>

                  <div
                    onClick={() => setActiveTab('team')}
                    className="card p-5 border-critical/20 bg-critical/[0.03] flex flex-col gap-1 cursor-pointer hover:border-critical/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-critical">Cuello de botella <InfoTip text="La persona con más tareas abiertas del equipo. El % son sus tareas sobre el total del equipo. La operación no avanza más rápido que ella. Clic para ir a Equipo." /></span>
                      <Users className="w-4 h-4 text-critical" />
                    </div>
                    <span className="text-xl font-bold text-critical leading-tight">{stats.topOwner.alias}</span>
                    <span className="text-xs text-muted">{stats.topOwner.open} de {stats.totalOpenTasks} tareas del equipo ({stats.topOwnerShare}%) → reasignar</span>
                  </div>
                </div>

                {/* Detalle: qué proyectos hay en la cola seleccionada */}
                <AnimatePresence>
                  {selectedQueue && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={cn(
                        "card p-5 space-y-3",
                        selectedQueue === 'escalation' ? "border-blue-200 bg-blue-50/30" : "border-purple-200 bg-purple-50/30"
                      )}>
                        <div className="flex items-center justify-between">
                          <h4 className="font-extrabold text-sm">
                            {selectedQueue === 'escalation' ? 'Proyectos a escalar — bloqueo externo' : 'Proyectos a desarrollar — bloqueo interno'}
                          </h4>
                          <button onClick={() => setSelectedQueue(null)} className="text-xs font-bold uppercase tracking-widest text-muted hover:text-ink">Cerrar</button>
                        </div>
                        <p className="text-xs text-muted">
                          {selectedQueue === 'escalation'
                            ? 'Detenidos esperando a un tercero (cliente, accesos, credenciales). La acción es escalar/gestionar, no programar.'
                            : 'Detenidos por un problema técnico que el equipo puede resolver.'}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(selectedQueue === 'escalation' ? stats.summary.escalationQueue : stats.summary.developmentQueue).map(r => (
                            <div
                              key={r.project.project_code}
                              onClick={() => openEdit(r.project)}
                              className="bg-surface rounded-lg p-3 border border-border hover:border-forest/40 cursor-pointer flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="mono text-[10px] font-bold bg-bg px-1.5 py-0.5 rounded border border-border">{r.project.project_code}</span>
                                  <span className="font-bold text-sm truncate">{r.project.client_alias}</span>
                                </div>
                                <p className="text-[11px] text-muted mt-0.5 truncate">{r.project.owner_alias} · {r.project.project_name}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted flex-none" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Necesita atención hoy — el foco operativo (motor de priorización) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted inline-flex items-center gap-1.5">Necesita atención hoy <InfoTip text="Los 3 proyectos más prioritarios según el motor. Empieza por el #1. Haz clic en cualquiera para ver o editar sus detalles." /></h3>
                  <button
                    onClick={() => setActiveTab('prioritization')}
                    className="text-xs font-bold text-forest hover:underline flex items-center gap-1"
                  >
                    Ver ranking completo <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2">
                  {stats.rankedProjects.slice(0, 3).map((project, idx) => (
                    <div
                      key={project.project_code}
                      onClick={() => openEdit(project)}
                      className="card py-4 flex items-center justify-between gap-4 group hover:border-forest/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <span className="mono text-lg font-black text-forest/30 w-6">{idx + 1}</span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="mono text-[10px] font-bold bg-bg px-1.5 py-0.5 rounded border border-border">{project.project_code}</span>
                            <span className="font-bold text-sm">{project.client_alias}</span>
                            <span className="text-xs text-muted">· {project.owner_alias}</span>
                          </div>
                          <p className="text-xs text-muted mt-1">
                            → {project.has_next_step ? project.next_step : `Sugerido: ${project.primary_action}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border hidden sm:block",
                          project.blocker_type === 'Externo' ? "bg-blue-50 text-blue-700 border-blue-100" :
                          project.blocker_type === 'Interno' ? "bg-purple-50 text-purple-700 border-purple-100" :
                          "bg-bg text-muted border-border"
                        )}>
                          {project.blocker_type === 'Externo' ? 'Escalar' : project.blocker_type === 'Interno' ? 'Desarrollar' : '—'}
                        </span>
                        <div className="text-right">
                          <span className="mono text-lg font-bold text-critical leading-none block">{Math.round(project.priority_score)}</span>
                          <span className="text-[9px] text-muted uppercase tracking-wide">score</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calidad de datos (anomalías operativas) */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted">Calidad de Datos · requieren limpieza <InfoTip text="Proyectos con información incompleta o sospechosa: sin fecha, sin valor, sin siguiente paso, o 'zombie' (sanos pero sin tareas y con fecha vencida). Haz clic en un número para ver cuáles." /></span>
                  <Ban className="w-4 h-4 text-warning" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { t: 'nextstep', label: 'Sin siguiente paso', val: stats.projectsWithoutNextStep },
                    { t: 'dates', label: 'Sin Fecha Target', val: stats.projectsWithoutDates },
                    { t: 'value', label: 'Sin valor de negocio', val: stats.projectsWithoutValue },
                    { t: 'zombie', label: 'Proyectos zombie', val: stats.zombieProjects },
                  ].map(a => (
                    <button
                      key={a.t}
                      onClick={() => setSelectedAnomalyType(a.t as 'dates' | 'value' | 'zombie' | 'nextstep')}
                      className="bg-bg rounded-lg p-3 border border-border hover:border-warning/50 transition-colors text-left"
                    >
                      <div className="mono text-2xl font-bold text-warning">{a.val}</div>
                      <div className="text-[11px] text-muted mt-0.5">{a.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Anomaly Details Overlay */}
              <AnimatePresence>
                {selectedAnomalyType && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="card border-warning/30 bg-warning/[0.02] p-8 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-extrabold flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-warning" />
                            Detalle de Anomalía: {
                              selectedAnomalyType === 'dates' ? 'Proyectos sin Fecha Target' :
                              selectedAnomalyType === 'value' ? 'Proyectos sin Valor de Negocio' :
                              selectedAnomalyType === 'nextstep' ? 'Proyectos sin Siguiente Paso' :
                              'Proyectos Zombie Detectados'
                            }
                          </h3>
                          <p className="text-sm text-muted mt-1">
                            {
                              selectedAnomalyType === 'dates' ? 'Proyectos activos que no tienen un target_date definido. Riesgo: Cronograma infinito.' :
                              selectedAnomalyType === 'value' ? 'Proyectos sin business_value. Riesgo: No se pueden priorizar por impacto económico.' :
                              selectedAnomalyType === 'nextstep' ? 'Proyectos sin un siguiente paso definido por un humano. Riesgo: no hay claridad de qué hacer. Aquí la capa de IA propondrá uno.' :
                              'Proyectos con salud "Sana" y "Activos" pero con 0 tareas abiertas. Riesgo: Proyecto estancado o no cerrado formalmente.'
                            }
                          </p>
                        </div>
                        <button 
                          onClick={() => setSelectedAnomalyType(null)}
                          className="text-xs font-bold uppercase tracking-widest text-muted hover:text-ink"
                        >
                          Cerrar Detalle
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects
                          .filter(p => {
                            if (selectedAnomalyType === 'dates') return !p.target_date;
                            if (selectedAnomalyType === 'value') return !p.business_value;
                            if (selectedAnomalyType === 'nextstep') return !p.next_step || !p.next_step.trim();
                            if (selectedAnomalyType === 'zombie') return p.health === 'Sano' && p.open_tasks === '0' && p.status === 'Activo';
                            return false;
                          })
                          .map(p => (
                            <div 
                              key={p.project_code}
                              onClick={() => openEdit(p)}
                              className="card bg-surface hover:border-warning/50 transition-all cursor-pointer p-4 flex items-center justify-between group"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="mono text-[10px] font-bold bg-bg px-1 rounded">{p.project_code}</span>
                                  <span className="font-bold text-sm">{p.client_alias}</span>
                                </div>
                                <p className="text-xs text-muted line-clamp-1">{p.project_name}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted group-hover:text-warning transition-colors" />
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div 
                  onClick={() => setActiveTab('prioritization')}
                  className="card group cursor-pointer hover:border-forest transition-all duration-300 p-8 flex items-center justify-between"
                >
                  <div className="space-y-2">
                    <h3 className="text-xl font-extrabold">Ver Priorización</h3>
                    <p className="text-sm text-muted">Detecta bloqueos y tareas críticas pendientes.</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-forest text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                    <LayoutDashboard className="w-6 h-6" />
                  </div>
                </div>

                <div 
                  onClick={() => setActiveTab('portfolio')}
                  className="card group cursor-pointer hover:border-forest transition-all duration-300 p-8 flex items-center justify-between"
                >
                  <div className="space-y-2">
                    <h3 className="text-xl font-extrabold">Gestionar Portafolio</h3>
                    <p className="text-sm text-muted">Crea, edita y revisa detalles de cada proyecto.</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-brand text-forest flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {activeTab === 'prioritization' && (
            <motion.section
              key="prioritization"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Briefing operativo con IA (con fallback determinista) */}
              <div className="card border-forest/20 bg-forest/[0.03] p-6 space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-forest text-white flex items-center justify-center flex-none">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold inline-flex items-center gap-1.5">Briefing Operativo <InfoTip text="Resumen automático de qué atender hoy. Las cifras las calcula el motor; la IA solo redacta. Puedes minimizarlo o regenerarlo." /></h3>
                      <p className="text-[11px] text-muted">
                        {aiAvailable()
                          ? 'Generado con Gemini a partir del motor de priorización.'
                          : 'Modo local (sin API key): resumen determinista del motor.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {briefing && (
                      <button
                        onClick={() => setBriefingOpen(o => !o)}
                        className="btn btn-secondary gap-2 text-xs"
                      >
                        {briefingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {briefingOpen ? 'Minimizar' : 'Mostrar'}
                      </button>
                    )}
                    <button
                      onClick={handleGenerateBriefing}
                      disabled={briefingLoading}
                      className="btn btn-primary gap-2 text-xs disabled:opacity-60"
                    >
                      {briefingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {briefingLoading ? 'Generando...' : briefing ? 'Regenerar' : 'Generar briefing'}
                    </button>
                  </div>
                </div>
                {briefing && briefingOpen && (
                  <div className="space-y-5">
                    {/* Titular */}
                    <p className="text-base font-bold text-forest leading-snug">{briefing.headline}</p>

                    {/* Métricas clave */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {briefing.metrics.map((m) => (
                        <div key={m.label} className="bg-bg rounded-lg p-3 border border-border">
                          <div className="text-[10px] uppercase font-bold text-muted tracking-widest">{m.label}</div>
                          <div className="mono text-lg font-bold text-ink mt-0.5">{m.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Foco de hoy */}
                    <div>
                      <div className="text-[10px] uppercase font-black text-muted tracking-widest mb-2">Foco de hoy</div>
                      <ol className="space-y-1.5">
                        {briefing.priorities.map((p, i) => (
                          <li key={p.code} className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="mono text-xs text-muted w-4">{i + 1}</span>
                            <span className="mono text-[10px] font-bold bg-bg px-1.5 py-0.5 rounded border border-border">{p.code}</span>
                            <span className="font-semibold">{p.client}</span>
                            <span className="text-muted">→ {p.action}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Dos colas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg p-3 border border-blue-100 bg-blue-50/50">
                        <div className="text-[10px] uppercase font-black text-blue-700 tracking-widest">Cola de escalamiento</div>
                        <div className="text-sm mt-1">
                          <span className="mono font-bold text-blue-700">{briefing.escalation}</span> proyectos · dependencia externa → acción comercial, no desarrollo
                        </div>
                      </div>
                      <div className="rounded-lg p-3 border border-purple-100 bg-purple-50/50">
                        <div className="text-[10px] uppercase font-black text-purple-700 tracking-widest">Cola de desarrollo</div>
                        <div className="text-sm mt-1">
                          <span className="mono font-bold text-purple-700">{briefing.development}</span> proyectos · bloqueo interno → trabajo del equipo
                        </div>
                      </div>
                    </div>

                    {/* Cuello de botella */}
                    <div className="flex items-start gap-2 rounded-lg p-3 border border-critical/20 bg-critical/[0.03]">
                      <AlertTriangle className="w-4 h-4 text-critical flex-none mt-0.5" />
                      <div className="text-sm"><span className="font-bold">Cuello de botella:</span> {briefing.bottleneck}</div>
                    </div>

                    {/* Recomendación */}
                    <div className="flex items-start gap-2">
                      <ArrowUpRight className="w-4 h-4 text-forest flex-none mt-0.5" />
                      <div className="text-sm"><span className="font-bold">Recomendación:</span> {briefing.recommendation}</div>
                    </div>

                    {/* Fuente */}
                    <span className={cn(
                      "inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border",
                      briefingSource === 'ai'
                        ? "bg-forest/10 text-forest border-forest/20"
                        : "bg-bg text-muted border-border"
                    )}>
                      {briefingSource === 'ai' ? 'Fuente: IA (Gemini)' : 'Fuente: Fallback determinista'}
                    </span>
                  </div>
                )}
              </div>

              {/* Alert Card — Punto Crítico de Control */}
              {(() => {
                const top = stats.rankedProjects[0];
                return (
                  <div
                    onClick={() => openEdit(top)}
                    className="bg-forest text-white rounded-2xl p-6 md:p-8 shadow-xl shadow-forest/10 cursor-pointer hover:bg-forest/95 transition-colors group"
                  >
                    {/* Encabezado */}
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div className="flex items-center gap-3">
                        <div className="flex-none w-9 h-9 rounded-full bg-brand flex items-center justify-center text-forest text-lg font-black">!</div>
                        <h2 className="text-mint text-xs font-extrabold uppercase tracking-widest inline-flex items-center gap-1.5">Punto Crítico de Control <InfoTip text="El proyecto #1 que requiere intervención inmediata, con sus señales clave y el próximo paso. Haz clic para editarlo." className="text-white/60" /></h2>
                      </div>
                      <div className="hidden md:flex items-center gap-1.5 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        Editar estado <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Titular */}
                    <h3 className="text-2xl md:text-3xl font-extrabold mb-3 leading-tight">
                      <span className="text-brand">{top.client_alias}</span> requiere intervención inmediata
                    </h3>

                    {/* Explicación del Score en lenguaje natural */}
                    <p className="text-sm text-mint/90 leading-relaxed mb-6 max-w-4xl">
                      {top.score_explanation}
                    </p>

                    {/* Métricas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                        <div className="text-mint/70 text-[10px] uppercase font-bold tracking-widest mb-1 inline-flex items-center gap-1">Prioridad <InfoTip text="Etiqueta calculada a partir del Score: 50 o más = Crítica, 20 o más = Alta, el resto = Baja. Resume qué tan urgente es el proyecto." className="text-mint/60" /></div>
                        <div className="font-bold text-brand">{top.assigned_priority}</div>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                        <div className="text-mint/70 text-[10px] uppercase font-bold tracking-widest mb-1 inline-flex items-center gap-1">Score <InfoTip text="Valor en riesgo del proyecto (0 a 100). Combina cuánto dinero está en juego, qué tan bloqueado está y qué tan cerca o pasada está su fecha. 100 = el más urgente del portafolio." className="text-mint/60" /></div>
                        <div className="mono font-bold text-lg leading-none">{Math.round(top.priority_score)}<span className="text-mint/50 text-xs">/100</span></div>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                        <div className="text-mint/70 text-[10px] uppercase font-bold tracking-widest mb-1 inline-flex items-center gap-1">Bloqueo <InfoTip text="Tipo de bloqueo: Externo (espera a un tercero como el cliente o un acceso → hay que escalar) o Interno (problema técnico que el equipo puede resolver → desarrollar)." className="text-mint/60" /></div>
                        <div className="font-bold text-brand">{top.blocker_type}</div>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                        <div className="text-mint/70 text-[10px] uppercase font-bold tracking-widest mb-1 inline-flex items-center gap-1">Carga del dueño <InfoTip text="Nivel de carga del responsable según sus tareas abiertas. SATURADO significa que tiene demasiadas; conviene reasignar parte de su trabajo." className="text-mint/60" /></div>
                        <div className={cn("font-bold", top.owner_load === 'SATURADO' ? "text-red-300" : "text-white")}>{top.owner_load}</div>
                      </div>
                    </div>

                    {/* Próximo paso */}
                    <div className="flex items-center gap-3 bg-brand/10 border border-brand/20 rounded-lg p-3">
                      <ArrowUpRight className="w-5 h-5 text-brand flex-none" />
                      <div>
                        <div className="text-mint/70 text-[10px] uppercase font-bold tracking-widest">Próximo paso</div>
                        <div className="font-bold text-brand">{top.primary_action}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card flex flex-col gap-1 border-critical/20">
                  <span className="mono text-3xl font-medium text-critical">{stats.criticalProjectsCount}</span>
                  <span className="text-sm text-muted">Proyectos Críticos</span>
                </div>
                <div className="card flex flex-col gap-1 border-critical/20">
                  <span className="mono text-3xl font-medium text-critical">{stats.overdueCount}</span>
                  <span className="text-sm text-muted">Tareas vencidas</span>
                </div>
                <div className="card flex flex-col gap-1 border-warning/20">
                  <span className="mono text-3xl font-medium text-warning">{stats.projectsWithoutStartDate}</span>
                  <span className="text-sm text-muted inline-flex items-center gap-1.5">Proyectos sin Fecha de Inicio <InfoTip text="Proyectos que no tienen 'start_date' (fecha de inicio) en el dataset. Sin ella no se puede medir cuánto lleva abierto el proyecto." /></span>
                </div>
              </div>

              {/* Priority Ranking */}
              <div>
                <h2 className="text-xl font-extrabold mb-4 inline-flex items-center gap-2">Ranking de Riesgo · Qué atender primero <InfoTip text="Todos los proyectos ordenados por Score (valor en riesgo), del más al menos urgente. Cada fila muestra el bloqueo, la carga del dueño y el siguiente paso." /></h2>
                <div className="space-y-2">
                  {stats.rankedProjects.slice(0, 8).map((project, idx) => {
                    return (
                      <div
                        key={project.project_code}
                        onClick={() => openEdit(project)}
                        className="card py-4 flex items-center justify-between gap-4 group hover:border-forest/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <span className="mono text-xs text-muted w-4">{idx + 1}</span>
                          <div className="flex flex-col flex-1 gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="mono text-xs font-medium bg-bg px-1.5 py-0.5 rounded border border-border">{project.project_code}</span>
                              <span className="font-bold text-sm">{project.client_alias}</span>
                              <span className="text-xs text-muted">· {project.owner_alias}</span>
                              {project.is_overdue_actual && (
                                <span className="bg-critical/10 text-critical text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-critical/20 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Vencido {project.days_late}d
                                </span>
                              )}
                            </div>
                            {/* Señales del motor: tipo de bloqueo · carga del dueño · acción sugerida */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {project.blocker_type !== 'N/A' && (
                                <span className={cn(
                                  "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border",
                                  project.blocker_type === 'Externo'
                                    ? "bg-blue-50 text-blue-700 border-blue-100"
                                    : "bg-purple-50 text-purple-700 border-purple-100"
                                )}>
                                  {project.blocker_type === 'Externo' ? 'Escalar · Externo' : 'Desarrollar · Interno'}
                                </span>
                              )}
                              <span className={cn(
                                "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border",
                                project.owner_load === 'SATURADO' ? "bg-critical/10 text-critical border-critical/20" :
                                project.owner_load === 'Alto' ? "bg-warning/10 text-warning border-warning/20" :
                                "bg-bg text-muted border-border"
                              )}>
                                Carga {project.owner_load}
                              </span>
                              <span className="text-[10px] text-muted italic">
                                → {project.has_next_step ? project.next_step : `Sugerido: ${project.primary_action}`}
                              </span>
                            </div>
                            <div className="h-2 w-full max-w-md bg-bg rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full transition-all duration-1000",
                                  project.assigned_priority === 'Critica' ? "bg-critical" :
                                  project.assigned_priority === 'Alta' ? "bg-warning" : "bg-good"
                                )}
                                style={{ width: `${Math.min(100, Math.max(0, project.priority_score))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className={cn(
                              "text-[9px] font-black uppercase px-1.5 py-0.5 rounded border mb-1 block w-fit ml-auto",
                              project.assigned_priority === 'Critica' ? "bg-critical/10 text-critical border-critical/20" :
                              project.assigned_priority === 'Alta' ? "bg-warning/10 text-warning border-warning/20" :
                              "bg-good/10 text-good border-good/20"
                            )}>
                              {project.assigned_priority}
                            </span>
                            <span className="mono text-[10px] text-muted block leading-none">Score: {Math.round(project.priority_score)}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted group-hover:text-ink translate-x-0 group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Critical Actions Table */}
              <div>
                <h2 className="text-xl font-extrabold mb-4 inline-flex items-center gap-2">Acciones Críticas sin Iniciar <InfoTip text="Tareas de prioridad crítica que todavía no han empezado, con su fecha y responsable. Son focos rojos concretos." /></h2>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm bg-surface">
                    <thead className="bg-bg text-muted uppercase text-[0.7rem] font-bold tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Tarea</th>
                        <th className="px-6 py-3">Proyecto</th>
                        <th className="px-6 py-3">Owner</th>
                        <th className="px-6 py-3">Fecha Límite</th>
                        <th className="px-6 py-3">Descripción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tasks.filter(t => t.priority === 'Critica' && t.status === 'Por hacer').slice(0, 6).map(task => (
                        <tr key={task.task_code} className="hover:bg-bg/50 transition-colors">
                          <td className="px-6 py-4 mono font-medium">{task.task_code}</td>
                          <td className="px-6 py-4 font-bold">{task.client_alias}</td>
                          <td className="px-6 py-4 text-muted">{task.assignee_alias}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-critical font-semibold">
                              <Clock className="w-3.5 h-3.5" />
                              {task.due_date}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted line-clamp-1 max-w-xs">{task.title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.section>
          )}

          {activeTab === 'team' && (
            <motion.section
              key="team"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold inline-flex items-center gap-2">Carga Operativa por Responsable <InfoTip text="Cuánto trabajo tiene cada persona: proyectos, tareas abiertas, tareas bloqueadas y cuántas son de alta prioridad. La persona resaltada es el cuello de botella." /></h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {team.map((member) => (
                  <div 
                    key={member.member_alias} 
                    className={cn(
                      "card relative overflow-hidden group transition-all duration-300",
                      member.member_alias === 'Camila Torres' && "border-critical ring-2 ring-critical/20 shadow-xl shadow-critical/5",
                      parseInt(member.high_or_critical_open) > 15 && member.member_alias !== 'Camila Torres' && "border-critical/30 bg-critical/[0.02]"
                    )}
                  >
                    {member.member_alias === 'Camila Torres' && (
                      <div className="absolute top-0 right-0 px-3 py-1 bg-critical text-white text-[10px] font-black uppercase tracking-widest">
                        Cuello de Botella
                      </div>
                    )}
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-bold">{member.member_alias}</h3>
                        <p className="text-xs text-muted">{member.role}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-muted tracking-wider">Portafolio</span>
                        <span className="mono text-lg font-medium">{member.projects_in_portfolio}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-muted tracking-wider">Tareas Abiertas</span>
                        <span className="mono text-lg font-medium">{member.open_tasks_assigned}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide">
                          <span>Salud del Backlog</span>
                          <span className={parseInt(member.blocked_tasks_assigned) > 5 ? "text-critical" : "text-muted"}>
                            {member.blocked_tasks_assigned} Bloqueadas
                          </span>
                        </div>
                        <div className="h-2 bg-bg rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-forest transition-all duration-1000" 
                            style={{ width: `${(parseInt(member.high_or_critical_open) / parseInt(member.open_tasks_assigned)) * 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted font-medium italic">
                          {member.high_or_critical_open} de las tareas son Alta/Crítica
                        </p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <div className="px-2 py-1 rounded bg-bg border border-border text-[10px] font-bold text-muted">
                          {member.proyecto_projects} Proyectos
                        </div>
                        <div className="px-2 py-1 rounded bg-bg border border-border text-[10px] font-bold text-muted">
                          {member.diagnostico_projects} Diag.
                        </div>
                        <div className="px-2 py-1 rounded bg-bg border border-border text-[10px] font-bold text-muted">
                          {member.mantenimiento_projects} Mant.
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {activeTab === 'portfolio' && (
            <motion.section
              key="portfolio"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <h2 className="text-xl font-extrabold inline-flex items-center gap-2">Portafolio de Operaciones <InfoTip text="Todos los proyectos. Busca por cliente o código, filtra por salud/responsable/cliente, y haz clic en una fila para editar. 'Nuevo Proyecto' crea uno; 'Restablecer' vuelve a los datos originales." /></h2>
                  <p className="text-xs text-muted mt-1">
                    Visualizando <span className="font-bold text-ink">{filteredProjects.length}</span> de {projects.length} proyectos · 
                    Valor filtrado: <span className="font-bold text-forest">${Math.round(filteredValue / 1000)}k USD</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                   <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input 
                      type="text" 
                      placeholder="Buscar cliente o código..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-surface border border-border rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10 w-full md:w-64"
                    />
                   </div>
                   <button
                     onClick={openNew}
                     className="btn btn-primary gap-2 text-xs"
                   >
                     <Plus className="w-4 h-4" />
                     Nuevo Proyecto
                   </button>
                   <button
                     onClick={handleResetData}
                     title="Restablece los datos a la semilla original"
                     className="btn btn-secondary gap-2 text-xs"
                   >
                     <RotateCcw className="w-4 h-4" />
                     Restablecer
                   </button>
                </div>
              </div>

              {/* Advanced Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-bg rounded-xl border border-border">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-1">Salud</label>
                  <select 
                    value={filterHealth}
                    onChange={(e) => setFilterHealth(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="all">Todas las condiciones ({uniqueHealths.length})</option>
                    {uniqueHealths.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-1">Responsable</label>
                  <select 
                    value={filterOwner}
                    onChange={(e) => setFilterOwner(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="all">Todos los owners</option>
                    {uniqueOwners.map(owner => (
                      <option key={owner} value={owner}>{owner}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-1">Cliente</label>
                  <select 
                    value={filterClient}
                    onChange={(e) => setFilterClient(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="all">Todos los clientes</option>
                    {uniqueClients.map(client => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
                <table className="w-full text-left text-xs bg-surface border-separate border-spacing-0">
                  <thead className="bg-bg text-muted uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4 border-b border-border">Código</th>
                      <th className="px-6 py-4 border-b border-border">Cliente</th>
                      <th className="px-6 py-4 border-b border-border">Engagement</th>
                      <th className="px-6 py-4 border-b border-border">Tipo API</th>
                      <th className="px-6 py-4 border-b border-border">Salud</th>
                      <th className="px-6 py-4 border-b border-border text-right">Valor</th>
                      <th className="px-6 py-4 border-b border-border">Owner</th>
                      <th className="px-6 py-4 border-b border-border">Bloqueos</th>
                      <th className="px-6 py-4 border-b border-border"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredProjects.map((project) => (
                      <tr 
                        key={project.project_code} 
                        className="hover:bg-bg/40 transition-colors group cursor-pointer"
                        onClick={() => openEdit(project)}
                      >
                        <td className="px-6 py-5 mono font-bold text-ink">{project.project_code}</td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-sm text-ink">{project.client_alias}</span>
                            <span className="text-muted line-clamp-1 max-w-[200px]">{project.project_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={cn(
                            "status-pill",
                            project.engagement_type === 'Proyecto' ? "bg-blue-50 text-blue-700" :
                            project.engagement_type === 'Diagnostico' ? "bg-emerald-50 text-emerald-700" :
                            "bg-orange-50 text-orange-700"
                          )}>
                            {project.engagement_type}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight",
                            project.project_type_api === 'Automatizacion' ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-blue-50 text-blue-700 border border-blue-100"
                          )}>
                            {project.project_type_api}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          {(() => {
                            const now = new Date('2026-07-29');
                            const isOverdue = project.target_date && new Date(project.target_date) < now;
                            return (
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-2 h-2 rounded-full",
                                  (project.health === 'Bloqueado' || isOverdue) ? "bg-critical animate-pulse" : 
                                  project.health === 'En riesgo' ? "bg-warning" : "bg-good"
                                )} />
                                <span className={cn("font-bold", isOverdue && "text-critical")}>
                                  {isOverdue ? 'Vencido' : project.health}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-5 text-right mono font-medium">
                          {project.business_value ? `${project.business_value} ${project.currency}` : '—'}
                        </td>
                        <td className="px-6 py-5 text-muted">{project.owner_alias}</td>
                        <td className="px-6 py-5 max-w-xs">
                          <p className="text-muted line-clamp-2 italic leading-relaxed">
                            {project.blockers || <span className="text-good opacity-50 not-italic">Sin bloqueos activos</span>}
                          </p>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <button className="p-2 hover:bg-bg rounded-lg text-muted hover:text-forest transition-colors">
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <ProjectModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveProject}
        initialData={selectedProject}
      />
    </div>
  );
}
