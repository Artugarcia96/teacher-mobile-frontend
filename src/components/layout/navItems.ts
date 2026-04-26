import { Calendar, FileText, School, PenLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  tab: string;
}

// Navegación principal: 4 tabs, cada uno una capa conceptual distinta.
//  - Calendario: cuándo imparto qué.
//  - Clases: mis grupos + el temario y material vive DENTRO de cada asignatura
//    (ya no es un tab paralelo — el material es parte del temario).
//  - Exámenes / Ejercicios: evaluación (mismo modelo, filtrado por purpose).
// El tab "Material" se retiró porque duplicaba el hogar del contenido: todo
// lo que el profe crea vive dentro del Temario de su asignatura.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Calendario', icon: Calendar, href: '/tabs/calendar', tab: 'calendar' },
  { label: 'Clases', icon: School, href: '/tabs/classes', tab: 'classes' },
  { label: 'Exámenes', icon: FileText, href: '/tabs/exams', tab: 'exams' },
  { label: 'Ejercicios', icon: PenLine, href: '/tabs/exercises', tab: 'exercises' },
];

/** Routes where the MobileTabBar should be hidden (standalone full-screen pages) */
export const HIDDEN_TAB_BAR_ROUTES = [
  '/login',
];
