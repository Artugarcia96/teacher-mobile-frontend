import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDraft } from './useDraft';

describe('useDraft', () => {
  it('follows the server while untouched and ignores new objects with the same value', () => {
    const { result, rerender } = renderHook(({ v }) => useDraft(v), { initialProps: { v: { name: 'Ana' } } });
    rerender({ v: { name: 'Ana' } });
    expect(result.current.dirty).toBe(false);
    rerender({ v: { name: 'Ana María' } });
    expect(result.current.draft).toEqual({ name: 'Ana María' });
  });

  it('keeps unsaved edits when the server value changes (refetch on focus)', () => {
    const { result, rerender } = renderHook(({ v }) => useDraft(v), { initialProps: { v: { name: 'Ana', start: '2026-09-08' } } });
    act(() => result.current.setDraft({ name: 'Ana', start: '2026-09-10' }));
    rerender({ v: { name: 'Ana', start: '2026-09-08' } });
    rerender({ v: { name: 'Ana López', start: '2026-09-08' } });
    expect(result.current.draft).toEqual({ name: 'Ana', start: '2026-09-10' });
    expect(result.current.dirty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.draft).toEqual({ name: 'Ana López', start: '2026-09-08' });
    expect(result.current.dirty).toBe(false);
  });

  it('is clean after a save sets the saved value and the server catches up', () => {
    const { result, rerender } = renderHook(({ v }) => useDraft(v), { initialProps: { v: { name: 'Ana' } } });
    act(() => result.current.setDraft({ name: 'Ana ' }));
    act(() => result.current.setDraft({ name: 'Ana' }));
    act(() => result.current.setDraft({ name: 'Eva' }));
    rerender({ v: { name: 'Eva' } });
    expect(result.current.dirty).toBe(false);
  });
});
