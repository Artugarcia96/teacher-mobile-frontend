import type { ReactNode } from 'react';
import { List, Row, RowIcon, Section } from '../../ui';

export interface ExamStepSpec {
  /** 1 Preparar · 2 Recoger · 3 Revisar (or Poner notas). */
  id: number;
  /** The number shown (Poner notas is the 2nd step when there is no document). */
  n: number;
  title: string;
  /** One line with the step's state, shown when it is collapsed ("Preparado · 6 preguntas"). */
  summary: ReactNode;
  action?: ReactNode;
  content: ReactNode;
}

/** The exam steps: the open one as a Section; the others, one compact tappable row each, consecutive rows in one
 * List (the state of the exam at a glance). The numbered square is only for steps. */
export function ExamSteps({ steps, open, onOpen }: { steps: ExamStepSpec[]; open: number; onOpen: (n: number) => void }) {
  const blocks: ReactNode[] = [];
  let rows: ExamStepSpec[] = [];
  const flush = () => {
    if (!rows.length) return;
    blocks.push(
      <List key={`rows-${rows[0].id}`}>
        {rows.map((s) => <Row key={s.id} lead={<RowIcon>{s.n}</RowIcon>} title={s.title} sub={s.summary} wrapSub onClick={() => onOpen(s.id)} />)}
      </List>,
    );
    rows = [];
  };
  for (const s of steps) {
    if (s.id !== open) { rows.push(s); continue; }
    flush();
    blocks.push(<Section key={s.id} title={`${s.n} · ${s.title}`} action={s.action} className="exam-step">{s.content}</Section>);
  }
  flush();
  return <>{blocks}</>;
}
