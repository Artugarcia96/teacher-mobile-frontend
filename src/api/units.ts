/** Programación (units) & materials. Backend: app/api/units.py (slice E). Slice E extends this file;
 * keep `Unit`, `unitKeys` and `useUnits` stable — other areas import them. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl, uploadWithProgress } from '../lib/api';
import type { CourseRef, Job } from './types';

export type UnitStatus = 'pending' | 'current' | 'done';
export interface Unit {
  id: string; course_id: string; title: string; term: number | null; position: number; status: UnitStatus; summary?: string | null;
  material_count: number; shared_count?: number;
}

export const unitKeys = {
  list: (courseId: string) => ['course', courseId, 'units'] as const,
  one: (unitId: string) => ['unit', unitId] as const,
  material: (materialId: string) => ['material', materialId] as const,
  grounding: (unitIds: string[]) => ['grounding', ...unitIds] as const,
};

export function useUnits(courseId: string | undefined) {
  return useQuery({ queryKey: unitKeys.list(courseId!), queryFn: () => api.get<Unit[]>(`/courses/${courseId}/units`), enabled: !!courseId });
}

// ── Material types (mirror app/ai/schemas.py + app/schemas/units.py) ────────
export type MaterialKind = 'upload' | 'link' | 'notes' | 'slides' | 'summary' | 'adapted' | 'worksheet';
export type GenKind = Exclude<MaterialKind, 'upload' | 'link'>;
export type Audience = 'alumnos' | 'profesor';
export type LinkKind = 'youtube' | 'drive' | 'genially' | 'canva' | 'wordwall' | 'web';
export type WorksheetKind = 'refuerzo' | 'practica' | 'ampliacion';
export type Difficulty = 'facil' | 'medio' | 'dificil';

export interface Material {
  id: string; unit_id: string | null; kind: MaterialKind; title: string; status: 'ready' | 'generating' | 'failed';
  error?: string | null; options: Record<string, unknown>; created_at: string; updated_at: string;
  file_url?: string | null; extra_url?: string | null; pptx_url?: string | null; job_id?: string | null;
  /** Metadata (app/services/materials.py): who it is for, manual order, the teacher's note, last opened (date). */
  audience: Audience; position: number; notes?: string | null; last_used_at?: string | null;
  /** AI reading of photos / scanned PDFs, so generation for the unit can use their text. */
  text_status?: 'reading' | 'done' | 'failed' | null;
  url?: string | null; link_kind?: LinkKind | null; shared: boolean;
}

export interface Share { url: string; path: string; expires_on: string; qr_png: string | null }

/** What the AI reads when creating for the unit(s): `used` of `chars` characters (0 = left out). */
export interface GroundingSource {
  id: string; unit_id: string | null; title: string; kind: MaterialKind; own: boolean; filename?: string | null; chars: number; used: number;
}
export interface Grounding { sources: GroundingSource[]; reading: { id: string; title: string }[] }

export type BlockType = 'text' | 'definition' | 'example' | 'formula' | 'note' | 'list' | 'exercise';
export interface Block { id: string; type: BlockType; title: string; text: string; items: string[]; solution: string }
export interface DocSection { id: string; title: string; blocks: Block[] }
export interface NotesDoc { title: string; subtitle: string; objectives: string[]; sections: DocSection[]; self_check: string[] }

export interface Slide { title: string; bullets: string[]; example: string; notes: string }
export interface SlideDeck { title: string; subtitle: string; slides: Slide[] }

export interface Item { id: string; label: string; text: string; points: number; answer: string; steps: string[]; options: string[]; level: string }
export interface AssessmentDoc { title: string; instructions: string; sections: { title: string; items: Item[] }[] }

export interface MaterialDetail extends Material {
  content: NotesDoc | SlideDeck | AssessmentDoc | null; course: CourseRef; unit_title?: string | null;
}
export interface UnitDetail { unit: Unit; course: CourseRef; materials: Material[] }

export interface GenerateInput {
  kind: GenKind; length?: 'breve' | 'normal'; worksheet_kind?: WorksheetKind; n_items?: number; difficulty?: Difficulty;
  instructions?: string; from_material_id?: string;
}

export const MATERIAL_LABEL: Record<MaterialKind, string> = {
  upload: 'Archivo subido', link: 'Enlace', notes: 'Apuntes', slides: 'Presentación', summary: 'Resumen', adapted: 'Lectura fácil', worksheet: 'Ficha',
};

// ── Units ────────────────────────────────────────────────────────────────────
function useInvalidateCourse(courseId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['course', courseId] });
    qc.invalidateQueries({ queryKey: ['unit'] });
  };
}

