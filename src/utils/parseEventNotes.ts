/**
 * Parses structured notes from plan-generated calendar events.
 *
 * Notes format (from plan acceptance):
 *   "Enfoque de la sesión\nPuntos clave: A · B · C\nContenidos: X, Y\nplan:uuid"
 *
 * Returns structured data for clean UI rendering.
 */

export interface ParsedEventNotes {
  focus: string;
  keyPoints: string[];
  contents: string[];
  planId: string;
  topicIds: string[];
  raw: string;
  isPlanEvent: boolean;
}

export function parseEventNotes(notes?: string): ParsedEventNotes {
  const result: ParsedEventNotes = {
    focus: '',
    keyPoints: [],
    contents: [],
    planId: '',
    topicIds: [],
    raw: notes || '',
    isPlanEvent: false,
  };

  if (!notes) return result;

  const lines = notes.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('plan:')) {
      result.planId = line.slice(5);
      result.isPlanEvent = true;
    } else if (line.startsWith('topic_ids:')) {
      result.topicIds = line.slice(10).split(',').filter(Boolean);
    } else if (line.startsWith('Puntos clave:')) {
      result.keyPoints = line.slice(13).trim().split(' · ').filter(Boolean);
    } else if (line.startsWith('Contenidos:')) {
      result.contents = line.slice(11).trim().split(', ').filter(Boolean);
    } else if (!result.focus) {
      result.focus = line;
    }
  }

  return result;
}

/** Returns a clean one-line summary for compact views */
export function getEventNoteSummary(notes?: string): string {
  const parsed = parseEventNotes(notes);
  if (parsed.focus) return parsed.focus;
  if (parsed.keyPoints.length) return parsed.keyPoints.join(' · ');
  return '';
}
