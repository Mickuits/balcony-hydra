import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DetailScreen, renderPotDetail } from './detail.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { UiStore } from '@/stores/ui.store';
import { INITIAL_PROFILES } from '@/data/mock-profiles';

describe('renderPotDetail', () => {
  const pot = {
    controller: 'SLAVE' as const,
    muxChannel: 0,
    hum: 55,
    tempSoil: 18,
    ec: 1.2,
    lastWater: 3600 * 5,
    profileId: 'HERB_MED' as const,
    name: 'Basilic Genovese',
    species: 'Ocimum basilicum',
    nameShort: 'Basilic',
    zone: 'balcon' as const,
    state: 'ok' as const,
    vol: 1500,
  };

  it('shows species + zone + humidity', () => {
    const html = renderPotDetail(pot, INITIAL_PROFILES.HERB_MED);
    expect(html).toContain('Ocimum basilicum');
    expect(html).toContain('balcon');
    expect(html).toContain('55%');
  });

  it('shows "—" instead of 0% when state=off', () => {
    const html = renderPotDetail({ ...pot, state: 'off', hum: 0 }, INITIAL_PROFILES.HERB_MED);
    const dd = html.match(/Humidité<\/dt><dd>([^<]+)<\/dd>/);
    expect(dd?.[1]).toBe('—');
  });

  it('escapes XSS in species/name', () => {
    const html = renderPotDetail(
      { ...pot, species: '<img>', name: '<script>' },
      INITIAL_PROFILES.HERB_MED
    );
    expect(html).not.toContain('<img>');
    expect(html).not.toContain('<script>');
  });

  it('toggles button label between "Désactiver" and "Réactiver"', () => {
    expect(renderPotDetail({ ...pot, state: 'off' }, INITIAL_PROFILES.HERB_MED)).toContain(
      'Réactiver'
    );
    expect(renderPotDetail(pot, INITIAL_PROFILES.HERB_MED)).toContain('Désactiver');
  });

  it('renders profile thresholds when profile present', () => {
    const html = renderPotDetail(pot, INITIAL_PROFILES.HERB_MED);
    expect(html).toContain(`${INITIAL_PROFILES.HERB_MED.dry}/${INITIAL_PROFILES.HERB_MED.ok}%`);
  });

  it('renders without profile section when profile undefined', () => {
    const html = renderPotDetail(pot, undefined);
    expect(html).not.toContain('Profil');
  });
});

describe('DetailScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let ui: UiStore;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: DetailScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    ui = new UiStore();
    onAction = vi.fn();
    screen = new DetailScreen({ hardware, ui, profiles: INITIAL_PROFILES, onAction });
  });

  it('shows "Aucun pot sélectionné" when no selectedPotId', () => {
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('h1')?.textContent).toBe('Aucun pot sélectionné');
  });

  it('activate(selectedId) selects pot and renders detail', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    expect(ui.get().selectedPotId).toBe('P01');
    expect(root.querySelector('h1')?.textContent).toContain('P01');
  });

  it('shows "introuvable" when selectedPotId points to non-existent pot', () => {
    ui.selectPot('PGHOST');
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('h1')?.textContent).toContain('introuvable');
  });

  it('click waterPot dispatches action with potId', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    root.querySelector<HTMLElement>('[data-action="waterPot"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'waterPot', potId: 'P01' });
  });

  it('click back dispatches action even without pot selected', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="back"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'back' });
  });

  it('reactive to store changes (humidity update)', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    hardware.update((s) => ({
      ...s,
      pots: { ...s.pots, P01: { ...s.pots.P01!, hum: 99 } },
    }));
    expect(root.textContent).toContain('99%');
  });
});
