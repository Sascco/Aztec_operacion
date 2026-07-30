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
  ExternalLink,
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
import { rankProjects, summarizePortfolio } from './engine';
import { generateBriefing, aiAvailable, AiSource, BriefingData } from './ai';
import { Sparkles, Loader2 } from 'lucide-react';
import ProjectModal from './ProjectModal';

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

  const handleGenerateBriefing = async () => {
    setBriefingLoading(true);
    try {
      const ranked = rankProjects(projects, tasks, team, { today: new Date('2026-07-29') });
      const summary = summarizePortfolio(ranked);
      const result = await generateBriefing(summary, ranked);
      setBriefing(result.data);
      setBriefingSource(result.source);
    } finally {
      setBriefingLoading(false);
    }
  };
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedAnomalyType, setSelectedAnomalyType] = useState<'dates' | 'value' | 'zombie' | 'nextstep' | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterHealth, setFilterHealth] = useState<string>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');

  // Derived stats
  const stats = useMemo(() => {
    const now = new Date('2026-07-29');
    const blockedCount = projects.filter(p => p.health === 'Bloqueado').length;
    const overdueProjectsCount = projects.filter(p => p.target_date && new Date(p.target_date) < now).length;
    const overdueCount = tasks.filter(t => t.is_overdue === 'Si').length;
    const criticalNoStart = tasks.filter(t => t.priority === 'Critica' && t.status === 'Por hacer').length;
    const uniqueClients = new Set(projects.map(p => p.client_alias)).size;
    
    // Normalization and Value calculation
    const normalizeToUSD = (val: string | null, curr: string) => {
      if (!val) return 0;
      const num = parseInt(val);
      if (curr === 'COP') return num / 4000;
      return num;
    };

    const totalValueUSD = projects.reduce((acc, p) => acc + normalizeToUSD(p.business_value, p.currency), 0);
    const blockedValueUSD = projects
      .filter(p => p.health === 'Bloqueado')
      .reduce((acc, p) => acc + normalizeToUSD(p.business_value, p.currency), 0);

    // Data Anomalies
    const projectsWithoutDates = projects.filter(p => !p.target_date).length;
    const projectsWithoutValue = projects.filter(p => !p.business_value).length;
    const projectsWithoutNextStep = projects.filter(p => !p.next_step || !p.next_step.trim()).length;
    const zombieProjects = projects.filter(p => p.health === 'Sano' && p.open_tasks === '0' && p.status === 'Activo').length;

    // Type Distribution
    const typeDist = {
      proyecto: projects.filter(p => p.engagement_type === 'Proyecto').length,
      mantenimiento: projects.filter(p => p.engagement_type === 'Mantenimiento o recurrente').length,
      diagnostico: projects.filter(p => p.engagement_type === 'Diagnostico').length,
    };

    const stageDist = {
      ejecucion: projects.filter(p => p.stage === 'Ejecucion').length,
      descubrimiento: projects.filter(p => p.stage === 'Descubrimiento').length,
    };

    const apiTypeDist = {
      automatizacion: projects.filter(p => p.project_type_api === 'Automatizacion').length,
      consultoria: projects.filter(p => p.project_type_api === 'Consultoria').length,
    };

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
      overdueCount, 
      criticalNoStart, 
      rankedProjects, 
      uniqueClients, 
      totalValueUSD, 
      blockedValueUSD,
      summary,
      topOwner,
      topOwnerShare,
      projectsWithoutDates,
      projectsWithoutValue,
      projectsWithoutNextStep,
      zombieProjects,
      typeDist,
      stageDist,
      apiTypeDist
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
    const normalizeToUSD = (val: string | null, curr: string) => {
      if (!val) return 0;
      const num = parseInt(val);
      if (curr === 'COP') return num / 4000;
      return num;
    };
    return filteredProjects.reduce((acc, p) => acc + normalizeToUSD(p.business_value, p.currency), 0);
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
            { id: 'home', label: 'Resumen', icon: Target },
            { id: 'prioritization', label: 'Priorización', icon: LayoutDashboard },
            { id: 'team', label: 'Equipo', icon: Users },
            { id: 'portfolio', label: 'Portafolio', icon: Briefcase },
          ].map((tab) => (
            <button
              key={tab.id}
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
                  <span className="text-[10px] uppercase font-black text-critical tracking-widest">Valor Atrapado</span>
                  <span className="mono text-3xl font-bold text-critical">${Math.round(stats.blockedValueUSD / 1000)}k USD</span>
                  <span className="text-xs text-muted">En proyectos bloqueados</span>
                </div>
              </div>

              {/* Necesita atención hoy — el foco operativo (motor de priorización) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted">Necesita atención hoy</h3>
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

              {/* La jugada operativa: dos colas + cuello de botella */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-5 border-blue-100 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-widest text-blue-700">A escalar</span>
                    <ArrowUpRight className="w-4 h-4 text-blue-700" />
                  </div>
                  <span className="mono text-3xl font-bold text-blue-700">{stats.summary.escalationQueue.length}</span>
                  <span className="text-xs text-muted">Bloqueo externo → acción comercial, no desarrollo</span>
                </div>
                <div className="card p-5 border-purple-100 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-widest text-purple-700">A desarrollar</span>
                    <Settings2 className="w-4 h-4 text-purple-700" />
                  </div>
                  <span className="mono text-3xl font-bold text-purple-700">{stats.summary.developmentQueue.length}</span>
                  <span className="text-xs text-muted">Bloqueo interno → trabajo del equipo</span>
                </div>
                <div
                  onClick={() => setActiveTab('team')}
                  className="card p-5 border-critical/20 bg-critical/[0.03] flex flex-col gap-1 cursor-pointer hover:border-critical/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-widest text-critical">Cuello de botella</span>
                    <Users className="w-4 h-4 text-critical" />
                  </div>
                  <span className="text-xl font-bold text-critical leading-tight">{stats.topOwner.alias}</span>
                  <span className="text-xs text-muted">{stats.topOwner.open} tareas · {stats.topOwnerShare}% de la carga → reasignar</span>
                </div>
              </div>

              {/* Calidad de datos (anomalías operativas) */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black uppercase tracking-widest text-muted">Calidad de Datos · requieren limpieza</span>
                  <Ban className="w-4 h-4 text-warning" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { t: 'nextstep', label: 'Sin siguiente paso', val: stats.projectsWithoutNextStep },
                    { t: 'dates', label: 'Sin fecha límite', val: stats.projectsWithoutDates },
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
                              selectedAnomalyType === 'dates' ? 'Proyectos sin Fecha Límite' :
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
                      <h3 className="font-extrabold">Briefing Operativo</h3>
                      <p className="text-[11px] text-muted">
                        {aiAvailable()
                          ? 'Generado con Gemini a partir del motor de priorización.'
                          : 'Modo local (sin API key): resumen determinista del motor.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleGenerateBriefing}
                    disabled={briefingLoading}
                    className="btn btn-primary gap-2 text-xs disabled:opacity-60"
                  >
                    {briefingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {briefingLoading ? 'Generando...' : 'Generar briefing'}
                  </button>
                </div>
                {briefing && (
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

              {/* Smart Insight AI Card */}
              <div className="card border-critical/20 bg-critical/[0.03] p-6 flex flex-col md:flex-row md:items-center gap-6">
                <div className="w-12 h-12 rounded-full bg-critical flex items-center justify-center flex-none">
                  <ArrowUpRight className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-extrabold text-critical">Insight: El valor está atrapado en lo bloqueado</h3>
                  <p className="text-sm text-ink/80 leading-relaxed">
                    Priorizar por <strong>valor ponderado por riesgo</strong>. Desbloquear <span className="underline decoration-critical font-bold">Vector Partners (PRJ-22 + PRJ-08)</span> libera <span className="font-bold">$73,000 USD</span>, lo cual impacta más que cerrar 10 diagnósticos menores. El patrón indica que el problema raíz es <strong>dependencia de terceros</strong>.
                  </p>
                </div>
              </div>

              {/* Alert Card */}
              <div 
                onClick={() => openEdit(stats.rankedProjects[0])}
                className="bg-forest text-white rounded-2xl p-6 md:p-8 flex items-start gap-6 shadow-xl shadow-forest/10 cursor-pointer hover:bg-forest/95 transition-colors group"
              >
                <div className="flex-none w-12 h-12 rounded-full bg-brand flex items-center justify-center text-forest text-xl font-black">
                  !
                </div>
                <div className="flex-1">
                  <h2 className="text-mint text-xs font-extrabold uppercase tracking-widest mb-1">Punto Crítico de Control</h2>
                  <p className="text-lg md:text-xl leading-relaxed max-w-3xl">
                    {(() => {
                      const top = stats.rankedProjects[0];
                      return (
                        <>
                          <span className="text-brand font-bold">{top.client_alias}</span> requiere intervención inmediata.
                          Estrategia: <span className="text-brand font-bold">{top.assigned_priority}</span> (Score: {Math.round(top.priority_score)}) · Bloqueo <span className="text-brand font-bold">{top.blocker_type}</span> · Dueño con carga {top.owner_load}.
                          Próximo paso: <span className="text-brand font-bold">{top.primary_action}</span>.
                        </>
                      );
                    })()}
                  </p>
                </div>
                <div className="hidden md:flex flex-none items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs font-bold">Editar Estado</span>
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card flex flex-col gap-1 border-critical/20">
                  <span className="mono text-3xl font-medium text-critical">{stats.blockedCount + stats.overdueProjectsCount}</span>
                  <span className="text-sm text-muted">Proyectos Críticos</span>
                </div>
                <div className="card flex flex-col gap-1 border-critical/20">
                  <span className="mono text-3xl font-medium text-critical">{stats.overdueCount}</span>
                  <span className="text-sm text-muted">Tareas vencidas</span>
                </div>
                <div className="card flex flex-col gap-1 border-warning/20">
                  <span className="mono text-3xl font-medium text-warning">{stats.projectsWithoutDates}</span>
                  <span className="text-sm text-muted">Proyectos sin fecha</span>
                </div>
              </div>

              {/* Priority Ranking */}
              <div>
                <h2 className="text-xl font-extrabold mb-4">Ranking de Riesgo · Qué atender primero</h2>
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
                <h2 className="text-xl font-extrabold mb-4">Acciones Críticas sin Iniciar</h2>
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
                <h2 className="text-xl font-extrabold">Carga Operativa por Responsable</h2>
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
                  <h2 className="text-xl font-extrabold">Portafolio de Operaciones</h2>
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
