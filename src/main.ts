import { createApp } from './app/app';
import './styles/main.css';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Anwendungselement wurde nicht gefunden.');
}

void createApp(root).start();
