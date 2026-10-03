import { describe, expect, it } from 'vitest';
import { currentSlide, initialState, keyAction, peek, position, reduce, type Deck, type PresenterAction, type PresenterState } from './presenter';
import { nextSeq, receive, startPeer, type ProjectorMessage } from './projector';

const slide = (id: string, frames = 1, extra: { backupFor?: string; timer?: number } = {}) =>
  ({ id, frames, backupFor: extra.backupFor ?? '', timer: extra.timer ?? 0 });

const deck: Deck = [
  {
    n: 1,
    seq: [slide('p'), slide('a', 3), slide('b', 1, { timer: 4 }), slide('c', 2)],
    hidden: [slide('h1', 1, { backupFor: 'c' }), slide('h2', 2)],
  },
  { n: 2, seq: [slide('q'), slide('r')], hidden: [] },
];

const run = (s: PresenterState, ...actions: PresenterAction[]) => actions.reduce((x, a) => reduce(deck, x, a), s);
const at = (s: PresenterState) => `${currentSlide(deck, s)?.id}:${s.frame}`;
const next = { type: 'next' } as const;
const prev = { type: 'prev' } as const;

describe('presenter', () => {
  it('goes through every build frame before the next slide, and back to the last frame', () => {
    let s = initialState(1);
    const seen = [at(s)];
    for (let i = 0; i < 6; i++) { s = run(s, next); seen.push(at(s)); }
    expect(seen).toEqual(['p:0', 'a:0', 'a:1', 'a:2', 'b:0', 'c:0', 'c:1']);
    expect(at(run(s, next))).toBe('c:1');  // the end stays
    s = run(initialState(1), { type: 'goto', slide: 3 }, prev);
    expect(at(s)).toBe('a:2');
  });

  it('skips hidden slides, shows the backup of the slide on screen with H, then goes on', () => {
    let s = run(initialState(1), { type: 'goto', slide: 4 });
    s = run(s, { type: 'hidden' });
    expect(at(s)).toBe('h1:0');
    expect(position(deck, s).n).toBeNull();
    s = run(s, next);
    expect(at(s)).toBe('c:1');  // last slide of the lesson: back to it
    s = run(initialState(1), { type: 'goto', slide: 2 }, { type: 'hidden' });
    expect(at(s)).toBe('h1:0');  // no backup for «a»: the next one not shown
    s = run(s, { type: 'hidden' });
    expect(at(s)).toBe('h2:0');
    s = run(s, next, next);
    expect(at(s)).toBe('b:0');
    s = run(initialState(1), { type: 'goto', slide: 2 }, { type: 'hidden' }, prev);
    expect(at(s)).toBe('a:2');
  });

  it('shows a backup slide from the teacher view', () => {
    const s = run(initialState(1), { type: 'show', id: 'h2' });
    expect(at(s)).toBe('h2:0');
    expect(run(s, { type: 'show', id: 'nada' })).toEqual(s);
  });

  it('jumps to a slide typed as digits and Intro, Inicio and Fin', () => {
    let s = run(initialState(1), { type: 'digit', digit: '3' });
    expect(s.typed).toBe('3');
    s = run(s, { type: 'enter' });
    expect(at(s)).toBe('b:0');
    expect(s.typed).toBe('');
    expect(at(run(s, { type: 'digit', digit: '9' }, { type: 'digit', digit: '9' }, { type: 'enter' }))).toBe('c:0');
    expect(at(run(s, { type: 'enter' }))).toBe('c:0');  // Intro without digits: next
    expect(at(run(s, { type: 'last' }))).toBe('c:0');
    expect(at(run(s, { type: 'first' }))).toBe('p:0');
  });

  it('blanks the screen black or white, and the next key brings the slide back', () => {
    let s = run(initialState(1), { type: 'blank', blank: 'black' });
    expect(s.blank).toBe('black');
    expect(run(s, { type: 'blank', blank: 'black' }).blank).toBe('none');
    s = run(s, { type: 'blank', blank: 'white' });
    expect(s.blank).toBe('white');
    s = run(s, next);
    expect(s.blank).toBe('none');
    expect(at(s)).toBe('p:0');
  });

  it('starts the timer only on a slide that has one, and stops it', () => {
    expect(run(initialState(1), { type: 'timer', now: 0 }).timer).toBeNull();
    const s = run(initialState(1), { type: 'goto', slide: 3 }, { type: 'timer', now: 1000 });
    expect(s.timer).toEqual({ slideId: 'b', endsAt: 1000 + 4 * 60_000 });
    expect(run(s, { type: 'timer', now: 2000 }).timer).toBeNull();
  });

  it('switches lessons to the cover, and the teacher view peeks at the next click', () => {
    const s = run(initialState(1), { type: 'goto', slide: 2 }, { type: 'lesson', lesson: 2 });
    expect(at(s)).toBe('q:0');
    expect(run(s, { type: 'lesson', lesson: 9 })).toEqual(s);
    const a = run(initialState(1), next);
    expect(peek(deck, a)).toEqual({ slide: deck[0].seq[1], frame: 1 });
    expect(peek(deck, run(initialState(2), next))).toBeNull();
  });

  it('follows a state received by id, clamped to the deck', () => {
    const s = run(initialState(1), { type: 'jump', lesson: 1, slideId: 'c', frame: 7 });
    expect(at(s)).toBe('c:1');
    expect(at(run(s, { type: 'jump', lesson: 1, slideId: 'h2', frame: 1 }))).toBe('h2:1');
    expect(at(run(s, { type: 'jump', lesson: 2, slideId: 'r', frame: 0 }))).toBe('r:0');
  });

  it('maps PowerPoint keys', () => {
    expect(keyAction('ArrowRight')).toEqual(next);
    expect(keyAction(' ')).toEqual(next);
    expect(keyAction('PageUp')).toEqual(prev);
    expect(keyAction('.')).toEqual({ type: 'blank', blank: 'black' });
    expect(keyAction(',')).toEqual({ type: 'blank', blank: 'white' });
    expect(keyAction('H')).toEqual({ type: 'hidden' });
    expect(keyAction('7')).toEqual({ type: 'digit', digit: '7' });
    expect(keyAction('p')).toBeNull();
  });
});

