// Rule 10: what the redesign of presentations and apuntes replaces is deleted in the same change, never kept beside
// the new code. Fails if a replaced definition is back in its file (a deleted file passes). Each phase adds the
// definitions it replaces (the spec's list of deleted code).
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const DELETED = [
  // The content model of lessons and archetypes (day 0).
  ['src/api/content.ts', /\btype SlideLayout\b/, 'the SlideLayout type'],
  ['src/api/content.ts', /\bimage: \{ description: string; search: string \}/, 'Slide.image {description, search}'],
  ['src/api/content.ts', /\binterface (ExampleBlock|CheckBlock)\b/, 'the example and check blocks'],
  ['src/api/content.ts', /'ojo' \| 'sabias' \| 'consejo'/, 'the note tones ojo, sabias, consejo'],
  ['src/api/content.ts', /\bsessions: string\[\]/, 'ContentDoc.sessions'],
  ['src/api/content.ts', /\bsession: number \| null/, 'DocSection.session'],
  ['src/api/units.ts', /\bpptx_url\b/, 'Material.pptx_url (per-lesson files come from /file?variant=pptx&lesson=n)'],
  ['src/api/units.ts', /\bsessions\?: number\b/, 'GenerateInput.sessions (now lessons)'],
  ['src/pages/units/SlideFace.tsx', /\bfunction (CoverSlide|slideKey)\b/, 'CoverSlide and slideKey'],
  ['src/pages/units/SlideFace.tsx', /Imagen sugerida/, 'the «Imagen sugerida» card line'],
  ['src/pages/units/EditElementSheet.tsx', /\.layout\b/, 'the per-layout slide fields'],
  // Presentations show server-rendered slide images (wave 2).
  ['src/pages/units/SlideFace.tsx', /./, 'SlideFace.tsx (slides are the server\'s images)'],
  ['src/pages/units/Slides.css', /./, 'Slides.css (slides are the server\'s images)'],
  ['src/pages/units/EditElementSheet.tsx', /\bslideFields\b/, 'the slide fields of the block sheet (slides use the slot table)'],
  ['src/api/units.ts', /\{ block \}.*Element\b|mutationFn: \(block: Element\)/, 'a slide saved as a whole element (slides send their slots)'],
];

const problems = DELETED.flatMap(([file, pattern, what]) => {
  const path = ROOT + file;
  if (!existsSync(path)) return [];
  const line = readFileSync(path, 'utf8').split('\n').findIndex((l) => pattern.test(l));
  return line < 0 ? [] : [`${file}:${line + 1}  still has ${what}, which the redesign replaced`];
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('deleted: OK');
