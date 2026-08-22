import { useState } from 'react';
import { BarChart3, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type RecruitmentMetricsInfo, type TemplateInsightItem } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface RecruitmentMetricsPanelProps {
  meetingId: string;
  recruitmentMetricsInfo?: RecruitmentMetricsInfo;
}

/** Minimum words of actual transcript speech required before attempting AI extraction. */
const MIN_WORDS_FOR_EXTRACTION = 12;

const CATEGORY_OPTIONS = [
  'Pipeline Volume',
  'Funnel Conversion',
  'Time-to-Hire',
  'Source Performance',
  'Offer / Acceptance',
  'Other',
];

export const RecruitmentMetricsPanel = ({ meetingId, recruitmentMetricsInfo }: RecruitmentMetricsPanelProps) => {
  const store = useAppStore();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORY_OPTIONS[0]);

  if (!recruitmentMetricsInfo) return null;

  const handleAddMetric = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    store.addRecruitmentMetric(meetingId, {
      label: newLabel.trim(),
      category: newCategory,
      value: newValue.trim() || undefined,
      notes: 'Added manually during discussion.',
    });
    setNewLabel('');
    setNewValue('');
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
      setExtractError('Not enough context to extract recruitment metrics. Record more of the meeting, then try again.');
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
            'You are a talent acquisition analyst assistant. You read a recruiting/hiring meeting transcript ' +
            'and extract concrete hiring funnel and pipeline metrics discussed. Respond with ONLY a valid JSON ' +
            'object, no markdown fences, no commentary, matching exactly this shape:\n' +
            '{"summary": string, "metrics": [{"label": string, "category": "Pipeline Volume" | "Funnel Conversion" ' +
            '| "Time-to-Hire" | "Source Performance" | "Offer / Acceptance" | "Other", "value": string | null, ' +
            '"notes": string}]}\n' +
            'Only include metrics actually mentioned in the transcript (e.g. counts, percentages, days, rates) — ' +
            'never fabricate numbers. "value" should hold the number/stat itself (e.g. "45 applicants", "12%", ' +
            '"18 days") or null if there is no specific figure. If nothing quantifiable was discussed, return an ' +
            'empty metrics array and a summary explaining that.',
        },
        {
          role: 'user',
          content: `Recruiting meeting transcript:\n${transcriptText}\n\nReturn the JSON object now.`,
        },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response was not valid JSON.');

      const parsed = JSON.parse(jsonMatch[0]) as {
        summary: string;
        metrics: { label: string; category: string; value?: string | null; notes: string }[];
      };

      const validatedMetrics: TemplateInsightItem[] = (parsed.metrics ?? [])
        .filter((m) => m.label?.trim())
        .map((m, idx) => ({
          id: `metric-${Date.now()}-${idx}`,
          label: m.label.trim(),
          category: CATEGORY_OPTIONS.includes(m.category) ? m.category : 'Other',
          value: m.value?.trim() || undefined,
          notes: m.notes?.trim() || '',
        }));

      store.setRecruitmentMetricsInfo(meetingId, {
        summary: parsed.summary?.trim() || recruitmentMetricsInfo.summary,
        metrics: validatedMetrics,
      });

      if (validatedMetrics.length === 0) {
        setExtractError('No quantifiable recruitment metrics found in the transcript yet.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      setExtractError(message);
      console.error('[RecruitmentMetricsPanel] Auto-extract failed:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const colorMap: Record<string, string> = {
      'Pipeline Volume': 'bg-[#FFE797] dark:bg-[#4a3d1a] text-[#8a6d0a] dark:text-[#FFE797]',
      'Funnel Conversion': 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      'Time-to-Hire': 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
      'Source Performance': 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
      'Offer / Acceptance': 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
    };
    const cls = colorMap[category] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300';
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{category}</span>;
  };

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="p-4 bg-[#FFE797] dark:bg-[#3a3116] border-b border-zinc-100 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/70 dark:bg-[#4a3d1a] text-[#8a6d0a] dark:text-[#FFE797] flex items-center justify-center font-bold text-sm shadow-inner">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recruitment Metrics</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Hiring funnel velocity, candidate pipeline & interview metrics
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoExtractAI}
          disabled={isExtracting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#c9a227] hover:bg-[#b5911f] text-white shadow-sm transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
          <span>{isExtracting ? 'Extracting Metrics...' : '✦ Extract Metrics via AI'}</span>
        </button>
      </div>

      {extractError && (
        <div className="px-4 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-800/40">
          {extractError}
        </div>
      )}

      {recruitmentMetricsInfo.summary && (
        <div className="px-4 py-3 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40">
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{recruitmentMetricsInfo.summary}</p>
        </div>
      )}

      {/* Quick Add Form */}
      <form onSubmit={handleAddMetric} className="p-4 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Metric label (e.g. Applicants → Interviews)..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#c9a227]"
        />
        <input
          type="text"
          placeholder="Value (e.g. 45%)"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="w-28 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#c9a227]"
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

      {/* Metrics List */}
      <div className="p-4 space-y-3">
        {recruitmentMetricsInfo.metrics.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">No recruitment metrics recorded yet. Add one above or use AI auto-extract!</p>
        ) : (
          recruitmentMetricsInfo.metrics.map((metric) => (
            <div key={metric.id} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(metric.category)}
                  {metric.value && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">{metric.value}</span>
                  )}
                  <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{metric.label}</h4>
                </div>
                {metric.notes && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{metric.notes}</p>}
              </div>
              <button
                onClick={() => store.deleteRecruitmentMetric(meetingId, metric.id)}
                className="self-end sm:self-center p-1.5 text-zinc-400 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete metric"
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
