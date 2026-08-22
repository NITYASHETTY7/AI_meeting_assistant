import { useState } from 'react';
import { Users, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type TeamRecapInfo, type TemplateInsightItem } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface TeamRecapPanelProps {
  meetingId: string;
  teamRecapInfo?: TeamRecapInfo;
}

/** Minimum words of actual transcript speech required before attempting AI extraction. */
const MIN_WORDS_FOR_EXTRACTION = 12;

const CATEGORY_OPTIONS = ['Went Well', 'Needs Improvement', 'Announcement', 'Milestone', 'Other'];

export const TeamRecapPanel = ({ meetingId, teamRecapInfo }: TeamRecapPanelProps) => {
  const store = useAppStore();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORY_OPTIONS[0]);

  if (!teamRecapInfo) return null;

  const handleAddHighlight = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    store.addTeamRecapHighlight(meetingId, {
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
      setExtractError('Not enough context to extract a team recap. Record more of the meeting, then try again.');
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
            'You are a team lead assistant. You read a sprint retro / team sync meeting transcript and extract ' +
            'concrete highlights, announcements, and sprint retro points discussed. Respond with ONLY a valid ' +
            'JSON object, no markdown fences, no commentary, matching exactly this shape:\n' +
            '{"summary": string, "highlights": [{"label": string, "category": "Went Well" | ' +
            '"Needs Improvement" | "Announcement" | "Milestone" | "Other", "notes": string}]}\n' +
            'Only include highlights actually discussed in the transcript — never fabricate specifics. If ' +
            'nothing notable was discussed, return an empty highlights array and a summary explaining that.',
        },
        {
          role: 'user',
          content: `Team sync transcript:\n${transcriptText}\n\nReturn the JSON object now.`,
        },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response was not valid JSON.');

      const parsed = JSON.parse(jsonMatch[0]) as {
        summary: string;
        highlights: { label: string; category: string; notes: string }[];
      };

      const validatedHighlights: TemplateInsightItem[] = (parsed.highlights ?? [])
        .filter((h) => h.label?.trim())
        .map((h, idx) => ({
          id: `recap-${Date.now()}-${idx}`,
          label: h.label.trim(),
          category: CATEGORY_OPTIONS.includes(h.category) ? h.category : 'Other',
          notes: h.notes?.trim() || '',
        }));

      store.setTeamRecapInfo(meetingId, {
        summary: parsed.summary?.trim() || teamRecapInfo.summary,
        highlights: validatedHighlights,
      });

      if (validatedHighlights.length === 0) {
        setExtractError('No clear team recap highlights found in the transcript yet.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      setExtractError(message);
      console.error('[TeamRecapPanel] Auto-extract failed:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const colorMap: Record<string, string> = {
      'Went Well': 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      'Needs Improvement': 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
      Announcement: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
      Milestone: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
    };
    const cls = colorMap[category] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300';
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{category}</span>;
  };

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent border-b border-zinc-100 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 flex items-center justify-center font-bold text-sm shadow-inner">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Team Recap</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Sprint retro, team announcements & project sync highlights
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoExtractAI}
          disabled={isExtracting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
          <span>{isExtracting ? 'Extracting Recap...' : '✦ Extract Recap via AI'}</span>
        </button>
      </div>

      {extractError && (
        <div className="px-4 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-800/40">
          {extractError}
        </div>
      )}

      {teamRecapInfo.summary && (
        <div className="px-4 py-3 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40">
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{teamRecapInfo.summary}</p>
        </div>
      )}

      {/* Quick Add Form */}
      <form onSubmit={handleAddHighlight} className="p-4 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Highlight (e.g. Shipped v2.3 on schedule)..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
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

      {/* Highlights List */}
      <div className="p-4 space-y-3">
        {teamRecapInfo.highlights.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">No team recap highlights recorded yet. Add one above or use AI auto-extract!</p>
        ) : (
          teamRecapInfo.highlights.map((highlight) => (
            <div key={highlight.id} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(highlight.category)}
                  <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{highlight.label}</h4>
                </div>
                {highlight.notes && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{highlight.notes}</p>}
              </div>
              <button
                onClick={() => store.deleteTeamRecapHighlight(meetingId, highlight.id)}
                className="self-end sm:self-center p-1.5 text-zinc-400 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete highlight"
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
