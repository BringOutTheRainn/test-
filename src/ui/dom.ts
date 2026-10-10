// Tiny DOM helpers: element lookup, toasts and modals.

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el as HTMLElement;
}

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Sets text only when it changed, to keep layout work down. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

let toastRoot: HTMLElement | null = null;

export function toast(html: string, kind: 'info' | 'good' | 'trophy' | 'comet' | 'bad' = 'info', ms = 3200): void {
  toastRoot ??= document.getElementById('toasts');
  if (!toastRoot) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = html;
  el.addEventListener('click', () => el.remove());
  toastRoot.appendChild(el);
  while (toastRoot.children.length > 2) toastRoot.firstElementChild?.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export interface ModalOptions {
  title: string;
  body: string;
  /** Buttons from left to right. A handler returning false keeps the modal open. */
  buttons?: Array<{ label: string; kind?: 'primary' | 'danger' | 'plain'; onClick?: (root: HTMLElement) => boolean | void }>;
  onClose?: () => void;
  wide?: boolean;
  dismissable?: boolean;
}

const stack: Array<{ el: HTMLElement; opts: ModalOptions }> = [];

export function openModal(opts: ModalOptions): HTMLElement {
  const root = document.getElementById('modals')!;
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  const buttons = opts.buttons ?? [{ label: 'Close', kind: 'primary' }];
  el.innerHTML = `
    <div class="modal${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
      <div class="modal-head"><h2>${esc(opts.title)}</h2>${opts.dismissable === false ? '' : '<button class="modal-x" aria-label="Close">✕</button>'}</div>
      <div class="modal-body">${opts.body}</div>
      <div class="modal-buttons">${buttons.map((b, i) => `<button class="btn btn-${b.kind ?? 'plain'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div>`;
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target === el && opts.dismissable !== false) {
      closeModal(el);
      return;
    }
    if (target.closest('.modal-x')) {
      closeModal(el);
      return;
    }
    const btn = target.closest<HTMLElement>('.modal-buttons button');
    if (btn) {
      const b = buttons[Number(btn.dataset.i)];
      if (b.onClick?.(el) !== false) closeModal(el);
    }
  });
  root.appendChild(el);
  stack.push({ el, opts });
  requestAnimationFrame(() => el.classList.add('in'));
  return el;
}

export function closeModal(el?: HTMLElement): boolean {
  const entry = el ? stack.find((m) => m.el === el) : stack[stack.length - 1];
  if (!entry) return false;
  stack.splice(stack.indexOf(entry), 1);
  entry.el.classList.remove('in');
  setTimeout(() => entry.el.remove(), 200);
  entry.opts.onClose?.();
  return true;
}

export function topModalDismissable(): boolean {
  const top = stack[stack.length - 1];
  return !!top && top.opts.dismissable !== false;
}

export function modalOpen(): boolean {
  return stack.length > 0;
}

export function confirmModal(title: string, body: string, yes: string, onYes: () => void, danger = false): void {
  openModal({
    title,
    body: `<p>${body}</p>`,
    buttons: [
      { label: 'Cancel', kind: 'plain' },
      { label: yes, kind: danger ? 'danger' : 'primary', onClick: () => onYes() },
    ],
  });
}
