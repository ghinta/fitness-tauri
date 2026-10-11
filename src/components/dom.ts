export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    text?: string;
    id?: string;
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.id) node.id = options.id;
  return node;
}

export function button(
  label: string,
  className = 'button',
  type: 'button' | 'submit' = 'button',
): HTMLButtonElement {
  const node = element('button', { className, text: label });
  node.type = type;
  return node;
}

export function field(
  labelText: string,
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  hint?: string,
): HTMLLabelElement {
  const label = element('label', { className: 'field' });
  label.append(element('span', { className: 'field__label', text: labelText }));
  label.append(control);
  if (hint)
    label.append(element('span', { className: 'field__hint', text: hint }));
  return label;
}

export function statusMessage(
  text: string,
  kind: 'error' | 'success' | 'info' = 'info',
): HTMLParagraphElement {
  const message = element('p', {
    className: `status status--${kind}`,
    text,
  });
  message.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  return message;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatWeight(value: number | null): string {
  return value === null
    ? 'Ohne Gewichtsangabe'
    : `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(value)} kg`;
}
