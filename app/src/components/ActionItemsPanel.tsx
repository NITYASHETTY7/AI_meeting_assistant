import { useState, type KeyboardEvent } from 'react';
import { CheckSquare, ListTodo, Plus, Check, Edit2, Trash2, X } from 'lucide-react';
import { useAppStore, type Meeting } from '../store/useAppStore';

interface ActionItemsPanelProps {
  meeting: Meeting;
}

export const ActionItemsPanel = ({ meeting }: ActionItemsPanelProps) => {
  const store = useAppStore();
  const { toggleActionItem, addActionItem, editActionItem, deleteActionItem } = useAppStore();
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    addActionItem(meeting.id, newItemText.trim());
    setNewItemText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddItem();
    }
  };

  const handleStartEdit = (id: string, currentText: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditText(currentText);
  };

  const handleSaveEdit = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (editText.trim()) {
      editActionItem(meeting.id, id, editText.trim());
    }
    setEditingId(null);
  };

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteActionItem(meeting.id, id);
  };

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Panel title */}
      <div
        className="flex items-center justify-between px-5 py-3.5 select-none shrink-0"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            Action Items
          </h3>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          {meeting.actionItems.filter(i => i.done).length}/{meeting.actionItems.length}
        </span>
      </div>

      {/* Input section */}
      <div
        className="p-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}
      >
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add action item…"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="mg-input flex-1"
          />
          <button
            onClick={handleAddItem}
            className="mg-btn mg-btn-secondary"
            style={{ padding: '6px 10px' }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Task list scroll area */}
      <div className="overflow-y-auto p-4 space-y-1.5" style={{ maxHeight: '400px' }}>
        {store.isProcessingAI ? (
          <div className="space-y-2 animate-pulse select-none">
            {[1,2,3].map(i => (
              <div key={i} className="h-10 rounded-lg" style={{ background: 'var(--bg-card)' }} />
            ))}
          </div>
        ) : meeting.actionItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center select-none">
            <ListTodo className="w-8 h-8 mb-3" style={{ color: 'var(--text-disabled)' }} />
            <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              No Actions Created
            </h4>
            <p className="text-xs max-w-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              AI will generate action items after summary generation, or add your own above.
            </p>
          </div>
        ) : (
          meeting.actionItems.map((item) => {
            const isEditing = item.id === editingId;

            if (isEditing) {
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}
                >
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.id, e)}
                    className="mg-input flex-1"
                    autoFocus
                  />
                  <button
                    onClick={(e) => handleSaveEdit(item.id, e)}
                    className="p-1 rounded cursor-pointer transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--success)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                    className="p-1 rounded cursor-pointer transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                onClick={() => toggleActionItem(meeting.id, item.id)}
                className="flex items-start justify-between gap-3 p-3 rounded-lg group transition-all duration-150 cursor-pointer select-none"
                style={{
                  background: item.done ? 'transparent' : 'var(--bg-card)',
                  border: `1px solid ${item.done ? 'var(--border-subtle)' : 'var(--border)'}`,
                  opacity: item.done ? 0.55 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!item.done) {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.done) {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
                  }
                }}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-4 h-4 rounded mt-0.5 border flex items-center justify-center transition-colors duration-150 shrink-0"
                    style={{
                      background: item.done ? 'var(--accent)' : 'var(--bg-input)',
                      borderColor: item.done ? 'var(--accent)' : 'var(--border-strong)',
                      color: '#fff',
                    }}
                  >
                    {item.done && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span
                    className="text-xs leading-relaxed break-words"
                    style={{
                      color: item.done ? 'var(--text-muted)' : 'var(--text-secondary)',
                      textDecoration: item.done ? 'line-through' : 'none',
                    }}
                  >
                    {item.text}
                  </span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => handleStartEdit(item.id, item.text, e)}
                    className="p-1 rounded cursor-pointer transition-colors"
                    style={{ color: 'var(--text-disabled)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-disabled)')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteItem(item.id, e)}
                    className="p-1 rounded cursor-pointer transition-colors"
                    style={{ color: 'var(--text-disabled)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-disabled)')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
export default ActionItemsPanel;
