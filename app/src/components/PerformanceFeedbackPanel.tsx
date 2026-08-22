import { useState } from 'react';
import { UserX, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type PerformanceFeedbackInfo, type TemplateInsightItem } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface PerformanceFeedbackPanelProps {
  meetingId: string;
  performanceFeedbackInfo?: PerformanceFeedbackInfo;
}

/** Minimum words of actual transcript speech required before attempting AI extraction. */
const MIN_WORDS_FOR_EXTRACTION = 12;

const CATEGORY_OPTIONS = ['Achievement', 'Growth Goal', 'Feedback', 'Concern', 'Other'];

const RATING_OPTIONS: NonNullable<PerformanceFeedbackInfo['overallRating']>[] = [
  'Exceeds Expectations',
  'Meets Expectations',
  'Needs Improvement',
  'Unsatisfactory',
];

export const PerformanceFeedbackPanel = ({ meetingId, performanceFeedbackInfo }: PerformanceFeedbackPanelProps) => {
  const store = useAppStore();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORY_OPTIONS[0]);

  if (!performanceFeedbackInfo) return null;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    store.addPerformanceFeedbackItem(meetingId, {
      label: newLabel.trim(),
      category: newCategory,
      notes: 'Added manually during discussion.',
    });
    setNewLabel('');
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
      setExtractError('Not enough context to extract performance feedback. Record more of the meeting, then try again.');
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
            'You are an HR performance review assistant. You read a 1:1 performance review transcript and extract ' +
            'concrete achievements, growth goals, feedback, and concerns discussed. Respond with ONLY a valid JSON ' +
            'object, no markdown fences, no commentary, matching exactly this shape:\n' +
            '{"employeeName": string | null, "role": string | null, "summary": string, ' +
            '"items": [{"label": string, "category": "Achievement" | "Growth Goal" | "Feedback" | "Concern" | ' +
            '"Other", "notes": string}], ' +
            '"overallRating": "Exceeds Expectations" | "Meets Expectations" | "Needs Improvement" | ' +
            '"Unsatisfactory" | null}\n' +
            'Only include items actually discussed in the transcript — never fabricate specifics. Only set ' +
            'overallRating if the transcript gives a clear enough signal to infer one, otherwise use null. ' +
            'If the employee name/role are not mentioned, use null for those fields.',
        },
        {
          role: 'user',
          content: `Performance review transcript:\n${transcriptText}\n\nReturn the JSON object now.`,
        },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response was not valid JSON.');

      const parsed = JSON.parse(jsonMatch[0]) as {
        employeeName?: string | null;
        role?: string | null;
        summary: string;
        items: { label: string; category: string; notes: string }[];
        overallRating?: string | null;
      };

      const validatedItems: TemplateInsightItem[] = (parsed.items ?? [])
        .filter((i) => i.label?.trim())
        .map((i, idx) => ({
          id: `pf-${Date.now()}-${idx}`,
          label: i.label.trim(),
          category: CATEGORY_OPTIONS.includes(i.category) ? i.category : 'Other',
          notes: i.notes?.trim() || '',
        }));

      const overallRating = RATING_OPTIONS.includes(parsed.overallRating as typeof RATING_OPTIONS[number])
        ? (parsed.overallRating as typeof RATING_OPTIONS[number])
        : performanceFeedbackInfo.overallRating;

      store.setPerformanceFeedbackInfo(meetingId, {
        employeeName: parsed.employeeName?.trim() || performanceFeedbackInfo.employeeName,
        role: parsed.role?.trim() || performanceFeedbackInfo.role,
        summary: parsed.summary?.trim() || performanceFeedbackInfo.summary,
        items: validatedItems,
        overallRating,
      });

      if (validatedItems.length === 0) {
        setExtractError('No clear performance feedback found in the transcript yet.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      setExtractError(message);
      console.error('[PerformanceFeedbackPanel] Auto-extract failed:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const colorMap: Record<string, string> = {
      Achievement: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      'Growth Goal': 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
      Feedback: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
      Concern: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
    };
    const cls = colorMap[category] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300';
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{category}</span>;
  };

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border-b border-zinc-100 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center font-bold text-sm shadow-inner">
            <UserX className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Performance Feedback</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              1:1 review, growth goals, achievements & constructive feedback
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoExtractAI}
          disabled={isExtracting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
          <span>{isExtracting ? 'Extracting Feedback...' : '✦ Extract Feedback via AI'}</span>
        </button>
      </div>

      {extractError && (
        <div className="px-4 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-800/40">
          {extractError}
        </div>
      )}

      {/* Employee Profile Bar */}
      <div className="px-5 py-3 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{performanceFeedbackInfo.employeeName}</span>
          {performanceFeedbackInfo.role && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-2">• {performanceFeedbackInfo.role}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Overall:</span>
          <select
            value={performanceFeedbackInfo.overallRating || ''}
            onChange={(e) =>
              store.setPerformanceFeedbackInfo(meetingId, {
                ...performanceFeedbackInfo,
                overallRating: (e.target.value || undefined) as PerformanceFeedbackInfo['overallRating'],
              })
            }
            className="text-xs font-bold px-2.5 py-1 rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="">Not set</option>
            {RATING_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {performanceFeedbackInfo.summary && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-700/40">
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{performanceFeedbackInfo.summary}</p>
        </div>
      )}

      {/* Quick Add Form */}
      <form onSubmit={handleAddItem} className="p-4 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Feedback item (e.g. Missed sprint deadline twice)..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!newLabel.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </form>

      {/* Items List */}
      <div className="p-4 space-y-3">
        {performanceFeedbackInfo.items.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">No performance feedback recorded yet. Add one above or use AI auto-extract!</p>
        ) : (
          performanceFeedbackInfo.items.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(item.category)}
                  <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{item.label}</h4>
                </div>
                {item.notes && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.notes}</p>}
              </div>
              <button
                onClick={() => store.deletePerformanceFeedbackItem(meetingId, item.id)}
                className="self-end sm:self-center p-1.5 text-zinc-400 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete item"
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
