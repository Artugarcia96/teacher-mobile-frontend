/**
 * Shared URL utilities for exam-related files (papers, PDFs, etc.).
 * Used by ExamDetail, CorrectionPanel, ScanCard, and any component that
 * needs to resolve a relative file path to a full API URL.
 */

const getBaseUrl = () => {
  let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  return baseUrl.replace(/\/+$/, '');
};

/**
 * Resolve a paper/file URL (relative or absolute) to a fully qualified URL
 * that can be used with authenticatedFetch.
 */
export function getFullPaperUrl(paperUrl?: string): string | null {
  if (!paperUrl) return null;
  if (paperUrl.startsWith('http')) return paperUrl;
  const baseUrl = getBaseUrl();
  if (paperUrl.startsWith('/files/')) return `${baseUrl}${paperUrl}`;
  if (paperUrl.startsWith('/uploads/')) return `${baseUrl}/files${paperUrl.replace('/uploads', '')}`;
  if (paperUrl.startsWith('uploads/')) return `${baseUrl}/files/${paperUrl.replace('uploads/', '')}`;
  if (!paperUrl.startsWith('/')) return `${baseUrl}/${paperUrl}`;
  return `${baseUrl}${paperUrl}`;
}
