import { useState } from 'react';
import { Sparkles, User, CheckCircle2, Star, Edit3, Trash2, Plus } from 'lucide-react';
import { useAppStore, type CandidateInfo } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface CandidateScorecardProps {
  meetingId: string;
  candidateInfo?: CandidateInfo;
}

/** Minimum words of actual transcript speech required before attempting AI scoring. */
const MIN_WORDS_FOR_SCORING = 12;

export const CandidateScorecard = ({ meetingId, candidateInfo }: CandidateScorecardProps) => {
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [editingCommentsId, setEditingCommentsId] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [newCriterionName, setNewCriterionName] = useState('');

  if (!candidateInfo) return null;

  const handleScoreChange = (criterionId: string, newScore: number) => {
    store.updateCandidateScorecard(meetingId, criterionId, newScore);
  };

  const handleCommentsChange = (criterionId: string, newComments: string) => {
    store.updateCandidateScorecard(meetingId, criterionId, undefined, newComments);
  };

  const handleAutoFillAI = async () => {
    setScoreError(null);
    const meeting = useAppStore.getState().meetings.find((m) => m.id === meetingId);
    const transcript = meeting?.transcript ?? [];

    const wordCount = transcript
      .map((line) => line.text)
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    if (wordCount < MIN_WORDS_FOR_SCORING) {
      setScoreError('Not enough context to auto-score. Record more of the interview, then try again.');
      return;
    }

    setIsGenerating(true);
    try {
      const transcriptText = transcript
        .map((line) => `[${line.time}] ${line.speaker}: ${line.text}`)
        .join('\n');

      const criteriaList = candidateInfo.scorecard
        .map((c) => `- id: "${c.id}", category: "${c.category}"`)
        .join('\n');

      const provider = ProviderManager.getChatProvider();
      const reply = await provider.chat([
        {
          role: 'system',
          content:
            'You are an expert technical interviewer assistant. You read an interview transcript and ' +
            'score the candidate against a fixed rubric. Respond with ONLY a valid JSON object, no markdown ' +
            'fences, no commentary, matching exactly this shape:\n' +
            '{"scores": [{"id": string, "score": number (1-5), "comments": string}], ' +
            '"overallRecommendation": "Strong Hire" | "Hire" | "Leaning Hire" | "No Hire"}\n' +
            'If the transcript does not contain enough evidence to fairly judge a given criterion, ' +
            'set that criterion\'s score to 0 and its comments to "Not enough context to score this criterion." ' +
            'Never fabricate specifics that are not supported by the transcript.',
        },
        {
          role: 'user',
          content:
            `Rubric criteria to score:\n${criteriaList}\n\n` +
            `Interview transcript:\n${transcriptText}\n\n` +
            'Return the JSON object now.',
        },
      ]);

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response was not valid JSON.');

      const parsed = JSON.parse(jsonMatch[0]) as {
        scores: { id: string; score: number; comments: string }[];
        overallRecommendation?: CandidateInfo['overallRecommendation'];
      };

      for (const entry of parsed.scores ?? []) {
        const criterion = candidateInfo.scorecard.find((c) => c.id === entry.id);
        if (!criterion) continue;
        store.updateCandidateScorecard(
          meetingId,
          entry.id,
          entry.score > 0 ? entry.score : undefined,
          entry.comments
        );
      }

      if (parsed.overallRecommendation) {
        store.updateCandidateInfo(meetingId, { overallRecommendation: parsed.overallRecommendation });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Auto-scoring failed.';
      setScoreError(message);
      console.error('[CandidateScorecard] Auto-score failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm overflow-hidden transition-all">
      {/* Scorecard Header Banner */}
      <div className="p-4 bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border-b border-zinc-100 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold text-sm shadow-inner">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Candidate Scorecard</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                Interview Rubric
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Rate candidate criteria during or after the intro call
            </p>
          </div>
        </div>

        {/* AI Auto-Fill Action */}
        <button
          onClick={handleAutoFillAI}
          disabled={isGenerating}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Analyzing Transcript...' : '✦ Auto-Score via AI'}</span>
        </button>
      </div>

      {scoreError && (
        <div className="px-5 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-800/40">
          {scoreError}
        </div>
      )}

      {/* Candidate Profile Bar */}
      <div className="px-5 py-3 bg-zinc-50/70 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-700/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-bold text-xs shrink-0">
            <User className="w-4 h-4" />
          </div>
          {isEditingProfile ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                defaultValue={candidateInfo.name}
                autoFocus
                placeholder="Candidate name"
                onBlur={(e) => store.updateCandidateInfo(meetingId, { name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.currentTarget.blur(); setIsEditingProfile(false); }
                  if (e.key === 'Escape') setIsEditingProfile(false);
                }}
                className="text-xs font-bold px-2 py-1 rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500 w-36"
              />
              <input
                type="text"
                defaultValue={candidateInfo.role}
                placeholder="Role"
                onBlur={(e) => { store.updateCandidateInfo(meetingId, { role: e.target.value }); setIsEditingProfile(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.currentTarget.blur(); }
                  if (e.key === 'Escape') setIsEditingProfile(false);
                }}
                className="text-xs px-2 py-1 rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500 w-36"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingProfile(true)}
              className="flex items-center gap-1.5 group cursor-pointer text-left"
              title="Click to edit candidate name and role"
            >
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                {candidateInfo.name || 'Candidate name not set'}
              </span>
              {candidateInfo.role && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">• {candidateInfo.role}</span>
              )}
              <Edit3 className="w-3 h-3 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Recommendation Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Recommendation:</span>
          <select
            value={candidateInfo.overallRecommendation ?? ''}
            onChange={(e) => store.updateCandidateInfo(meetingId, { overallRecommendation: e.target.value as any })}
            className="text-xs font-bold px-2.5 py-1 rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="" disabled>Not yet scored</option>
            <option value="Strong Hire">🌟 Strong Hire</option>
            <option value="Hire">✅ Hire</option>
            <option value="Leaning Hire">🤔 Leaning Hire</option>
            <option value="No Hire">❌ No Hire</option>
          </select>
        </div>
      </div>

      {/* Scorecard Rubric Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-700/60 bg-zinc-50/40 dark:bg-zinc-800/20 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              <th className="py-2.5 px-5 w-1/3">Criteria</th>
              <th className="py-2.5 px-4 w-36 text-center">Score (1-5)</th>
              <th className="py-2.5 px-5">Comments & Observations</th>
              <th className="py-2.5 px-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/40 text-xs">
            {candidateInfo.scorecard.map((item) => (
              <tr key={item.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-700/30 transition-colors">
                <td className="py-3 px-5 font-semibold text-zinc-800 dark:text-zinc-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-500 shrink-0" />
                    <span>{item.category}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleScoreChange(item.id, star)}
                        className={`p-1 rounded transition-transform hover:scale-110 ${
                          star <= (item.score || 0)
                            ? 'text-amber-400 dark:text-amber-300'
                            : 'text-zinc-200 dark:text-zinc-700 hover:text-amber-200'
                        }`}
                        title={`Score ${star}/5`}
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 block mt-0.5">
                    {item.score ? `${item.score} / 5` : 'Not rated'}
                  </span>
                </td>
                <td className="py-3 px-5 text-zinc-600 dark:text-zinc-300">
                  {editingCommentsId === item.id ? (
                    <input
                      type="text"
                      defaultValue={item.comments}
                      autoFocus
                      onBlur={(e) => {
                        handleCommentsChange(item.id, e.target.value);
                        setEditingCommentsId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCommentsChange(item.id, e.currentTarget.value);
                          setEditingCommentsId(null);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs rounded border border-purple-400 dark:border-purple-500 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none"
                    />
                  ) : (
                    <div
                      onClick={() => setEditingCommentsId(item.id)}
                      className="group flex items-start justify-between gap-2 cursor-pointer p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700/40 transition-colors"
                    >
                      <p className="leading-relaxed">{item.comments || 'Click to add notes...'}</p>
                      <Edit3 className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                    </div>
                  )}
                </td>
                <td className="py-3 px-3 text-center">
                  <button
                    onClick={() => store.removeScorecardCriterion(meetingId, item.id)}
                    title="Remove this criterion"
                    className="p-1 rounded text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Criterion */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = newCriterionName.trim();
          if (!trimmed) return;
          store.addScorecardCriterion(meetingId, trimmed);
          setNewCriterionName('');
        }}
        className="flex items-center gap-2 px-5 py-3 border-t border-zinc-100 dark:border-zinc-700/40"
      >
        <Plus className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
        <input
          type="text"
          value={newCriterionName}
          onChange={(e) => setNewCriterionName(e.target.value)}
          placeholder="Add a new criterion, e.g. Leadership Potential"
          className="flex-1 text-xs px-2 py-1.5 rounded-md border border-transparent bg-transparent text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-purple-300 dark:focus:border-purple-600 focus:bg-white dark:focus:bg-zinc-900 transition-colors"
        />
        <button
          type="submit"
          disabled={!newCriterionName.trim()}
          className="text-xs font-semibold px-2.5 py-1 rounded-md text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Add
        </button>
      </form>
    </div>
  );
};
