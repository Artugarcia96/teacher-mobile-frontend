import { Calendar, FileText, School } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  tab: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Calendario', icon: Calendar, href: '/tabs/calendar', tab: 'calendar' },
  { label: 'Clases', icon: School, href: '/tabs/classes', tab: 'classes' },
  { label: 'Exámenes', icon: FileText, href: '/tabs/exams', tab: 'exams' },
];

/** Routes where the MobileTabBar should be hidden (standalone full-screen pages) */
export const HIDDEN_TAB_BAR_ROUTES = [
  '/login',
  '/exercise-correction/',
  '/exercise-bulk-correction/',
];
