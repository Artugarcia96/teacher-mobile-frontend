/** The presenter as a pure state machine: which lesson, slide and build frame is on the projector, whether the screen
 *  is blanked, which backup slides were shown and the classroom timer. The page, the teacher view and the projector
 *  window all drive the same reducer (PowerPoint's keys, §1.3), so the projector window can follow the teacher view by
 *  receiving its state. */

/** One slide as the presenter needs it: its build frames (clicks + 1) and, for a backup slide, the slide it supports. */
export interface DeckSlide {
  id: string;
  frames: number;
  /** A backup slide: the id of the slide it supports («Otro ejemplo»), or "". */
  backupFor: string;
  /** Minutes of the classroom timer (task slides), 0 when the slide has none. */
  timer: number;
}
/** A lesson in projection order: `seq` the slides projected (cover first, credits left out), `hidden` its backup slides. */
export interface DeckLesson { n: number; seq: DeckSlide[]; hidden: DeckSlide[] }
export type Deck = DeckLesson[];

export type Blank = 'none' | 'black' | 'white';
export interface Timer { slideId: string; endsAt: number }

export interface PresenterState {
  lesson: number;
  /** Index into the lesson's `seq`. While a backup slide is shown (`detour`), the slide it was shown from. */
  pos: number;
  /** The backup slide on screen, if any: after it, «next» goes on from `pos + 1`. */
  detour: string | null;
  frame: number;
  blank: Blank;
  /** Backup slides already shown in this lesson (H shows the next one not shown). */
  seen: string[];
  /** Digits typed before Intro («12» + Intro: slide 12). */
  typed: string;
  timer: Timer | null;
}

export type PresenterAction =
  | { type: 'next' } | { type: 'prev' } | { type: 'first' } | { type: 'last' }
  | { type: 'goto'; slide: number }
  | { type: 'digit'; digit: string }
  | { type: 'enter' }
  | { type: 'blank'; blank: Exclude<Blank, 'none'> }
  | { type: 'hidden' }
  | { type: 'show'; id: string }
  | { type: 'timer'; now: number }
  | { type: 'lesson'; lesson: number }
  | { type: 'jump'; lesson: number; slideId: string; frame: number };

export function initialState(lesson: number, slide = 1): PresenterState {
  return { lesson, pos: Math.max(0, slide - 1), detour: null, frame: 0, blank: 'none', seen: [], typed: '', timer: null };
}

function lessonOf(deck: Deck, n: number): DeckLesson | undefined {
  return deck.find((l) => l.n === n);
}

/** The slide on screen. */
export function currentSlide(deck: Deck, s: PresenterState): DeckSlide | undefined {
  const l = lessonOf(deck, s.lesson);
  if (!l) return undefined;
  if (s.detour) return l.hidden.find((h) => h.id === s.detour);
  return l.seq[Math.min(s.pos, l.seq.length - 1)];
}

/** A state brought back inside its lesson (a deck that changed under it: a slide removed, fewer frames). */
export function clamp(deck: Deck, s: PresenterState): PresenterState {
  const l = lessonOf(deck, s.lesson) ?? deck[0];
  if (!l) return s;
  const detour = s.detour && l.hidden.some((h) => h.id === s.detour) ? s.detour : null;
  const pos = Math.max(0, Math.min(s.pos, l.seq.length - 1));
  const out = { ...s, lesson: l.n, pos, detour };
  const slide = currentSlide(deck, out);
  return { ...out, frame: Math.max(0, Math.min(s.frame, (slide?.frames ?? 1) - 1)) };
}

const fresh = (s: PresenterState, patch: Partial<PresenterState>): PresenterState => ({ ...s, typed: '', ...patch });

