import { useState } from 'react';
import { Briefcase, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type ClientMeetingInfo, type ClientRequirement } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface ClientRequirementsPanelProps {
  meetingId: string;
  clientInfo?: ClientMeetingInfo;
}

/** Minimum words of actual transcript speech required before attempting AI extraction. */
const MIN_WORDS_FOR_EXTRACTION = 12;

const VALID_CATEGORIES: ClientRequirement['category'][] = [
  'Feature Request',
  'Constraint / Budget',
  'Feedback / Pain Point',
  'Action Item',
];
const VALID_PRIORITIES: ClientRequirement['priority'][] = ['High', 'Medium', 'Low'];

export const ClientRequirementsPanel = ({ meetingId, clientInfo }: ClientRequirementsPanelProps) => {
  const store = useAppStore();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<ClientRequirement['category']>('Feature Request');
  const [newPriority, setNewPriority] = useState<ClientRequirement['priority']>('High');

  if (!clientInfo) return null;

  const handleAddRequirement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    store.addClientRequirement(meetingId, {
      title: newTitle.trim(),
      category: newCategory,
      priority: newPriority,
      notes: 'Added manually during client discussion.',
    });
    setNewTitle('');
  };

  const handleAutoExtractAI = async () => {
    setExtractError(null);
    const meeting = useAppStore.getState().meetings.find((m) => m.id === meetingId);
    const transcript = meeting?.transcript ?? [];

    const wordCount = transcript
      .map((line) => line.text)
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    if (wordCount < MIN_WORDS_FOR_EXTRACTION) {
      setExtractError('Not enough context to extract client requirements. Record more of the meeting, then try again.');
      return;
    }

    setIsExtracting(true);
    try {
      const transcriptText = transcript
        .map((line) => `[${line.time}] ${line.speaker}: ${line.text}`)
        .join('\n');

      const provider = ProviderManager.getChatProvider();
      const reply = await provider.chat([
        {
          role: 'system',
          content:
            'You are an expert client-facing project manager assistant. You read a client meeting transcript ' +
            'and extract concrete requirements, constraints, and pain points. Respond with ONLY a valid JSON ' +
            'object, no markdown fences, no commentary, matching exactly this shape:\n' +
            '{"clientName": string | null, "projectName": string | null, ' +
            '"requirements": [{"title": string, "category": "Feature Request" | "Constraint / Budget" | ' +
            '"Feedback / Pain Point" | "Action Item", "priority": "High" | "Medium" | "Low", "notes": string}]}\n' +
            'Only include requirements that are actually supported by the transcript — never fabricate specifics. ' +
            'If the transcript does not mention a client or project name, use null for that field. ' +
            'If there is nothing worth extracting, return an empty requirements array.',
        },
        {
          role: 'user',
          content: `Client meeting transcript:\n${transcriptText}\n\nReturn the JSON object now.`,
        },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response was not valid JSON.');

      const parsed = JSON.parse(jsonMatch[0]) as {
        clientName?: string | null;
        projectName?: string | null;
        requirements: { title: string; category: string; priority: string; notes: string }[];
      };

      if (parsed.clientName || parsed.projectName) {
        store.updateClientInfo(meetingId, {
          ...(parsed.clientName ? { clientName: parsed.clientName } : {}),
          ...(parsed.projectName ? { projectName: parsed.projectName } : {}),
        });
      }

      for (const req of parsed.requirements ?? []) {
        if (!req.title?.trim()) continue;
        store.addClientRequirement(meetingId, {
          title: req.title.trim(),
          category: VALID_CATEGORIES.includes(req.category as ClientRequirement['category'])
            ? (req.category as ClientRequirement['category'])
            : 'Action Item',
          priority: VALID_PRIORITIES.includes(req.priority as ClientRequirement['priority'])
            ? (req.priority as ClientRequirement['priority'])
            : 'Medium',
          notes: req.notes?.trim() || 'Extracted from transcript.',
        });
      }

      if (!parsed.requirements || parsed.requirements.length === 0) {
        setExtractError('No clear client requirements found in the transcript yet.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      setExtractError(message);
      console.error('[ClientRequirementsPanel] Auto-extract failed:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  const getCategoryBadge = (category: ClientRequirement['category']) => {
    switch (category) {
      case 'Feature Request':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FFDBDF] dark:bg-[#5c2830] text-[#a13347] dark:text-[#FFDBDF]">Feature Request</span>;
      case 'Constraint / Budget':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">Constraint</span>;
      case 'Feedback / Pain Point':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">Pain Point</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Action Item</span>;
    }
  };

  const getPriorityBadge = (priority: ClientRequirement['priority']) => {
    switch (priority) {
      case 'High':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#e08a97] text-white">High Priority</span>;
      case 'Medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f0b8c0] text-[#7a2b38]">Medium</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500 text-white">Low</span>;
    }
  };

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm overflow-hidden transition-all">
      {/* Client Header Banner */}
      <div className="p-4 bg-[#FFDBDF] dark:bg-[#3d232a] border-b border-zinc-100 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/70 dark:bg-[#5c2830] text-[#a13347] dark:text-[#FFDBDF] flex items-center justify-center font-bold text-sm shadow-inner">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Client Requirements & Scope</h3>
              {clientInfo.clientName && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/70 dark:bg-[#5c2830] text-[#a13347] dark:text-[#FFDBDF]">
                  {clientInfo.clientName}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Highlighting client suggestions, feature requests, budget constraints & pain points
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoExtractAI}
          disabled={isExtracting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#e08a97] hover:bg-[#d67685] text-white shadow-sm transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
          <span>{isExtracting ? 'Extracting Needs...' : '✦ Extract Client Needs via AI'}</span>
        </button>
      </div>

      {extractError && (
        <div className="px-4 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-800/40">
          {extractError}
        </div>
      )}

      {/* Quick Add Form */}
      <form onSubmit={handleAddRequirement} className="p-4 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Add client requirement or pain point..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#e08a97]"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as any)}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none"
        >
          <option value="Feature Request">Feature Request</option>
          <option value="Constraint / Budget">Constraint / Budget</option>
          <option value="Feedback / Pain Point">Pain Point / Feedback</option>
          <option value="Action Item">Action Item</option>
        </select>
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as any)}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none"
        >
          <option value="High">High Priority</option>
          <option value="Medium">Medium Priority</option>
          <option value="Low">Low Priority</option>
        </select>
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </form>

      {/* Requirements List */}
      <div className="p-4 space-y-3">
        {clientInfo.requirements.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">No client requirements recorded yet. Add one above or use AI auto-extract!</p>
        ) : (
          clientInfo.requirements.map((req) => (
            <div key={req.id} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(req.category)}
                  {getPriorityBadge(req.priority)}
                  <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{req.title}</h4>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{req.notes}</p>
              </div>
              <button
                onClick={() => store.deleteClientRequirement(meetingId, req.id)}
                className="self-end sm:self-center p-1.5 text-zinc-400 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete requirement"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