export function useCreateUnit(courseId: string) {
  const done = useInvalidateCourse(courseId);
  return useMutation({
    mutationFn: (body: { title: string; term: number | null; status?: UnitStatus }) => api.post<Unit>(`/courses/${courseId}/units`, body),
    onSuccess: done,
  });
}

export function usePatchUnit(courseId: string) {
  const done = useInvalidateCourse(courseId);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; term?: number | null; status?: UnitStatus; summary?: string | null }) =>
      api.patch<Unit>(`/units/${id}`, body),
    onSuccess: done,
  });
}

export function useDeleteUnit(courseId: string) {
  const done = useInvalidateCourse(courseId);
  return useMutation({ mutationFn: (id: string) => api.delete(`/units/${id}`), onSuccess: done });
}

export function useOrderUnits(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.put<Unit[]>(`/courses/${courseId}/units/order`, { ids }),
    onMutate: (ids) => {
      const prev = qc.getQueryData<Unit[]>(unitKeys.list(courseId));
      if (prev) {
        const byId = new Map(prev.map((u) => [u.id, u]));
        qc.setQueryData(unitKeys.list(courseId), ids.map((id, i) => ({ ...byId.get(id)!, position: i })));
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(unitKeys.list(courseId), ctx.prev),
    onSuccess: (data) => qc.setQueryData(unitKeys.list(courseId), data),
  });
}

export function useImportUnits(courseId: string) {
  return useMutation({
    mutationFn: (text: string) => api.post<{ proposals: { title: string; term: number | null }[] }>(`/courses/${courseId}/units/import`, { text }),
  });
}

export function useBulkUnits(courseId: string) {
  const done = useInvalidateCourse(courseId);
  return useMutation({
    mutationFn: (units: { title: string; term: number | null }[]) => api.post<Unit[]>(`/courses/${courseId}/units/bulk`, { units }),
    onSuccess: done,
  });
}

export function useCopyUnits(courseId: string) {
  const done = useInvalidateCourse(courseId);
  return useMutation({
    mutationFn: (fromCourseId: string) => api.post<Unit[]>(`/courses/${courseId}/units/copy`, { from_course_id: fromCourseId }),
    onSuccess: done,
  });
}

/** Unit + its materials. Refetches every 1,5 s while any material is being generated. */
export function useUnit(unitId: string | undefined) {
  return useQuery({
    queryKey: unitKeys.one(unitId!),
    queryFn: () => api.get<UnitDetail>(`/units/${unitId}`),
    enabled: !!unitId,
    refetchInterval: (q) => (q.state.data?.materials.some(isBusy) ? 1500 : false),
  });
}

/** Being generated or read by the AI (the unit refreshes itself meanwhile). */
export function isBusy(m: Pick<Material, 'status' | 'text_status'>) {
  return m.status === 'generating' || m.text_status === 'reading';
}

// ── Materials ────────────────────────────────────────────────────────────────
function useInvalidateUnit(unitId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    if (unitId) qc.invalidateQueries({ queryKey: unitKeys.one(unitId) });
    qc.invalidateQueries({ queryKey: ['course'] });
    qc.invalidateQueries({ queryKey: ['library'] });
    qc.invalidateQueries({ queryKey: ['today'] });
    qc.invalidateQueries({ queryKey: ['grounding'] });
  };
}

/** Several files in one request. `asPages`: photos of book pages become ONE material (a PDF) that the AI reads.
 *  `onProgress` (0-1) reports the upload itself (school Wi-Fi: several MB take a while). */
export function useUploadMaterials(unitId: string) {
  const done = useInvalidateUnit(unitId);
  return useMutation({
    mutationFn: ({ files, asPages, title, onProgress }: {
      files: File[]; asPages?: boolean; title?: string; onProgress?: (fraction: number) => void;
    }) => {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      if (asPages) form.append('as_pages', 'true');
      if (title) form.append('title', title);
      const path = `/units/${unitId}/materials`;
      return onProgress ? uploadWithProgress<Material[]>(path, form, onProgress) : api.upload<Material[]>(path, form);
    },
    onSuccess: done,
  });
}

/** Photos of book pages per material: the AI reads at most this many (backend READ_MAX_PAGES). */
export const MAX_PAGES = 30;

/** What the AI will read for these units (own material first, fairly shared). Refreshes while files are read. */
export function useGrounding(unitIds: string[]) {
  const ids = [...unitIds].sort();
  return useQuery({
    queryKey: unitKeys.grounding(ids),
    queryFn: () => api.get<Grounding>(`/grounding?unit_ids=${ids.join(',')}`),
    enabled: ids.length > 0,
    refetchInterval: (q) => (q.state.data?.reading.length ? 3000 : false),
  });
}

