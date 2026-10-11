import { isTauri } from '@tauri-apps/api/core';
import { element, button } from './dom';
import { icon } from './icons';

type Appearance = 'system' | 'light' | 'dark';
const appearances: Appearance[] = ['system', 'light', 'dark'];
const labels: Record<Appearance, string> = {
  system: 'Automatisch',
  light: 'Hell',
  dark: 'Dunkel',
};

export function createToolbar(): HTMLElement {
  const toolbar = element('div', { className: 'app-header__inner' });
  if (isTauri() && /Mac/.test(navigator.platform))
    document.documentElement.classList.add('native-mac');
  const brand = element('div', { className: 'app-brand' });
  const mark = element('span', { className: 'brand-mark' });
  mark.append(icon('dumbbell'));
  brand.append(mark, element('span', { text: 'Fitness Glass' }));
  const spacer = element('div', { className: 'toolbar-drag' });
  spacer.setAttribute('data-tauri-drag-region', '');
  const theme = button('', 'button appearance-control');
  let appearance: Appearance = 'system';
  try {
    const stored = localStorage.getItem('fitness-glass-appearance');
    if (appearances.includes(stored as Appearance))
      appearance = stored as Appearance;
  } catch {
    /* The system appearance also works when localStorage is unavailable. */
  }
  const update = (): void => {
    document.documentElement.dataset.theme = appearance;
    theme.replaceChildren(
      icon('sun'),
      element('span', { text: labels[appearance] }),
    );
    theme.ariaLabel = `Darstellung: ${labels[appearance]}. Zum Wechseln klicken.`;
  };
  theme.addEventListener('click', () => {
    appearance =
      appearances[(appearances.indexOf(appearance) + 1) % appearances.length] ??
      'system';
    try {
      localStorage.setItem('fitness-glass-appearance', appearance);
    } catch {
      /* Keep the current in-memory preference. */
    }
    update();
  });
  update();
  toolbar.append(brand, spacer, theme);
  return toolbar;
}
