import { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, Check, Sparkles, 
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
  const [customName, setCustomName] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = TEMPLATE_OPTIONS.find(t => t.id === currentTemplateId) || TEMPLATE_OPTIONS[0];
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
          onClick={() => setShowCustomizeModal(true)}
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
            {TEMPLATE_OPTIONS.map((template) => {
              const Icon = template.icon;
              const isSelected = template.id === currentTemplateId;

              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer ${
                    isSelected ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-semibold ${isSelected ? 'text-sky-700 dark:text-sky-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                        {template.label}
                      </span>
                      {template.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300">
                          {template.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {template.description}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Customize Template Modal */}
      {showCustomizeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Customize Note Template</h3>
              </div>
              <button
                onClick={() => setShowCustomizeModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Define custom rubrics, focus questions, or formatting instructions for your meeting summaries.
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

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCustomizeModal(false)}
                className="mg-btn mg-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowCustomizeModal(false);
                }}
                className="mg-btn mg-btn-primary text-xs"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
