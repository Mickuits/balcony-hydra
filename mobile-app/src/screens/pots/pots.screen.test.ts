import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PotsScreen } from './pots.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { UiStore } from '@/stores/ui.store';
import { BindingEngine } from '@/components/binding-engine/binding-engine';
import { renderPotTile } from './pots.template';

describe('renderPotTile', () => {
  it('renders the pot id + name + percentage', () => {
    const html = renderPotTile({
      id: 'P01',
      state: 'ok',
      hum: 55.5,
      zone: 'balcon',
      nameShort: 'Basilic',
    });
    expect(html).toContain('P01');
    expect(html).toContain('Basilic');
    expect(html).toContain('56%');
  });

  it('displays "—" for off pots (no humidity reading)', () => {
    const html = renderPotTile({
      id: 'P05',
      state: 'off',
      hum: 0,
      zone: 'interieur',
      nameShort: 'X',
    });
    expect(html).toContain('—');
    // L'em-dash apparaît dans la span .pct (et non un pourcentage)
    const m = html.match(/<span class="pct">([^<]+)<\/span>/);
    expect(m?.[1]).toBe('—');
  });

  it('escapes HTML in name + id', () => {
    const html = renderPotTile({
      id: '<bad>',
      state: 'ok',
      hum: 50,
      zone: 'balcon',
      nameShort: '<img>',
    });
    expect(html).not.toContain('<bad>');
    expect(html).not.toContain('<img>');
    expect(html).toContain('&lt;bad&gt;');
  });

  it('sets data-status="alert" for crit/dry/off states', () => {
    expect(
      renderPotTile({ id: 'P', state: 'crit', hum: 5, zone: 'balcon', nameShort: 'x' })
    ).toContain('data-status="alert"');
    expect(
      renderPotTile({ id: 'P', state: 'dry', hum: 25, zone: 'balcon', nameShort: 'x' })
    ).toContain('data-status="alert"');
    expect(
      renderPotTile({ id: 'P', state: 'off', hum: 0, zone: 'balcon', nameShort: 'x' })
    ).toContain('data-status="alert"');
  });

  it('sets data-status="ok" for normal states', () => {
    expect(
      renderPotTile({ id: 'P', state: 'ok', hum: 50, zone: 'balcon', nameShort: 'x' })
    ).toContain('data-status="ok"');
    expect(
      renderPotTile({ id: 'P', state: 'high', hum: 80, zone: 'balcon', nameShort: 'x' })
    ).toContain('data-status="ok"');
  });

  it('fill height clamped to [0,100]', () => {
    const overflow = renderPotTile({
      id: 'P',
      state: 'high',
      hum: 150,
      zone: 'balcon',
      nameShort: 'x',
    });
    expect(overflow).toContain('height:100%');
    const underflow = renderPotTile({
      id: 'P',
      state: 'ok',
      hum: -10,
      zone: 'balcon',
      nameShort: 'x',
    });
    expect(underflow).toContain('height:0%');
  });
});

describe('PotsScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let ui: UiStore;
  let bindings: BindingEngine;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: PotsScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    ui = new UiStore();
    bindings = new BindingEngine();
    onAction = vi.fn();
    screen = new PotsScreen({ hardware, ui, bindings, onAction });
  });

  it('mount renders template + grid with 20 pots', () => {
    screen.mount(root);
    screen.activate();
    const tiles = root.querySelectorAll('[data-pot-id]');
    expect(tiles.length).toBe(20);
  });

  it('pots are sorted by id (P01, P02, …)', () => {
    screen.mount(root);
    screen.activate();
    const ids = Array.from(root.querySelectorAll<HTMLElement>('[data-pot-id]')).map(
      (el) => el.dataset['potId']
    );
    expect(ids[0]).toBe('P01');
    expect(ids[1]).toBe('P02');
    expect(ids).toEqual([...ids].sort());
  });

  it('click on pot triggers onAction openDetail', () => {
    screen.mount(root);
    screen.activate();
    const firstPot = root.querySelector<HTMLElement>('[data-pot-id="P01"]');
    firstPot?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'openDetail', potId: 'P01' });
  });

  it('click on "addPot" button triggers onAction addPot', () => {
    screen.mount(root);
    screen.activate();
    const btn = root.querySelector<HTMLElement>('[data-action="addPot"]');
    btn?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'addPot' });
  });

  it('click on filter chip updates UiStore + re-render', () => {
    screen.mount(root);
    screen.activate();
    // Tous les pots initialement → state ok/dry — pas de filter 'crit' actif
    hardware.update((s) => {
      const ids = Object.keys(s.pots);
      const updated = { ...s.pots };
      updated[ids[0]!] = { ...updated[ids[0]!]!, state: 'crit' };
      return { ...s, pots: updated };
    });
    const chip = root.querySelector<HTMLElement>('[data-filter="crit"]');
    chip?.click();
    expect(ui.get().currentPotFilter).toBe('crit');
    expect(chip?.classList.contains('active')).toBe(true);
    expect(chip?.getAttribute('aria-selected')).toBe('true');
    // Seuls les pots en crit sont affichés (au moins 1, celui qu'on vient de set)
    const filtered = root.querySelectorAll('[data-pot-id]');
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.length).toBeLessThan(20);
  });

  it('grid updates when HardwareStore changes', () => {
    screen.mount(root);
    screen.activate();
    const before = root.querySelector('[data-pot-id="P01"] .pct')?.textContent;
    hardware.update((s) => ({
      ...s,
      pots: { ...s.pots, P01: { ...s.pots.P01!, hum: 99 } },
    }));
    const after = root.querySelector('[data-pot-id="P01"] .pct')?.textContent;
    expect(after).not.toBe(before);
    expect(after).toBe('99%');
  });

  it('title binding reflects filter + count', () => {
    screen.mount(root);
    screen.activate();
    const title = root.querySelector('[data-bind="pots.title"]')?.textContent ?? '';
    expect(title).toMatch(/20 pots/);
    expect(title).toMatch(/TOUS/);
  });

  it('deactivate stops listening', () => {
    screen.mount(root);
    screen.activate();
    screen.deactivate();
    const before = root.querySelector('[data-pot-id="P01"] .pct')?.textContent;
    hardware.update((s) => ({
      ...s,
      pots: { ...s.pots, P01: { ...s.pots.P01!, hum: 1 } },
    }));
    const after = root.querySelector('[data-pot-id="P01"] .pct')?.textContent;
    expect(after).toBe(before);
  });

  it('unmount clears DOM + unregisters bindings', () => {
    screen.mount(root);
    screen.activate();
    screen.unmount();
    expect(root.innerHTML).toBe('');
    expect(bindings.has('pots.title')).toBe(false);
  });
});
