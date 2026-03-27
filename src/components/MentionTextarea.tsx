import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { personOutline } from 'ionicons/icons';
import { students as studentsApi } from '../services/api';
import { MentionedStudent } from '../types';
import './MentionTextarea.css';

interface SearchResult {
  id: string;
  name: string;
  classes: { class_id: string; class_name: string }[];
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  mentionedStudents: MentionedStudent[];
  onMentionsChange: (students: MentionedStudent[]) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  helperText?: string;
  autoFocus?: boolean;
  classId?: string;
}

const MentionTextarea: React.FC<Props> = ({
  value,
  onChange,
  mentionedStudents,
  onMentionsChange,
  placeholder = 'Escribe aquí...',
  rows = 2,
  disabled = false,
  helperText,
  autoFocus = false,
  classId,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reposition the portal dropdown to track the textarea
  const reposition = useCallback(() => {
    if (!textareaRef.current) return;
    const rect = textareaRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
  }, []);

  // Keep repositioning while dropdown is open
  useEffect(() => {
    if (!showDropdown) return;
    reposition();
    // Also reposition after short delay (Ionic modal animation)
    const t1 = setTimeout(reposition, 60);
    const t2 = setTimeout(reposition, 200);
    window.addEventListener('resize', reposition);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', reposition);
    };
  }, [showDropdown, reposition]);

  // Search students when query changes or dropdown opens
  useEffect(() => {
    if (!showDropdown) return;

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const delay = searchQuery.length === 0 ? 0 : 150;

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const q = searchQuery || ' ';
        const res = await studentsApi.search(q, classId);
        setSearchResults(res.data);
        setSelectedIndex(0);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, delay);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, showDropdown, classId]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      onChange(newValue);

      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf('@');

      if (atIndex >= 0) {
        const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
        const afterAt = textBeforeCursor.slice(atIndex + 1);
        const hasNewline = /[\n]/.test(afterAt);

        if ((charBeforeAt === ' ' || charBeforeAt === '\n' || atIndex === 0) && !hasNewline) {
          // Check if this @ belongs to an already-inserted mention
          const alreadyMentioned = mentionedStudents.some(
            (s) => afterAt.startsWith(s.name) && afterAt.length > s.name.length
          );
          if (!alreadyMentioned) {
            setMentionStartPos(atIndex);
            setSearchQuery(afterAt);
            setShowDropdown(true);
            return;
          }
        }
      }

      setShowDropdown(false);
      setSearchQuery('');
      setMentionStartPos(null);
    },
    [onChange, mentionedStudents],
  );

  const insertMention = useCallback(
    (student: SearchResult) => {
      if (mentionStartPos === null) return;
      const textarea = textareaRef.current;
      if (!textarea) return;

      const before = value.slice(0, mentionStartPos);
      const cursorPos = textarea.selectionStart || value.length;
      const after = value.slice(cursorPos);
      const mentionText = `@${student.name} `;
      const newValue = before + mentionText + after;

      onChange(newValue);

      if (!mentionedStudents.find((s) => s.id === student.id)) {
        onMentionsChange([...mentionedStudents, { id: student.id, name: student.name }]);
      }

      setShowDropdown(false);
      setSearchQuery('');
      setMentionStartPos(null);

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.focus();
          const newPos = before.length + mentionText.length;
          textarea.setSelectionRange(newPos, newPos);
        }
      });
    },
    [value, mentionStartPos, mentionedStudents, onChange, onMentionsChange],
  );

  const removeMention = useCallback(
    (studentId: string) => {
      onMentionsChange(mentionedStudents.filter((s) => s.id !== studentId));
    },
    [mentionedStudents, onMentionsChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || searchResults.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(searchResults[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
      }
    },
    [showDropdown, searchResults, selectedIndex, insertMention],
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  const showHelper = helperText && !value;

  // Render the dropdown as a portal into document.body so it escapes all
  // overflow:hidden and CSS transform containers (Ionic modals)
  const dropdown = showDropdown
    ? createPortal(
        <div
          ref={dropdownRef}
          className="mention-textarea__dropdown"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
        >
          {searching && searchResults.length === 0 && (
            <div className="mention-textarea__dropdown-loading">Buscando...</div>
          )}
          {!searching && searchResults.length === 0 && searchQuery.length > 0 && (
            <div className="mention-textarea__dropdown-empty">Sin resultados</div>
          )}
          {!searching && searchResults.length === 0 && searchQuery.length === 0 && (
            <div className="mention-textarea__dropdown-hint">Escribe un nombre...</div>
          )}
          {searchResults.map((s, i) => (
            <button
              key={s.id}
              className={`mention-textarea__dropdown-item ${i === selectedIndex ? 'mention-textarea__dropdown-item--selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(s);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              type="button"
            >
              <span className="mention-textarea__dropdown-name">{s.name}</span>
              {s.classes.length > 0 && (
                <span className="mention-textarea__dropdown-class">
                  {s.classes.map((c) => c.class_name).join(', ')}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="mention-textarea">
      <div className="mention-textarea__wrap">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          autoFocus={autoFocus}
          className="mention-textarea__input"
        />
        {showHelper && (
          <p className="mention-textarea__helper">
            <IonIcon icon={personOutline} />
            {helperText}
          </p>
        )}
      </div>

      {/* Mention chips */}
      {mentionedStudents.length > 0 && (
        <div className="mention-textarea__chips">
          {mentionedStudents.map((s) => (
            <span key={s.id} className="mention-textarea__chip">
              @{s.name}
              <button
                className="mention-textarea__chip-remove"
                onClick={() => removeMention(s.id)}
                type="button"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {dropdown}
    </div>
  );
};

export default MentionTextarea;
