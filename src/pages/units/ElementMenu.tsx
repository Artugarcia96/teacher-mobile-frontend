import { ArrowsClockwise, ChartBar, DotsThree, PencilSimple, Trash } from '@phosphor-icons/react';
import type { ContentDoc, Element, FigureSpec } from '../../api/content';
import { canEditFigure } from '../../features/materials/FigureSheet';
import { IconButton, Menu, Spinner, type MenuItem } from '../../ui';

export type ElementAction = 'edit' | 'figure' | 'solution_figure' | 'rewrite' | 'remove';

const isSlide = (el: Element): boolean => 'layout' in el;
const figureOf = (el: Element): FigureSpec | null => ('figure' in el ? (el.figure ?? null) : null);

function onlyExercise(doc: ContentDoc, el: Element) {
  if (!('type' in el) || el.type !== 'exercise') return false;
  return doc.sections.flatMap((s) => s.blocks).filter((b) => b.type === 'exercise').length <= 1;
}

/** The actions on one element of a material in edit mode: its text, its figure, an AI rewrite, remove. */
export function ElementMenu({ el, doc, onAction, noAI }: {
  el: Element; doc: ContentDoc; onAction: (action: ElementAction, el: Element) => void; noAI: string | null;
}) {
  const what = isSlide(el) ? 'diapositiva' : 'type' in el && el.type === 'exercise' ? 'ejercicio' : 'apartado';
  const figure = figureOf(el);
  const solved = 'solution_figure' in el ? el.solution_figure : null;
  const figureBlock = 'type' in el && el.type === 'figure';
  const items: MenuItem[] = [
    ...(!figureBlock ? [{ label: 'Editar texto', icon: <PencilSimple size={18} />, onSelect: () => onAction('edit', el) }] : []),
    ...(figure ? [{
      label: 'Editar figura', icon: <ChartBar size={18} />, onSelect: () => onAction('figure', el),
      disabledReason: canEditFigure(figure) ? undefined : 'Esta figura se cambia con «Reescribir con IA»',
    }] : []),
    ...(solved && canEditFigure(solved) ? [{ label: 'Editar figura de la solución', icon: <ChartBar size={18} />, onSelect: () => onAction('solution_figure', el) }] : []),
    {
      label: 'Reescribir con IA…', icon: <ArrowsClockwise size={18} />, onSelect: () => onAction('rewrite', el),
      disabledReason: noAI ?? undefined,
    },
    {
      label: `Quitar ${what}`, icon: <Trash size={18} />, danger: true, separatorBefore: true, onSelect: () => onAction('remove', el),
      disabledReason: onlyExercise(doc, el) ? 'Es el único ejercicio de la ficha: edítalo en lugar de quitarlo' : undefined,
    },
  ];
  return (
    <Menu trigger={(open) => <IconButton size="sm" label={isSlide(el) ? 'Opciones de la diapositiva' : 'Opciones del apartado'} onClick={open}><DotsThree size={18} weight="bold" /></IconButton>}
      items={items} />
  );
}

/** An element being rewritten by the AI: dimmed, with what is happening. */
export function Rewriting() {
  return <div className="element__busy" role="status"><Spinner /><span>Reescribiendo con IA…</span></div>;
}
