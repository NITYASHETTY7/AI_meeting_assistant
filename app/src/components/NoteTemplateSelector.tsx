import { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, Check, Sparkles, Trash2, Pencil,
  FileText, UserCheck, Briefcase, BarChart3, Target, UserX, Users
} from 'lucide-react';
import { useAppStore, type MeetingTemplateId } from '../store/useAppStore';

interface NoteTemplateSelectorProps {
  meetingId: string;
  currentTemplateId?: MeetingTemplateId;
}

interface TemplateOption {
  id: MeetingTemplateId;
  label: string;
  description: string;
  icon: typeof FileText;
  badge?: string;
}

export interface StoredCustomTemplate {
  id: string;
  label: string;
  description: string;
}

export function getStoredCustomTemplates(): StoredCustomTemplate[] {
  try {
    const saved = localStorage.getItem('mg_custom_note_templates');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return [];
}

export function getStoredCustomTemplate(id: string): StoredCustomTemplate | undefined {
  return getStoredCustomTemplates().find((t) => t.id === id);
}

export function deleteStoredCustomTemplate(id: string): void {
  try {
    const list = getStoredCustomTemplates().filter((t) => t.id !== id);
    localStorage.setItem('mg_custom_note_templates', JSON.stringify(list));
  } catch {}
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'default',
    label: 'Default Notes',
    description: 'Standard meeting summary, decisions, and action items',
    icon: FileText,
  },
  {
    id: 'interview',
    label: 'Interview Notes',
    description: 'Candidate scorecard, criteria rating (1-5), strengths & concerns',
    icon: UserCheck,
    badge: 'Popular'
  },
  {
    id: 'client',
    label: 'Client Meeting',
    description: 'Client requirements, pain points, feature requests & budget constraints',
    icon: Briefcase,
    badge: 'New'
  },
  {
    id: 'recruitment_metrics',
    label: 'Recruitment Metrics',
    description: 'Hiring funnel velocity, candidate pipeline & interview metrics',
    icon: BarChart3,
  },
  {
    id: 'hr_strategy',
    label: 'HR Strategy',
    description: 'Headcount planning, policy updates & organizational strategy',
    icon: Target,
  },
  {
    id: 'performance_feedback',
    label: 'Performance Feedback',
    description: '1:1 review, growth goals, achievements & constructive feedback',
    icon: UserX,
  },
  {
    id: 'team_recap',
    label: 'Team Recap',
    description: 'Sprint retro, team announcements & project sync highlights',
    icon: Users,
  },
];