export function reduce(deck: Deck, s: PresenterState, a: PresenterAction): PresenterState {
  const l = lessonOf(deck, s.lesson);
  if (!l || !l.seq.length) return a.type === 'lesson' && lessonOf(deck, a.lesson) ? initialState(a.lesson) : s;
  const slide = currentSlide(deck, s);
  const frames = slide?.frames ?? 1;
  const lastPos = l.seq.length - 1;
  switch (a.type) {
    case 'next':
      if (s.blank !== 'none') return fresh(s, { blank: 'none' });
      if (s.frame < frames - 1) return fresh(s, { frame: s.frame + 1 });
      if (s.detour) return s.pos < lastPos ? fresh(s, { detour: null, pos: s.pos + 1, frame: 0 }) : fresh(s, { detour: null, frame: l.seq[s.pos].frames - 1 });
      return s.pos < lastPos ? fresh(s, { pos: s.pos + 1, frame: 0 }) : fresh(s, {});
    case 'prev':
      if (s.blank !== 'none') return fresh(s, { blank: 'none' });
      if (s.frame > 0) return fresh(s, { frame: s.frame - 1 });
      if (s.detour) return fresh(s, { detour: null, frame: l.seq[s.pos].frames - 1 });
      return s.pos > 0 ? fresh(s, { pos: s.pos - 1, frame: l.seq[s.pos - 1].frames - 1 }) : fresh(s, {});
    case 'first':
      return fresh(s, { pos: 0, detour: null, frame: 0, blank: 'none' });
    case 'last':
      return fresh(s, { pos: lastPos, detour: null, frame: 0, blank: 'none' });
    case 'goto': {
      const pos = Math.max(0, Math.min(lastPos, a.slide - 1));
      return fresh(s, { pos, detour: null, frame: 0, blank: 'none' });
    }
    case 'digit':
      return /^\d$/.test(a.digit) ? { ...s, typed: (s.typed + a.digit).slice(-3) } : s;
    case 'enter':
      return s.typed ? reduce(deck, s, { type: 'goto', slide: Number(s.typed) }) : reduce(deck, s, { type: 'next' });
    case 'blank':
      return fresh(s, { blank: s.blank === a.blank ? 'none' : a.blank });
    case 'hidden': {
      const from = s.detour ? null : l.seq[s.pos]?.id;
      const target = l.hidden.find((h) => from && h.backupFor === from && h.id !== s.detour)
        ?? l.hidden.find((h) => !s.seen.includes(h.id) && h.id !== s.detour);
      return target ? reduce(deck, s, { type: 'show', id: target.id }) : fresh(s, {});
    }
    case 'show':
      if (!l.hidden.some((h) => h.id === a.id)) return s;
      return fresh(s, { detour: a.id, frame: 0, blank: 'none', seen: s.seen.includes(a.id) ? s.seen : [...s.seen, a.id] });
    case 'timer': {
      if (!slide) return s;
      if (s.timer?.slideId === slide.id) return fresh(s, { timer: null });
      return slide.timer > 0 ? fresh(s, { timer: { slideId: slide.id, endsAt: a.now + slide.timer * 60_000 } }) : fresh(s, {});
    }
    case 'lesson':
      return lessonOf(deck, a.lesson) ? { ...initialState(a.lesson), timer: s.timer } : s;
    case 'jump': {
      const target = lessonOf(deck, a.lesson);
      if (!target) return s;
      const pos = target.seq.findIndex((x) => x.id === a.slideId);
      const base = a.lesson === s.lesson ? s : initialState(a.lesson);
      const next = pos >= 0
        ? { ...base, pos, detour: null, frame: a.frame }
        : target.hidden.some((h) => h.id === a.slideId) ? { ...base, detour: a.slideId, frame: a.frame } : base;
      return clamp(deck, { ...next, typed: '' });
    }
  }
}

/** What the next click shows (the teacher view's «Siguiente»): the next frame of this slide, or the next slide. */
export function peek(deck: Deck, s: PresenterState): { slide: DeckSlide; frame: number } | null {
  const now = { ...s, blank: 'none' as Blank };
  const after = reduce(deck, now, { type: 'next' });
  if (after.pos === now.pos && after.detour === now.detour && after.frame === now.frame) return null;
  const slide = currentSlide(deck, after);
  return slide ? { slide, frame: after.frame } : null;
}

/** «Diapositiva 6 de 18»: the number of the slide on screen among the projected ones (a backup slide: none). */
export function position(deck: Deck, s: PresenterState): { n: number | null; total: number } {
  const l = lessonOf(deck, s.lesson);
  return { n: s.detour ? null : s.pos + 1, total: l?.seq.length ?? 0 };
}

/** The keyboard (PowerPoint's keys) as actions. T needs the clock and P opens a window, so the caller handles them. */
export function keyAction(key: string): PresenterAction | null {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(key)) return { type: 'next' };
  if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) return { type: 'prev' };
  if (key === 'Enter') return { type: 'enter' };
  if (key === 'Home') return { type: 'first' };
  if (key === 'End') return { type: 'last' };
  if (key === 'b' || key === 'B' || key === '.') return { type: 'blank', blank: 'black' };
  if (key === 'w' || key === 'W' || key === ',') return { type: 'blank', blank: 'white' };
  if (key === 'h' || key === 'H') return { type: 'hidden' };
  if (/^\d$/.test(key)) return { type: 'digit', digit: key };
  return null;
}
