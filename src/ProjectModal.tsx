import React, { useState, useEffect } from 'react';
import { X, Save, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Project, ProjectHealth, EngagementType } from './types';
import { suggestNextStep, aiAvailable } from './ai';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Partial<Project>) => void;
  initialData?: Project | null;
}

export default function ProjectModal({ isOpen, onClose, onSave, initialData }: ProjectModalProps) {
  const [formData, setFormData] = useState<Partial<Project>>({
    project_code: '',
    client_alias: '',
    project_name: '',
    engagement_type: 'Proyecto',
    health: 'Sano',
    owner_alias: '',
    target_date: '',
    next_step: '',
    blockers: '',
    summary: '',
    business_value: '',
    currency: 'USD',
    stage: 'Ejecucion',
    project_type_api: 'Automatizacion'
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        project_code: '',
        client_alias: '',
        project_name: '',
        engagement_type: 'Proyecto',
        project_type_api: 'Automatizacion',
        health: 'Sano',
        owner_alias: '',
        target_date: '',
        blockers: '',
        summary: '',
        business_value: '',
        currency: 'USD',
        stage: 'Ejecucion'
      });
    }
  }, [initialData, isOpen]);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestSource, setSuggestSource] = useState<'ai' | 'fallback' | null>(null);

  const handleSuggestNextStep = async () => {
    setSuggesting(true);
    try {
      const { nextStep, source } = await suggestNextStep(formData);
      setFormData(prev => ({ ...prev, next_step: nextStep }));
      setSuggestSource(source);
    } finally {
      setSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface z-[70] shadow-2xl flex flex-col"
          >
            <header className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-extrabold">{initialData ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
              <button onClick={onClose} className="p-2 hover:bg-bg rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-muted">Código de Proyecto</label>
                <input
                  required
                  type="text"
                  value={formData.project_code}
                  onChange={e => setFormData({ ...formData, project_code: e.target.value })}
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  placeholder="Ej. PRJ-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Alias del Cliente</label>
                  <input
                    required
                    type="text"
                    value={formData.client_alias}
                    onChange={e => setFormData({ ...formData, client_alias: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                    placeholder="Ej. Atlas Foods"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Nombre del Proyecto</label>
                  <input
                    required
                    type="text"
                    value={formData.project_name}
                    onChange={e => setFormData({ ...formData, project_name: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                    placeholder="Ej. Global Contract Management"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Tipo de Engagement</label>
                  <select
                    value={formData.engagement_type}
                    onChange={e => setFormData({ ...formData, engagement_type: e.target.value as EngagementType })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="Proyecto">Proyecto</option>
                    <option value="Mantenimiento o recurrente">Mantenimiento</option>
                    <option value="Diagnostico">Diagnóstico</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Tipo de API</label>
                  <select
                    value={formData.project_type_api}
                    onChange={e => setFormData({ ...formData, project_type_api: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="Automatizacion">Automatización</option>
                    <option value="Consultoria">Consultoría</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Salud Operativa</label>
                  <select
                    value={formData.health}
                    onChange={e => setFormData({ ...formData, health: e.target.value as ProjectHealth })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="Sano">Sano</option>
                    <option value="En riesgo">En Riesgo</option>
                    <option value="Bloqueado">Bloqueado</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Etapa</label>
                  <select
                    value={formData.stage}
                    onChange={e => setFormData({ ...formData, stage: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="Ejecucion">Ejecución</option>
                    <option value="Descubrimiento">Descubrimiento</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5 col-span-1">
                  <label className="text-[10px] uppercase font-bold text-muted">Moneda</label>
                  <select
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  >
                    <option value="USD">USD</option>
                    <option value="COP">COP</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] uppercase font-bold text-muted">Valor de Negocio</label>
                  <input
                    type="number"
                    value={formData.business_value}
                    onChange={e => setFormData({ ...formData, business_value: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                    placeholder="Ej. 25000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Responsable (Alias)</label>
                  <input
                    required
                    type="text"
                    value={formData.owner_alias}
                    onChange={e => setFormData({ ...formData, owner_alias: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                    placeholder="Ej. Daniel Rojas"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted">Fecha Límite</label>
                  <input
                    type="date"
                    value={formData.target_date || ''}
                    onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold text-muted">Siguiente Paso</label>
                  <button
                    type="button"
                    onClick={handleSuggestNextStep}
                    disabled={suggesting}
                    title={aiAvailable() ? 'Sugerir con Gemini' : 'Sugerir (modo local, sin API key)'}
                    className="flex items-center gap-1 text-[10px] font-bold text-forest hover:underline disabled:opacity-60"
                  >
                    {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {suggesting ? 'Sugiriendo...' : 'Sugerir con IA'}
                  </button>
                </div>
                <input
                  type="text"
                  value={formData.next_step || ''}
                  onChange={e => setFormData({ ...formData, next_step: e.target.value })}
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  placeholder="Ej. Escalar acceso pendiente con el cliente..."
                />
                {suggestSource && (
                  <span className="text-[9px] text-muted">
                    {suggestSource === 'ai' ? 'Sugerido por IA (Gemini) · edítalo si quieres' : 'Sugerido en modo local · edítalo si quieres'}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-muted">Bloqueos y Notas Técnicas</label>
                <textarea
                  rows={3}
                  value={formData.blockers || ''}
                  onChange={e => setFormData({ ...formData, blockers: e.target.value })}
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  placeholder="Describa dependencias externas o cuellos de botella..."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-muted">Resumen Ejecutivo</label>
                <textarea
                  rows={2}
                  value={formData.summary}
                  onChange={e => setFormData({ ...formData, summary: e.target.value })}
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/10"
                  placeholder="Objetivo principal del proyecto..."
                />
              </div>
            </form>

            <footer className="p-6 border-t border-border flex items-center justify-end gap-3 bg-bg/30">
              <button onClick={onClose} className="btn btn-secondary text-sm">Cancelar</button>
              <button onClick={handleSubmit} className="btn btn-primary gap-2 text-sm">
                <Save className="w-4 h-4" />
                Guardar Cambios
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
