/** The presenter's view of a material: its lessons as a `Deck` built from what the server sends (lessons, frames,
 *  slides), and the hooks the presenter, the teacher view and the projector window share: the state, prefetching the
 *  frames, the classroom clock and telling the server where the class got to. */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Archetype, ContentDoc, Slide } from '../../api/content';
import { postPresented, presentationLessons, type MaterialDetail } from '../../api/units';
import { fileUrl } from '../../lib/api';
import { clamp, currentSlide, reduce, type Deck, type DeckSlide, type PresenterAction, type PresenterState } from './presenter';

/** Task slides carry the classroom timer (§1.3): it counts down from the slide's minutes. */
const TIMED: Archetype[] = ['para_empezar', 'piensa_comparte', 'practica', 'clasifica', 'tu_turno', 'ticket_salida'];

export function deckOf(m: MaterialDetail, doc: ContentDoc): Deck {
  const byId = new Map(doc.slides.map((s) => [s.id, s]));
  const slide = (id: string): DeckSlide | null => {
    const s = byId.get(id);
    if (!s) return null;
    return {
      id, frames: Math.max(1, m.slide_images[id]?.frames.length ?? 1), backupFor: s.backup_for,
      timer: TIMED.includes(s.archetype) ? s.minutes : 0,
    };
  };
  return presentationLessons(m).filter((l) => l.status === 'ready').map((l) => ({
    n: l.n,
    // The credits slide is in the PDFs and the .pptx, never projected.
    seq: l.slide_ids.filter((id) => byId.get(id)?.archetype !== 'creditos').flatMap((id) => slide(id) ?? []),
    hidden: l.hidden_ids.flatMap((id) => slide(id) ?? []),
  }));
}

/** The image of a slide at a build frame (the card while its frames are missing). */
export function frameUrl(m: MaterialDetail, id: string, frame: number): string | undefined {
  const img = m.slide_images[id];
  if (!img) return undefined;
  return fileUrl(img.frames[Math.min(frame, img.frames.length - 1)] ?? img.card);
}

export function slideOf(doc: ContentDoc, id: string | undefined): Slide | undefined {
  return id ? doc.slides.find((s) => s.id === id) : undefined;
}

/** The presenter's state, kept inside the deck when the material changes under it (a lesson lands, a slide moves). */
export function usePresenterState(deck: Deck, init: PresenterState) {
  const [state, dispatch] = useReducer(
    (s: PresenterState, a: PresenterAction | { type: 'set'; state: PresenterState }) => (a.type === 'set' ? a.state : reduce(deck, s, a)),
    init,
  );
  const safe = useMemo(() => clamp(deck, state), [deck, state]);
  return [safe, dispatch] as const;
}

/** Frames load before they are needed: the current slide and the next three first, then the rest of the lesson when
 *  the browser is idle, so a weak classroom Wi-Fi does not stall mid-lesson. */
export function usePrefetch(m: MaterialDetail, deck: Deck, s: PresenterState) {
  const loaded = useRef(new Set<string>());
  useEffect(() => {
    const lesson = deck.find((l) => l.n === s.lesson);
    if (!lesson) return undefined;
    const load = (ids: string[]) => {
      for (const id of ids) {
        for (const url of m.slide_images[id]?.frames ?? []) {
          const src = fileUrl(url);
          if (!src || loaded.current.has(src)) continue;
          loaded.current.add(src);
          const img = new Image();
          img.decoding = 'async';
          img.src = src;
        }
      }
    };
    const ids = lesson.seq.map((x) => x.id);
    load(ids.slice(s.pos, s.pos + 4));
    const rest = [...ids, ...lesson.hidden.map((x) => x.id)];
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => load(rest));
    return () => cancel(handle);
  }, [m, deck, s.lesson, s.pos]);
}

/** The time now, ticking every second (the classroom timer, the teacher view's clock). */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** Tells the server how far the class got: when a lesson reaches its fourth projected slide, then at most once a
 *  minute with the furthest slide reached. The server keeps it only during a class of that group (§1.3). */
export function useReportPresented(materialId: string, s: PresenterState, enabled = true) {
  const furthest = useRef(new Map<number, number>());
  const sent = useRef(new Map<number, { at: number; slide: number }>());
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || s.detour) return;
    const slide = s.pos + 1;
    const best = Math.max(furthest.current.get(s.lesson) ?? 0, slide);
    furthest.current.set(s.lesson, best);
    if (best < 4) return;
    const last = sent.current.get(s.lesson);
    if (last?.slide === best) return;
    const send = () => {
      const now = Date.now();
      const reach = furthest.current.get(s.lesson) ?? best;
      sent.current.set(s.lesson, { at: now, slide: reach });
      void postPresented(materialId, s.lesson, reach);
    };
    if (!last || Date.now() - last.at >= 60_000) send();
    else if (timer.current == null) {
      timer.current = window.setTimeout(() => { timer.current = null; send(); }, 60_000 - (Date.now() - last.at));
    }
  }, [materialId, enabled, s.lesson, s.pos, s.detour]);
  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current); }, []);
}

/** «04:00»: minutes and seconds left (never below zero). */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The slide on screen and its image at the current frame. */
export function onScreen(m: MaterialDetail, doc: ContentDoc, deck: Deck, s: PresenterState) {
  const slide = currentSlide(deck, s);
  return { slide, content: slideOf(doc, slide?.id), src: slide ? frameUrl(m, slide.id, s.frame) : undefined, alt: slide ? m.slide_images[slide.id]?.alt ?? '' : '' };
}

