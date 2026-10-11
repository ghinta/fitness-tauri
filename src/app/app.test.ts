import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FitnessDatabase } from '../storage';
import { createApp } from './app';

describe('application shell', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('renders the German shell and primary navigation', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const root = document.createElement('div');
    const database = new FitnessDatabase(`app-test-${crypto.randomUUID()}`);
    const app = createApp(root, {
      database,
    });
    await app.start();

    expect(root.querySelector('header')?.textContent).toContain(
      'Fitness Glass',
    );
    expect(root.querySelector('main h1')?.textContent).toBe('Start');
    expect(
      [...root.querySelectorAll('nav a')].map((link) => link.textContent),
    ).toEqual(['Start', 'Verlauf', 'Einstellungen']);

    app.stop();
    database.close();
    await database.delete();
  });
});
