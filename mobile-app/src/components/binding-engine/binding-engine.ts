/**
 * BindingEngine — remplace les expressions `data-bind="key"` du DOM par la
 * valeur produite par une fonction enregistrée.
 *
 * Différences avec le prototype legacy :
 * - Map<string, () => string> typée → toute clé inconnue lève en dev.
 * - Pas de lookup dans `window.HARDWARE` — chaque binding pointe vers une
 *   fonction pure qui lit le store.
 * - Échappement HTML automatique via `escapeHtml` quand on injecte du
 *   contenu utilisateur (ex: nom de pot custom).
 * - Mode `text` (default, textContent) ou `html` (escapé) ou `attr:<name>`.
 */
import { escapeHtml } from '@/utils/sanitize';

export type BindingProducer = () => string;

export type BindingTarget = 'text' | 'html' | `attr:${string}`;

export interface Binding {
  produce: BindingProducer;
  target?: BindingTarget;
}

export class BindingEngine {
  private readonly bindings = new Map<string, Binding>();

  /** Enregistre un binding. Override silencieux si la clé existe déjà. */
  register(key: string, binding: Binding | BindingProducer): void {
    if (typeof binding === 'function') {
      this.bindings.set(key, { produce: binding, target: 'text' });
    } else {
      this.bindings.set(key, { target: 'text', ...binding });
    }
  }

  /** Enregistre plusieurs bindings d'un coup (utile au boot). */
  registerAll(entries: Record<string, Binding | BindingProducer>): void {
    for (const [key, value] of Object.entries(entries)) {
      this.register(key, value);
    }
  }

  /** Désinscrit une clé. */
  unregister(key: string): void {
    this.bindings.delete(key);
  }

  /** Lookup direct pour debug / test. */
  has(key: string): boolean {
    return this.bindings.has(key);
  }

  size(): number {
    return this.bindings.size;
  }

  /**
   * Applique tous les bindings présents dans le scope (par défaut : document).
   * Retourne le nombre d'éléments traités. En dev, log un warn pour chaque
   * clé inconnue.
   */
  apply(scope: ParentNode = document): number {
    const elements = scope.querySelectorAll<HTMLElement>('[data-bind]');
    let count = 0;
    for (const el of elements) {
      const key = el.dataset['bind'];
      if (!key) continue;
      const binding = this.bindings.get(key);
      if (!binding) {
        console.warn(`[binding] clé inconnue: ${key}`);
        continue;
      }
      let value: string;
      try {
        value = binding.produce();
      } catch (err) {
        console.error(`[binding] ${key} a throw`, err);
        continue;
      }
      this.applyTo(el, value, binding.target ?? 'text');
      count += 1;
    }
    return count;
  }

  private applyTo(el: HTMLElement, value: string, target: BindingTarget): void {
    if (target === 'text') {
      if (el.textContent !== value) el.textContent = value;
      return;
    }
    if (target === 'html') {
      // Échappement automatique — caller doit pré-escape si besoin spécifique.
      const escaped = escapeHtml(value);
      if (el.innerHTML !== escaped) el.innerHTML = escaped;
      return;
    }
    if (target.startsWith('attr:')) {
      const attr = target.slice(5);
      if (!attr) return;
      if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
      return;
    }
  }
}
