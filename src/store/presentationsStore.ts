import { create } from 'zustand';
import { presentations as api } from '../services/api';
import type { Presentation, PresentationListItem, Slide } from '../types/presentations';

export interface GenerateParams {
  prompt: string;
  title?: string;
  subject_name?: string;
  education_level?: string;
  class_id?: string;
  class_ids?: string[];
  subject_id?: string;
  theme_id?: string;
  target_slides?: number;
  tone?: 'didactico' | 'formal' | 'inspirador' | 'conversacional';
  visual_density?: 'muy_visual' | 'equilibrado' | 'texto_denso';
  reference_material_ids?: string[];
  /** Opcional: vincula la presentación generada a una sesión del calendario. */
  calendar_event_id?: string;
}

/** Eventos emitidos por el endpoint SSE — replicados aquí para el caller. */
export interface StreamingPhaseEvent { type: 'phase'; phase: string; count?: number }
export interface StreamingOutlineEvent { type: 'outline'; title: string; archetype: string; subject_key: string; target_slides: number; slide_ids: string[] }
export interface StreamingSlideEvent { type: 'slide'; index: number; slide: Slide }
export interface StreamingSlideRefinedEvent { type: 'slide_refined'; index: number; slide: Slide; slide_id: string }
export interface StreamingCriticEvent { type: 'critic'; score: number; issues_count: number; slides_to_refine: string[] }
export interface StreamingDoneEvent { type: 'done'; title: string; slide_count: number }
export interface StreamingCreatedEvent { type: 'created'; presentation_id: string; title: string }
export interface StreamingErrorEvent { type: 'error'; detail: string }

export type StreamingEvent =
  | StreamingPhaseEvent
  | StreamingOutlineEvent
  | StreamingSlideEvent
  | StreamingSlideRefinedEvent
  | StreamingCriticEvent
  | StreamingDoneEvent
  | StreamingCreatedEvent
  | StreamingErrorEvent;

interface PresentationsState {
  list: PresentationListItem[];
  current: Presentation | null;
  loadingList: boolean;
  loadingDetail: boolean;
  generating: boolean;

  fetchList: () => Promise<void>;
  fetchDetail: (id: string) => Promise<Presentation | null>;
  generate: (params: GenerateParams) => Promise<Presentation>;
  /** Streaming SSE: cada evento llega al callback. Devuelve un cancel(). */
  generateStream: (
    params: GenerateParams,
    onEvent: (ev: StreamingEvent) => void,
  ) => { cancel: () => void };
  update: (id: string, patch: { title?: string; slides?: Slide[]; theme?: any; class_id?: string | null; subject_id?: string | null }) => Promise<Presentation>;
  chatEdit: (id: string, message: string) => Promise<Presentation>;
  remove: (id: string) => Promise<void>;
  setCurrent: (p: Presentation | null) => void;
}

export const usePresentationsStore = create<PresentationsState>((set, get) => ({
  list: [],
  current: null,
  loadingList: false,
  loadingDetail: false,
  generating: false,

  fetchList: async () => {
    set({ loadingList: true });
    try {
      const res = await api.list();
      set({ list: res.data, loadingList: false });
    } catch {
      set({ loadingList: false });
    }
  },

  fetchDetail: async (id) => {
    set({ loadingDetail: true });
    try {
      const res = await api.get(id);
      const p = res.data as Presentation;
      set({ current: p, loadingDetail: false });
      return p;
    } catch {
      set({ loadingDetail: false });
      return null;
    }
  },

  generateStream: (params, onEvent) => {
    const url = api.generateStreamUrl({
      prompt: params.prompt,
      title: params.title,
      subject_name: params.subject_name,
      education_level: params.education_level,
      class_id: params.class_id,
      class_ids: params.class_ids,
      subject_id: params.subject_id,
      theme_id: params.theme_id,
      target_slides: params.target_slides,
      tone: params.tone,
      visual_density: params.visual_density,
      reference_material_ids: params.reference_material_ids,
      calendar_event_id: params.calendar_event_id,
    });
    const es = new EventSource(url, { withCredentials: true });
    set({ generating: true });

    const emit = (type: StreamingEvent['type']) => (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        onEvent({ type, ...data } as StreamingEvent);
      } catch {
        // Eventos vacíos o malformados se ignoran
      }
    };

    es.addEventListener('phase', emit('phase'));
    es.addEventListener('outline', emit('outline'));
    es.addEventListener('slide', emit('slide'));
    es.addEventListener('slide_refined', emit('slide_refined'));
    es.addEventListener('critic', emit('critic'));
    es.addEventListener('done', emit('done'));
    es.addEventListener('created', (msg) => {
      try {
        const data = JSON.parse((msg as MessageEvent).data);
        onEvent({ type: 'created', ...data });
      } catch {
        // ignore
      }
      set({ generating: false });
      es.close();
    });
    es.addEventListener('error', (msg) => {
      // Si llega un error de protocolo (sin data), simplemente cerramos.
      // Si nuestro backend emitió un `error` con detail, parseamos.
      const md = msg as MessageEvent;
      if (typeof md?.data === 'string') {
        try {
          const data = JSON.parse(md.data);
          onEvent({ type: 'error', ...data });
        } catch {
          onEvent({ type: 'error', detail: 'Conexión perdida con el servidor' });
        }
      } else {
        onEvent({ type: 'error', detail: 'Conexión perdida con el servidor' });
      }
      set({ generating: false });
      es.close();
    });

    return {
      cancel: () => {
        set({ generating: false });
        es.close();
      },
    };
  },

  generate: async (params) => {
    set({ generating: true });
    try {
      const res = await api.generate(params);
      const p = res.data.presentation as Presentation;
      set((s) => ({
        current: p,
        generating: false,
        list: [
          {
            id: p.id,
            title: p.title,
            subject_name: p.subject_name,
            class_id: p.class_id,
            slide_count: p.slides.length,
            theme_id: p.theme?.id,
            status: p.status,
            updated_at: p.updated_at,
          },
          ...s.list,
        ],
      }));
      return p;
    } catch (err) {
      set({ generating: false });
      throw err;
    }
  },

  update: async (id, patch) => {
    const res = await api.update(id, patch);
    const p = res.data as Presentation;
    set((s) => ({
      current: s.current?.id === id ? p : s.current,
      list: s.list.map((x) => (x.id === id ? { ...x, title: p.title, slide_count: p.slides.length, updated_at: p.updated_at } : x)),
    }));
    return p;
  },

  chatEdit: async (id, message) => {
    const res = await api.chat(id, message);
    const p = res.data as Presentation;
    set((s) => ({
      current: s.current?.id === id ? p : s.current,
      list: s.list.map((x) => (x.id === id ? { ...x, title: p.title, slide_count: p.slides.length, updated_at: p.updated_at } : x)),
    }));
    return p;
  },

  remove: async (id) => {
    await api.delete(id);
    set((s) => ({
      list: s.list.filter((x) => x.id !== id),
      current: s.current?.id === id ? null : s.current,
    }));
  },

  setCurrent: (p) => set({ current: p }),
}));
