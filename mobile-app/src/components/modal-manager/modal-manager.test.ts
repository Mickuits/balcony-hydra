import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModalManager } from './modal-manager';

function makeModal(): { modal: HTMLElement; backdrop: HTMLElement; input: HTMLInputElement } {
  const backdrop = document.createElement('div');
  const modal = document.createElement('div');
  const input = document.createElement('input');
  modal.appendChild(input);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  return { modal, backdrop, input };
}

describe('ModalManager', () => {
  let mgr: ModalManager;
  let body: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    body = document.body;
    mgr = new ModalManager(body);
  });

  it('register hides modal + adds ARIA attributes', () => {
    const { modal, backdrop } = makeModal();
    mgr.register('m1', { modal, backdrop });
    expect(modal.hidden).toBe(true);
    expect(backdrop.hidden).toBe(true);
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
  });

  it('open() reveals modal + locks body scroll', () => {
    const { modal, backdrop } = makeModal();
    mgr.register('m1', { modal, backdrop });
    mgr.open('m1');
    expect(modal.hidden).toBe(false);
    expect(backdrop.hidden).toBe(false);
    expect(body.style.overflow).toBe('hidden');
    expect(mgr.isOpen('m1')).toBe(true);
    expect(mgr.stackSize()).toBe(1);
  });

  it('open() focuses initialFocus element', () => {
    const { modal, backdrop, input } = makeModal();
    mgr.register('m1', { modal, backdrop, initialFocus: input });
    mgr.open('m1');
    expect(document.activeElement).toBe(input);
  });

  it('open() invokes onOpen callback', () => {
    const { modal, backdrop } = makeModal();
    const onOpen = vi.fn();
    mgr.register('m1', { modal, backdrop }, { onOpen });
    mgr.open('m1');
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('open() is idempotent (no double push)', () => {
    const { modal, backdrop } = makeModal();
    mgr.register('m1', { modal, backdrop });
    mgr.open('m1');
    mgr.open('m1');
    expect(mgr.stackSize()).toBe(1);
  });

  it('close() hides modal + unlocks body + calls onClose("close")', () => {
    const { modal, backdrop } = makeModal();
    const onClose = vi.fn();
    mgr.register('m1', { modal, backdrop }, { onClose });
    mgr.open('m1');
    mgr.close('m1');
    expect(modal.hidden).toBe(true);
    expect(backdrop.hidden).toBe(true);
    expect(body.style.overflow).toBe('');
    expect(onClose).toHaveBeenCalledWith('close');
  });

  it('closeTop() closes LIFO order', () => {
    const a = makeModal();
    const b = makeModal();
    mgr.register('A', { modal: a.modal, backdrop: a.backdrop });
    mgr.register('B', { modal: b.modal, backdrop: b.backdrop });
    mgr.open('A');
    mgr.open('B');
    mgr.closeTop();
    expect(mgr.isOpen('B')).toBe(false);
    expect(mgr.isOpen('A')).toBe(true);
  });

  it('closeAll() closes everything', () => {
    const a = makeModal();
    const b = makeModal();
    mgr.register('A', { modal: a.modal, backdrop: a.backdrop });
    mgr.register('B', { modal: b.modal, backdrop: b.backdrop });
    mgr.open('A');
    mgr.open('B');
    mgr.closeAll();
    expect(mgr.stackSize()).toBe(0);
    expect(body.style.overflow).toBe('');
  });

  it('backdrop click triggers close with reason "backdrop"', () => {
    const { modal, backdrop } = makeModal();
    const onClose = vi.fn();
    mgr.register('m1', { modal, backdrop }, { onClose });
    mgr.open('m1');
    backdrop.dispatchEvent(new Event('click', { bubbles: true }));
    // Note: dispatchEvent on the backdrop has target == backdrop
    expect(onClose).toHaveBeenCalledWith('backdrop');
  });

  it('clicking on modal child does NOT close', () => {
    const { modal, backdrop, input } = makeModal();
    const onClose = vi.fn();
    mgr.register('m1', { modal, backdrop }, { onClose });
    mgr.open('m1');
    // Click bubbles from input → modal → backdrop, mais e.target === input
    input.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('attachKeyboard() listens Escape and closes top', () => {
    const { modal, backdrop } = makeModal();
    const onClose = vi.fn();
    mgr.register('m1', { modal, backdrop }, { onClose });
    mgr.open('m1');
    const detach = mgr.attachKeyboard();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledWith('escape');
    detach();
  });

  it('attachKeyboard() detach removes listener', () => {
    const { modal, backdrop } = makeModal();
    const onClose = vi.fn();
    mgr.register('m1', { modal, backdrop }, { onClose });
    mgr.open('m1');
    const detach = mgr.attachKeyboard();
    detach();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('throws on open() of unregistered id', () => {
    expect(() => mgr.open('ghost')).toThrow(/non enregistrée/);
  });

  it('restores focus to previous element on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { modal, backdrop, input } = makeModal();
    mgr.register('m1', { modal, backdrop, initialFocus: input });
    mgr.open('m1');
    expect(document.activeElement).toBe(input);

    mgr.close('m1');
    expect(document.activeElement).toBe(trigger);
  });
});
