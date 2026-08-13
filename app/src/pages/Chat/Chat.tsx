import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, MessageSquare, Send, Trash2, Sparkles, Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ProviderManager } from '../../services/ai/ProviderManager';

const THREAD_LIST_COLLAPSED_KEY = 'mirai-chat-threadlist-collapsed';

/**
 * Chat
 *
 * AI chat workspace. Threads can be general-purpose or scoped to a specific
 * meeting (opened via "Ask AI" from the Meeting workspace with ?meetingId=).
 * When scoped, the meeting's transcript + AI summary are injected as system
 * context so the model can answer questions about that meeting.
 *
 * Sends through ProviderManager.getActiveProvider().chat(messages) — the same
 * provider/key configured in Settings. No network calls happen without a
 * BYO API key already saved.
 */
export const Chat = () => {
  const [searchParams] = useSearchParams();
  const meetingIdParam = searchParams.get('meetingId');

  // Thread list panel is collapsible, mirroring the main Sidebar's pattern —
  // persisted across sessions, useful on narrower windows.
  const [threadListCollapsed, setThreadListCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THREAD_LIST_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THREAD_LIST_COLLAPSED_KEY, String(threadListCollapsed));
    } catch {
      // ignore
    }
  }, [threadListCollapsed]);

  const {
    chatThreads,
    activeChatThreadId,
    setActiveChatThreadId,
    createChatThread,
    deleteChatThread,
    appendChatMessage,
    isChatStreaming,
    setIsChatStreaming,
    meetings,
    savedKeyProviders,
    provider,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  const activeThread = chatThreads.find((t) => t.id === activeChatThreadId) || null;
  const hasAnyKey = savedKeyProviders.size > 0;

  // If arriving with ?meetingId=, open (or create) that meeting's thread
  // Tracks which meetingId we've already created/opened a thread for in this
  // component instance, to guard against React StrictMode's deliberate
  // double-invocation of effects in development (which otherwise creates two
  // duplicate threads with the same title before the first one lands in state).
  const handledMeetingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!meetingIdParam) return;
    if (handledMeetingIdRef.current === meetingIdParam) return;
    handledMeetingIdRef.current = meetingIdParam;

    // Read fresh state directly rather than the closed-over `chatThreads` —
    // avoids acting on a stale snapshot if this fires twice in quick succession.
    const existing = useAppStore.getState().chatThreads.find((t) => t.meetingId === meetingIdParam);
    if (existing) {
      setActiveChatThreadId(existing.id);
    } else {
      createChatThread(meetingIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingIdParam]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeThread?.messages.length, isChatStreaming]);

  const filteredThreads = chatThreads.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleNewChat = () => {
    createChatThread(null);
  };

  const scopedMeeting = activeThread?.meetingId
    ? meetings.find((m) => m.id === activeThread.meetingId)
    : null;

  const buildContextPreamble = (): string | null => {
    if (!scopedMeeting) return null;
    const transcriptText = scopedMeeting.transcript.map((l) => `${l.speaker}: ${l.text}`).join('\n');
    return [
      `You are an AI assistant helping the user with a specific meeting called "${scopedMeeting.title}".`,
      scopedMeeting.aiSummary ? `Meeting summary:\n${scopedMeeting.aiSummary}` : '',
      transcriptText ? `Meeting transcript:\n${transcriptText}` : '',
      'Answer the user\'s questions using this context when relevant. If the context does not cover the question, answer normally.',
    ]
      .filter(Boolean)
      .join('\n\n');
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isChatStreaming) return;

    setError('');

    let threadId = activeChatThreadId;
    if (!threadId) {
      threadId = createChatThread(meetingIdParam ?? null);
    }

    appendChatMessage(threadId, 'user', text);
    setInput('');
    setIsChatStreaming(true);

    try {
      if (!hasAnyKey) {
        throw new Error('No API key configured. Add one in Settings to use AI chat.');
      }

      const aiProvider = ProviderManager.getActiveProvider();
      const thread = useAppStore.getState().chatThreads.find((t) => t.id === threadId);
      const history = (thread?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));

      const contextPreamble = buildContextPreamble();
      const messages = contextPreamble
        ? [{ role: 'system', content: contextPreamble }, ...history]
        : history;

      const reply = await aiProvider.chat(messages);
      appendChatMessage(threadId, 'assistant', reply || 'No response received.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get a response.';
      setError(message);
      appendChatMessage(threadId, 'assistant', `⚠️ ${message}`);
    } finally {
      setIsChatStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex w-full h-full overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {/* ── Thread list ──────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex flex-col h-full overflow-hidden"
        style={{
          width: threadListCollapsed ? '56px' : '260px',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          transition: 'width 200ms ease',
        }}
      >
        <div
          className="p-3 space-y-2 shrink-0 flex items-center"
          style={{ borderBottom: '1px solid var(--border)', justifyContent: threadListCollapsed ? 'center' : 'space-between' }}
        >
          {!threadListCollapsed && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Plus className="w-3.5 h-3.5" />
              New chat
            </button>
          )}
          <button
            onClick={() => setThreadListCollapsed((v) => !v)}
            className="p-2 rounded-lg cursor-pointer transition-colors shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title={threadListCollapsed ? 'Expand chat list' : 'Collapse chat list'}
          >
            {threadListCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {threadListCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <button
              onClick={handleNewChat}
              className="p-2.5 rounded-lg cursor-pointer transition-colors"
              style={{ color: 'var(--accent)', background: 'var(--accent-subtle)' }}
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="px-3 pb-3 shrink-0">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)', width: '14px', height: '14px' }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                className="mg-input text-xs"
                style={{ paddingLeft: '34px' }}
              />
            </div>
          </div>
        )}

        {!threadListCollapsed && (
        <div className="flex-1 overflow-y-auto py-2">
          {filteredThreads.length === 0 ? (
            <p className="text-[11px] text-center px-4 py-6" style={{ color: 'var(--text-muted)' }}>
              No conversations yet.
            </p>
          ) : (
            filteredThreads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => setActiveChatThreadId(thread.id)}
                className="group flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: thread.id === activeChatThreadId ? 'var(--bg-hover)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (thread.id !== activeChatThreadId) e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (thread.id !== activeChatThreadId) e.currentTarget.style.background = 'transparent';
                }}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span
                  className="flex-1 text-xs font-medium truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {thread.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChatThread(thread.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded cursor-pointer shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete chat"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
        )}
      </div>

      {/* ── Message thread ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {scopedMeeting && (
          <div
            className="px-5 py-2.5 text-[11px] font-semibold flex items-center gap-1.5 shrink-0"
            style={{
              background: 'var(--accent-subtle)',
              color: 'var(--accent-light)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <Sparkles className="w-3 h-3" />
            Chatting with context from “{scopedMeeting.title}”
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {!activeThread || activeThread.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center select-none">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-center" style={{ color: 'var(--text-tertiary)' }}>
                Ask about your notes, transcripts,
                <br />
                or anything else
              </p>
              {!hasAnyKey && (
                <p className="text-[11px] mt-3 text-center" style={{ color: 'var(--warning)' }}>
                  Add an API key in Settings to start chatting with {provider}.
                </p>
              )}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {activeThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={
                      msg.role === 'user'
                        ? { background: 'var(--accent)', color: '#fff' }
                        : { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatStreaming && (
                <div className="flex justify-start">
                  <div
                    className="px-4 py-2.5 rounded-2xl flex items-center gap-2 text-xs font-medium"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Thinking…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Composer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="max-w-2xl mx-auto">
            {error && (
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--error)' }}>
                {error}
              </p>
            )}
            <div
              className="flex items-end gap-2 rounded-xl px-3 py-2"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                rows={1}
                className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 max-h-32"
                style={{ color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isChatStreaming}
                className="mg-btn mg-btn-primary shrink-0 !p-2.5 !rounded-full"
                title="Send"
              >
                {isChatStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