export function useAddLink(unitId: string) {
  const done = useInvalidateUnit(unitId);
  return useMutation({
    mutationFn: (body: { url: string; title?: string }) => api.post<Material>(`/units/${unitId}/links`, body),
    onSuccess: done,
  });
}

function useInvalidateMaterials() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['unit'] });
    qc.invalidateQueries({ queryKey: ['material'] });
    qc.invalidateQueries({ queryKey: ['course'] });
    qc.invalidateQueries({ queryKey: ['library'] });
    qc.invalidateQueries({ queryKey: ['today'] });
    qc.invalidateQueries({ queryKey: ['grounding'] });
  };
}

export interface MaterialMeta { title?: string; unit_id?: string; audience?: Audience; position?: number; notes?: string | null }

/** Rename, move to another unit/class, "para alumnos"/"solo para mí", reorder (`position` = index without it), note. */
export function useUpdateMaterial() {
  const done = useInvalidateMaterials();
  return useMutation({
    mutationFn: ({ id, ...body }: MaterialMeta & { id: string }) => api.patch<MaterialDetail>(`/materials/${id}`, body),
    onSuccess: done,
  });
}

/** Reuse in another unit (maybe another class): same files, independent copy. */
export function useCopyMaterial() {
  const done = useInvalidateMaterials();
  return useMutation({
    mutationFn: ({ id, unitId }: { id: string; unitId: string }) => api.post<Material>(`/materials/${id}/copy`, { unit_id: unitId }),
    onSuccess: done,
  });
}

export function useReadMaterial() {
  const done = useInvalidateMaterials();
  return useMutation({ mutationFn: (id: string) => api.post<Material>(`/materials/${id}/read`), onSuccess: done });
}

/** Public link for students (60 days) + QR. Idempotent. */
export function useShareMaterial() {
  const done = useInvalidateMaterials();
  return useMutation({
    mutationFn: ({ id, origin }: { id: string; origin: string }) => api.post<Share>(`/materials/${id}/share`, { origin }),
    onSuccess: done,
  });
}

export function useUnshareMaterial() {
  const done = useInvalidateMaterials();
  return useMutation({ mutationFn: (id: string) => api.delete(`/materials/${id}/share`), onSuccess: done });
}

export function useGenerateMaterial(unitId: string) {
  const qc = useQueryClient();
  const done = useInvalidateUnit(unitId);
  return useMutation({
    mutationFn: (body: GenerateInput) => api.post<{ material: Material; job: Job }>(`/units/${unitId}/generate`, body),
    onSuccess: (data) => {
      qc.setQueryData<UnitDetail>(unitKeys.one(unitId), (old) => old && ({ ...old, materials: [data.material, ...old.materials] }));
      done();
    },
  });
}

export function useMaterial(materialId: string | undefined) {
  return useQuery({
    queryKey: unitKeys.material(materialId!),
    queryFn: () => api.get<MaterialDetail>(`/materials/${materialId}`),
    enabled: !!materialId,
    refetchInterval: (q) => (q.state.data?.status === 'generating' ? 1500 : false),
  });
}

export function usePatchMaterial(materialId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string; content?: MaterialDetail['content'] }) => api.patch<MaterialDetail>(`/materials/${materialId}`, body),
    onSuccess: (data) => {
      qc.setQueryData(unitKeys.material(materialId), data);
      if (data.unit_id) qc.invalidateQueries({ queryKey: unitKeys.one(data.unit_id) });
    },
  });
}

export function useRewriteBlock(materialId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { block_id: string; instruction: string }) => api.post<MaterialDetail>(`/materials/${materialId}/rewrite`, body),
    onSuccess: (data) => qc.setQueryData(unitKeys.material(materialId), data),
  });
}

export function useDeleteMaterial(unitId: string | undefined) {
  const done = useInvalidateUnit(unitId);
  return useMutation({ mutationFn: (id: string) => api.delete(`/materials/${id}`), onSuccess: done });
}

export function useMaterialToActivity(materialId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; max_score?: number }) => api.post<{ activity_id: string }>(`/materials/${materialId}/to-activity`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course'] }); qc.invalidateQueries({ queryKey: ['inbox'] }); },
  });
}

/** Ask for a signed download link and start the download (PDF, .pptx or solucionario). */
export async function downloadMaterial(materialId: string, variant: 'pdf' | 'pptx' | 'key' = 'pdf') {
  const { url } = await api.get<{ url: string }>(`/materials/${materialId}/file?variant=${variant}`);
  const a = document.createElement('a');
  a.href = fileUrl(url)!;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
