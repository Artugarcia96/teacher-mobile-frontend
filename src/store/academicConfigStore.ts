import { create } from 'zustand';
import { academicConfig as api } from '../services/api';
import type { PeriodMode } from '../utils/periodConfig';

export interface AcademicConfigData {
  id: string;
  teacherId: string;
  classId: string | null;
  year: string;
  periodMode: PeriodMode;
  trimester1Start: string;
  trimester1End: string;
  trimester2Start: string;
  trimester2End: string;
  trimester3Start: string | null;
  trimester3End: string | null;
  recoveryStart: string | null;
  recoveryEnd: string | null;
}

const mapConfig = (d: any): AcademicConfigData => ({
  id: d.id,
  teacherId: d.teacher_id,
  classId: d.class_id,
  year: d.year,
  periodMode: d.period_mode || 'trimester',
  trimester1Start: d.trimester_1_start,
  trimester1End: d.trimester_1_end,
  trimester2Start: d.trimester_2_start,
  trimester2End: d.trimester_2_end,
  trimester3Start: d.trimester_3_start,
  trimester3End: d.trimester_3_end,
  recoveryStart: d.recovery_start,
  recoveryEnd: d.recovery_end,
});

interface AcademicConfigState {
  configs: Record<string, AcademicConfigData | null>;
  loading: Record<string, boolean>;
  fetchConfig: (classId: string) => Promise<AcademicConfigData | null>;
  setConfig: (classId: string, config: AcademicConfigData | null) => void;
}

export const useAcademicConfigStore = create<AcademicConfigState>((set, get) => ({
  configs: {},
  loading: {},

  fetchConfig: async (classId: string) => {
    // Return cached if available
    if (classId in get().configs) return get().configs[classId];

    set((s) => ({ loading: { ...s.loading, [classId]: true } }));
    try {
      const res = await api.get(classId);
      const config = mapConfig(res.data);
      set((s) => ({
        configs: { ...s.configs, [classId]: config },
        loading: { ...s.loading, [classId]: false },
      }));
      return config;
    } catch {
      // 404 = not configured
      set((s) => ({
        configs: { ...s.configs, [classId]: null },
        loading: { ...s.loading, [classId]: false },
      }));
      return null;
    }
  },

  setConfig: (classId, config) => {
    set((s) => ({ configs: { ...s.configs, [classId]: config } }));
  },
}));