export const NoteTemplateSelector = ({ meetingId, currentTemplateId = 'default' }: NoteTemplateSelectorProps) => {
  const store = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<MeetingTemplateId | null>(null);
  const [customName, setCustomName] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customTemplates, setCustomTemplates] = useState<TemplateOption[]>(() => {
    try {
      const saved = localStorage.getItem('mg_custom_note_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((t: any) => ({
          ...t,
          icon: Sparkles,
          badge: 'Custom',
        }));
      }
    } catch {}
    return [];
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allTemplates = [...TEMPLATE_OPTIONS, ...customTemplates];
  const selectedTemplate = allTemplates.find((t) => t.id === currentTemplateId) || TEMPLATE_OPTIONS[0];
  const IconComponent = selectedTemplate.icon;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (templateId: MeetingTemplateId) => {
    store.setMeetingTemplate(meetingId, templateId);
    setIsOpen(false);
  };

  const handleOpenNewModal = () => {
    setEditingTemplateId(null);
    setCustomName('');
    setCustomPrompt('');
    setShowCustomizeModal(true);
  };

  const handleEditCustomTemplate = (e: React.MouseEvent, t: { id: MeetingTemplateId; label: string; description: string }) => {
    e.stopPropagation();
    setEditingTemplateId(t.id);
    setCustomName(t.label);
    setCustomPrompt(t.description);
    setShowCustomizeModal(true);
    setIsOpen(false);
  };

  const handleDeleteCustomTemplate = (e: React.MouseEvent, templateId: MeetingTemplateId) => {
    e.stopPropagation();
    const updated = customTemplates.filter((t) => t.id !== templateId);
    setCustomTemplates(updated);
    try {
      localStorage.setItem(
        'mg_custom_note_templates',
        JSON.stringify(updated.map(({ id, label, description }) => ({ id, label, description })))
      );
    } catch {}

    if (currentTemplateId === templateId) {
      store.setMeetingTemplate(meetingId, 'default');
    }
    if (editingTemplateId === templateId) {
      setEditingTemplateId(null);
      setCustomName('');
      setCustomPrompt('');
    }
  };

  const handleSaveCustomTemplate = () => {
    if (!customName.trim()) return;

    let targetId = editingTemplateId;
    if (!targetId) {
      targetId = `custom_${Date.now()}` as MeetingTemplateId;
    }

    const newTemplate: TemplateOption = {
      id: targetId,
      label: customName.trim(),
      description: customPrompt.trim() || 'Custom instructions',
      icon: Sparkles,
      badge: 'Custom',
    };

    const exists = customTemplates.some((t) => t.id === targetId);
    const updated = exists
      ? customTemplates.map((t) => (t.id === targetId ? newTemplate : t))
      : [...customTemplates, newTemplate];

    setCustomTemplates(updated);
    try {
      localStorage.setItem('mg_custom_note_templates', JSON.stringify(updated.map(({ id, label, description }) => ({ id, label, description }))));
    } catch {}

    store.setMeetingTemplate(meetingId, targetId);
    setCustomName('');
    setCustomPrompt('');
    setEditingTemplateId(null);
    setShowCustomizeModal(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        {/* Template Selector Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 transition-colors border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm cursor-pointer"
          title="Switch note template"
        >
          <IconComponent className="w-3.5 h-3.5 text-blue-500 dark:text-sky-400" />
          <span>{selectedTemplate.label}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Customize button */}
        <button
          onClick={handleOpenNewModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Customize</span>
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-xl bg-white dark:bg-zinc-800 shadow-xl border border-zinc-200 dark:border-zinc-700/80 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-700/50 mb-1">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Select Note Template
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-700/40">
            {allTemplates.map((template) => {
              const Icon = template.icon;
              const isSelected = template.id === currentTemplateId;

              return (
                <div
                  key={template.id}
                  onClick={() => handleSelect(template.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer group ${
                    isSelected ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                        {template.label}
                      </span>
                      {template.badge && (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                          template.badge === 'Custom' 
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                        }`}>
                          {template.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {template.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {template.badge === 'Custom' && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => handleEditCustomTemplate(e, template)}
                          className="p-1 text-zinc-400 hover:text-sky-500 dark:hover:text-sky-400 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                          title="Edit custom template"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCustomTemplate(e, template.id)}
                          className="p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                          title="Delete custom template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {isSelected && (
                      <Check className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Customize Template Modal */}
      {showCustomizeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {editingTemplateId ? 'Edit Custom Template' : 'Customize Note Template'}
                </h3>
              </div>
              <button
                onClick={() => { setShowCustomizeModal(false); setEditingTemplateId(null); }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {editingTemplateId
                ? 'Update your custom template name and instructions.'
                : 'Define custom rubrics, focus questions, or formatting instructions for your meeting summaries.'}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales Discovery Call, Engineering Design Sync"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="mg-input w-full text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Custom AI Instructions / Rubrics
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Extract key technical requirements, highlight budget objections, and evaluate candidate problem solving."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="mg-input w-full text-xs"
                />
              </div>
            </div>

            {/* List of existing custom templates to manage / edit / delete */}
            {customTemplates.length > 0 && (
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block">
                    Saved Custom Templates ({customTemplates.length})
                  </label>
                  {editingTemplateId && (
                    <button
                      type="button"
                      onClick={handleOpenNewModal}
                      className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer font-medium"
                    >
                      + Create New Instead
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {customTemplates.map((t) => {
                    const isBeingEdited = editingTemplateId === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                          isBeingEdited
                            ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700'
                            : 'bg-zinc-50 dark:bg-zinc-800/80 border-zinc-200/60 dark:border-zinc-700/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1 mr-2">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{t.label}</p>
                            {isBeingEdited && (
                              <span className="text-[9px] px-1 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-bold">
                                Editing
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{t.description}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleEditCustomTemplate(e, t)}
                            className="p-1 text-zinc-400 hover:text-sky-500 dark:hover:text-sky-400 rounded transition-colors cursor-pointer"
                            title="Edit template"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomTemplate(e, t.id)}
                            className="p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors cursor-pointer"
                            title="Delete template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowCustomizeModal(false); setEditingTemplateId(null); }}
                className="mg-btn mg-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomTemplate}
                disabled={!customName.trim()}
                className="mg-btn mg-btn-primary text-xs"
              >
                {editingTemplateId ? 'Update Template' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
