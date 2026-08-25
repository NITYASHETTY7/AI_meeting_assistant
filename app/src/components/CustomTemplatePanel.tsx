import { useState } from 'react';
import { Sparkles, Trash2, Pencil, AlertCircle, Quote } from 'lucide-react';
import { useAppStore, type CustomTemplateInfo, type CustomTemplateInsightItem } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';
import { getStoredCustomTemplate, deleteStoredCustomTemplate, getStoredCustomTemplates } from './NoteTemplateSelector';

interface CustomTemplatePanelProps {
  meetingId: string;
  templateId: string;
  customInfo?: CustomTemplateInfo;
}

/** Minimum words of actual transcript speech required before attempting AI extraction. */
const MIN_WORDS_FOR_EXTRACTION = 12;

export const CustomTemplatePanel = ({ meetingId, templateId, customInfo }: CustomTemplatePanelProps) => {
  const store = useAppStore();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const storedTemplate = getStoredCustomTemplate(templateId);
  const templateName = storedTemplate?.label || customInfo?.templateName || 'Custom Note Template';
  const templateRubrics = storedTemplate?.description || 'Custom AI Rubrics & Extraction';

  const [editName, setEditName] = useState(templateName);
  const [editPrompt, setEditPrompt] = useState(templateRubrics);

  const items = customInfo?.items ?? [];
  const summary = customInfo?.summary ?? '';

  const handleOpenEdit = () => {
    setEditName(templateName);
    setEditPrompt(templateRubrics);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    const stored = getStoredCustomTemplates();
    const updated = stored.map((t) =>
      t.id === templateId
        ? { ...t, label: editName.trim(), description: editPrompt.trim() || 'Custom instructions' }
        : t
    );
    try {
      localStorage.setItem('mg_custom_note_templates', JSON.stringify(updated));
    } catch {}

    if (customInfo) {
      store.setCustomTemplateInfo(meetingId, {
        ...customInfo,
        templateName: editName.trim(),
      });
    }
    setShowEditModal(false);
  };

  const handleAutoExtractAI = async () => {
    setExtractError(null);
    const meeting = useAppStore.getState().meetings.find((m) => m.id === meetingId);
    const transcript = meeting?.transcript ?? [];
    const additionalNotes = meeting?.additionalNotes ? meeting.additionalNotes.replace(/<[^>]*>/g, ' ').trim() : '';

    const transcriptWordCount = transcript
      .map((line) => line.text)
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const notesWordCount = additionalNotes ? additionalNotes.split(/\s+/).filter(Boolean).length : 0;
    const totalWords = transcriptWordCount + notesWordCount;

    if (totalWords < MIN_WORDS_FOR_EXTRACTION) {
      setExtractError('Not enough context to extract insights. Record more of the meeting, or add notes, then try again.');
      return;
    }

    setIsExtracting(true);
    try {
      const transcriptText =
        transcript.length > 0
          ? transcript.map((line) => `[${line.time}] ${line.speaker}: ${line.text}`).join('\n')
          : '[No audio transcript captured]';

      const combinedText = additionalNotes
        ? `${transcriptText}\n\n--- Additional Meeting Notes ---\n${additionalNotes}`
        : transcriptText;

      const provider = ProviderManager.getChatProvider();
      const reply = await provider.chat([
        {
          role: 'system',
          content:
            `You are an expert AI meeting analyst. You read a meeting transcript and extract structured insights based strictly on the user's custom rubric and instructions.\n\n` +
            `CUSTOM RUBRIC & INSTRUCTIONS:\n` +
            `"${templateRubrics}"\n\n` +
            `You must respond with ONLY a valid JSON object, no markdown fences, no extra commentary, matching exactly this shape:\n` +
            `{\n` +
            `  "summary": "1-2 sentence executive overview evaluating or synthesizing the discussion against the rubric",\n` +
            `  "items": [\n` +
            `    {\n` +
            `      "category": "Rubric category or section name (e.g. Budget, Technical Specs, Feedback, Objection, Criteria)",\n` +
            `      "title": "Concise key insight or statement",\n` +
            `      "notes": "Supporting detail, quote, or evidence from the transcript"\n` +
            `    }\n` +
            `  ]\n` +
            `}\n` +
            `Only extract insights actually discussed in the transcript — never fabricate facts. If no points match the rubric, return an empty items array and a brief summary explaining that.`,
        },
        {
          role: 'user',
          content: `Meeting transcript:\n${combinedText}\n\nExtract the structured insights adhering strictly to the rubric. Return the JSON object now.`,
        },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response was not valid JSON.');

      const parsed = JSON.parse(jsonMatch[0]) as {
        summary?: string;
        items?: { category?: string; title?: string; notes?: string }[];
      };

      const validatedItems: CustomTemplateInsightItem[] = (parsed.items ?? [])
        .filter((item) => item.title?.trim() || item.notes?.trim())
        .map((item, idx) => ({
          id: `custom-item-${Date.now()}-${idx}`,
          category: item.category?.trim() || 'Key Insight',
          title: item.title?.trim() || 'Rubric Point',
          notes: item.notes?.trim() || '',
        }));

      store.setCustomTemplateInfo(meetingId, {
        templateId,
        templateName,
        summary: parsed.summary?.trim() || summary,
        items: validatedItems,
      });

      if (validatedItems.length === 0 && !parsed.summary) {
        setExtractError('No specific insights matching this custom template rubric were found in the transcript.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      setExtractError(message);
      console.error('[CustomTemplatePanel] Auto-extract failed:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border-b border-zinc-100 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold text-sm shadow-inner">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{templateName}</h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                Custom
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-xl line-clamp-1" title={templateRubrics}>
              {templateRubrics}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit Template Button */}
          <button
            onClick={handleOpenEdit}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
            title="Edit custom template"
          >
            <Pencil className="w-4 h-4" />
          </button>

          {/* Delete Template Button */}
          <button
            onClick={() => {
              if (window.confirm(`Delete custom template "${templateName}"?`)) {
                deleteStoredCustomTemplate(templateId);
                store.setMeetingTemplate(meetingId, 'default');
              }
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
            title="Delete custom template"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* AI Extraction Button */}
          <button
            onClick={handleAutoExtractAI}
            disabled={isExtracting}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
            <span>{isExtracting ? 'Extracting Insights...' : '✦ Extract via AI'}</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {extractError && (
        <div className="px-4 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-800/40 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{extractError}</span>
        </div>
      )}

      {/* AI Summary Block */}
      {summary && (
        <div className="px-4 py-3 bg-purple-50/40 dark:bg-purple-950/20 border-b border-purple-100/50 dark:border-purple-900/30 flex items-start gap-2.5">
          <Quote className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed italic">{summary}</p>
        </div>
      )}

      {/* Extracted Insights List */}
      <div className="p-4 space-y-3">
        {items.length === 0 ? (
          <div className="py-6 text-center select-none">
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              No insights extracted yet. Click <strong className="text-purple-600 dark:text-purple-400 font-semibold">✦ Extract via AI</strong> above to analyze the transcript against your custom template rubric!
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-start justify-between gap-3 group transition-colors hover:border-purple-300/60 dark:hover:border-purple-700/50"
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.category && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                      {item.category}
                    </span>
                  )}
                  <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{item.title}</h4>
                </div>
                {item.notes && (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed mt-0.5">
                    {item.notes}
                  </p>
                )}
              </div>
              <button
                onClick={() => store.deleteCustomTemplateInsightItem(meetingId, item.id)}
                className="self-end sm:self-start p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Delete item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Edit Template Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Edit Custom Template</h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Update the name or instructions for this custom template.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mg-input w-full text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Custom AI Instructions / Rubrics
                </label>
                <textarea
                  rows={4}
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  className="mg-input w-full text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="mg-btn mg-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim()}
                className="mg-btn mg-btn-primary text-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CustomTemplatePanel;
