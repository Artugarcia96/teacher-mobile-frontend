/** The class has ONE "···" menu (in the page header). The open tab adds its own actions to it with `useCourseMenu`
 *  instead of rendering a second "···" in its toolbar. */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MenuItem } from '../../ui';

type Register = (owner: string, items: MenuItem[] | null) => void;
const Ctx = createContext<Register | null>(null);

/** State for CoursePage: `items` = actions registered by the tabs, first in the menu. */
export function useCourseMenuState() {
  const [sections, setSections] = useState<Record<string, MenuItem[]>>({});
  const register = useCallback<Register>((owner, items) => {
    setSections((prev) => {
      const next = { ...prev };
      if (items) next[owner] = items;
      else delete next[owner];
      return next;
    });
  }, []);
  const items = useMemo(() => Object.values(sections).flat(), [sections]);
  return { items, register };
}

export function CourseMenuProvider({ register, children }: { register: Register; children: ReactNode }) {
  return <Ctx.Provider value={register}>{children}</Ctx.Provider>;
}

/** Add these actions to the class "···" menu while the calling tab is mounted (labels identify them). */
export function useCourseMenu(items: MenuItem[]) {
  const register = useContext(Ctx);
  const id = useId();
  const latest = useRef(items);
  latest.current = items;
  const signature = items.map((i) => i.label).join('\n');
  useEffect(() => {
    if (!register) return;
    register(id, latest.current.map((it, i) => ({ ...it, onSelect: () => latest.current[i]?.onSelect() })));
    return () => register(id, null);
  }, [register, id, signature]);
}
