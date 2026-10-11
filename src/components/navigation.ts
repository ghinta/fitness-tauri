import { icon } from './icons';
import { element } from './dom';
import { resolveRoute, type RoutePath } from '../app/router';

const links: ReadonlyArray<{ path: RoutePath; label: string }> = [
  { path: '/', label: 'Start' },
  { path: '/verlauf', label: 'Verlauf' },
  { path: '/einstellungen', label: 'Einstellungen' },
];

export function createNavigation(): HTMLElement {
  const navigation = document.createElement('nav');
  navigation.className = 'bottom-navigation';
  navigation.ariaLabel = 'Hauptnavigation';
  for (const { path, label } of links) {
    const anchor = document.createElement('a');
    anchor.href = `#${path}`;
    anchor.append(
      icon(
        path === '/' ? 'home' : path === '/verlauf' ? 'history' : 'settings',
      ),
      element('span', { text: label }),
    );
    anchor.dataset.route = path;
    navigation.append(anchor);
  }
  return navigation;
}

export function updateNavigation(navigation: HTMLElement): void {
  const current = resolveRoute(window.location.hash);
  navigation.querySelectorAll<HTMLAnchorElement>('a').forEach((anchor) => {
    if (anchor.dataset.route === current)
      anchor.setAttribute('aria-current', 'page');
    else anchor.removeAttribute('aria-current');
  });
}
