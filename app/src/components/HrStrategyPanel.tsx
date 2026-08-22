import { useState } from 'react';
import { Target, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type HrStrategyInfo, type TemplateInsightItem } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface HrStrategyPanelProps {
  meetingId: string;
  hrStrategyInfo?: HrStrategyInfo;
}

/** Minimum words of actual transcript speech required before attempting AI extraction. */
const MIN_WORDS_FOR_EXTRACTION = 12;

const CATEGORY_OPTIONS = [
  'Headcount Planning',
  'Policy Update',
  'Org Structure',
  'Compensation & Benefits',
  'Culture Initiative',
  'Other',
];

export const HrStrategyPanel = ({ meetingId, hrStrategyInfo }: HrStrategyPanelProps) => {
  const store = useAppStore();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORY_OPTIONS[0]);

  if (!hrStrategyInfo) return null;

  const handleAddPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    store.addHrStrategyPoint(meetingId, {
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
      setExtractError('Not enough context to extract HR strategy points. Record more of the meeting, then try again.');
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
            'You are an HR strategy analyst assistant. You read an HR/leadership meeting transcript and extract ' +
            'concrete organizational strategy points discussed. Respond with ONLY a valid JSON object, no markdown ' +
            'fences, no commentary, matching exactly this shape:\n' +
            '{"summary": string, "points": [{"label": string, "category": "Headcount Planning" | "Policy Update" ' +
            '| "Org Structure" | "Compensation & Benefits" | "Culture Initiative" | "Other", "notes": string}]}\n' +
            'Only include points actually discussed in the transcript — never fabricate decisions or figures. ' +
            'If nothing strategic was discussed, return an empty points array and a summary explaining that.',
        },
        {
          role: 'user',
          content: `HR meeting transcript:\n${transcriptText}\n\nReturn the JSON object now.`,
        },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response was not valid JSON.');

      const parsed = JSON.parse(jsonMatch[0]) as {
        summary: string;
        points: { label: string; category: string; notes: string }[];
      };

      const validatedPoints: TemplateInsightItem[] = (parsed.points ?? [])
        .filter((p) => p.label?.trim())
        .map((p, idx) => ({
          id: `hrpoint-${Date.now()}-${idx}`,
          label: p.label.trim(),
          category: CATEGORY_OPTIONS.includes(p.category) ? p.category : 'Other',
          notes: p.notes?.trim() || '',
        }));

      store.setHrStrategyInfo(meetingId, {
        summary: parsed.summary?.trim() || hrStrategyInfo.summary,
        points: validatedPoints,
      });

      if (validatedPoints.length === 0) {
        setExtractError('No clear HR strategy points found in the transcript yet.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      setExtractError(message);
      console.error('[HrStrategyPanel] Auto-extract failed:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const colorMap: Record<string, string> = {
      'Headcount Planning': 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
      'Policy Update': 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
      'Org Structure': 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
      'Compensation & Benefits': 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      'Culture Initiative': 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
    };
    const cls = colorMap[category] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300';
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{category}</span>;
  };

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="p-4 bg-[#BAD6DA] dark:bg-[#1f3436] border-b border-zinc-100 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/70 dark:bg-[#2a4a4d] text-[#2d6b73] dark:text-[#BAD6DA] flex items-center justify-center font-bold text-sm shadow-inner">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">HR Strategy</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Headcount planning, policy updates & organizational strategy
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoExtractAI}
          disabled={isExtracting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#5d9aa1] hover:bg-[#4f868c] text-white shadow-sm transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
          <span>{isExtracting ? 'Extracting Strategy...' : '✦ Extract Strategy via AI'}</span>
        </button>
      </div>

      {extractError && (
        <div className="px-4 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-800/40">
          {extractError}
        </div>
      )}

      {hrStrategyInfo.summary && (
        <div className="px-4 py-3 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40">
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{hrStrategyInfo.summary}</p>
        </div>
      )}

      {/* Quick Add Form */}
      <form onSubmit={handleAddPoint} className="p-4 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Strategy point (e.g. Q3 headcount freeze)..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#5d9aa1]"
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

      {/* Points List */}
      <div className="p-4 space-y-3">
        {hrStrategyInfo.points.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">No HR strategy points recorded yet. Add one above or use AI auto-extract!</p>
        ) : (
          hrStrategyInfo.points.map((point) => (
            <div key={point.id} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(point.category)}
                  <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{point.label}</h4>
                </div>
                {point.notes && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{point.notes}</p>}
              </div>
              <button
                onClick={() => store.deleteHrStrategyPoint(meetingId, point.id)}
                className="self-end sm:self-center p-1.5 text-zinc-400 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete point"
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
