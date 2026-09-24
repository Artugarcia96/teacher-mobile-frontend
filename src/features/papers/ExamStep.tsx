import type { ReactNode } from 'react';
import { List, Row, RowIcon, Section } from '../../ui';

interface Props {
  n: number;
  title: string;
  /** One line shown when the step is collapsed. */
  summary: ReactNode;
  open: boolean;
  onOpen: () => void;
  action?: ReactNode;
  children: ReactNode;
}

/** One of the three exam steps: expanded as a Section, or summarized in a single tappable row. */
export function ExamStep({ n, title, summary, open, onOpen, action, children }: Props) {
  if (!open) {
    return (
      <List>
        <Row lead={<RowIcon>{n}</RowIcon>} title={title} sub={summary} onClick={onOpen} />
      </List>
    );
  }
  return (
    <Section title={`${n} · ${title}`} action={action} className="exam-step">
      {children}
    </Section>
  );
}
