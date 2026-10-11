import { describe, expect, it } from 'vitest';
import { resolveRoute } from './router';

describe('hash router', () => {
  it.each([
    ['#/', '/'],
    ['#/training', '/training'],
    ['#/verlauf', '/verlauf'],
    ['#/einstellungen', '/einstellungen'],
  ] as const)('resolves %s', (hash, expected) => {
    expect(resolveRoute(hash)).toBe(expected);
  });

  it('falls back to Start for an unknown route', () => {
    expect(resolveRoute('#/unbekannt')).toBe('/');
  });
});