describe('projector channel', () => {
  const state = (seq: number, slide = 'a'): ProjectorMessage =>
    ({ type: 'state', seq, lesson: 1, slide, frame: 0, blank: 'none', timer: null });

  it('the teacher view owns the state, applies forwarded keys and answers hello', () => {
    let t = startPeer('teacher');
    const k = receive(t, { type: 'key', seq: 5, key: 'ArrowRight' });
    expect(k.key).toBe('ArrowRight');
    t = k.peer;
    expect(receive(t, { type: 'key', seq: 4, key: 'ArrowLeft' }).key).toBeUndefined();  // older: ignored
    expect(receive(t, { type: 'hello', seq: 1 }).reply).toBe(true);
    expect(receive(t, state(99)).show).toBeUndefined();
    expect(receive(t, state(99)).peer.owner).toBe(true);
  });

  it('a projector window follows the teacher view in seq order', () => {
    let p = startPeer('projector');
    expect(p.owner).toBe(true);
    let r = receive(p, state(10, 'b'));
    expect(r.show?.slide).toBe('b');
    p = r.peer;
    expect(p.owner).toBe(false);
    expect(receive(p, state(9, 'a')).show).toBeUndefined();
    r = receive(p, state(11, 'c'));
    expect(r.show?.slide).toBe('c');
    expect(receive(r.peer, { type: 'hello', seq: 12 }).reply).toBeUndefined();  // it does not own the state
    expect(receive(r.peer, { type: 'bye', seq: 12 }).peer.owner).toBe(true);
  });

  it('a lone projector window owns its state and answers another window', () => {
    expect(receive(startPeer('projector'), { type: 'hello', seq: 1 }).reply).toBe(true);
  });

  it('seq keeps increasing across reloads', () => {
    expect(nextSeq(0, 1000)).toBe(1000);
    expect(nextSeq(1000, 1000)).toBe(1001);
    expect(nextSeq(5000, 1000)).toBe(5001);
  });
});
