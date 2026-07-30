export type EngagementType = 'Proyecto' | 'Mantenimiento o recurrente' | 'Diagnostico';
export type ProjectHealth = 'Bloqueado' | 'En riesgo' | 'Sano';
export type TaskPriority = 'Baja' | 'Media' | 'Alta' | 'Critica';
export type TaskStatus = 'Por hacer' | 'En progreso' | 'Bloqueada' | 'En revision' | 'Completada';

export interface Project {
  project_code: string;
  engagement_type: EngagementType;
  client_alias: string;
  project_name: string;
  project_type_api: string;
  stage: string;
  status: string;
  health: ProjectHealth;
  owner_alias: string;
  owner_role: string;
  start_date: string | null;
  target_date: string | null;
  business_value: string | null;
  currency: string;
  open_tasks: string;
  overdue_tasks: string;
  blockers: string | null;
  summary: string;
  recent_completed_examples: string;
  /**
   * Siguiente paso operativo. NO viene en el dataset original: es un campo que
   * el sistema exige (el reto pide guardarlo y detectar proyectos que no lo
   * tienen). Cuando está vacío, el motor sugiere uno a partir de la estrategia.
   */
  next_step?: string | null;
}

export interface Task {
  task_code: string;
  project_code: string;
  engagement_type: string;
  client_alias: string;
  project_name: string;
  assignee_alias: string;
  assignee_role: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
  is_overdue: 'Si' | 'No';
  dependency: string | null;
  title: string;
  detail: string;
  last_progress: string;
}

export interface TeamMember {
  member_alias: string;
  role: string;
  projects_in_portfolio: string;
  open_tasks_assigned: string;
  blocked_tasks_assigned: string;
  high_or_critical_open: string;
  diagnostico_projects: string;
  proyecto_projects: string;
  mantenimiento_projects: string;
}

export interface AppData {
  projects: Project[];
  tasks: Task[];
  team: TeamMember[];
}
