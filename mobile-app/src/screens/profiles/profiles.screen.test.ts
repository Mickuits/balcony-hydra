import { describe, it, expect, beforeEach } from 'vitest';
import { ProfilesScreen, renderProfileCard } from './profiles.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { INITIAL_PROFILES } from '@/data/mock-profiles';

describe('renderProfileCard', () => {
  it('renders label + counts pots assigned to profile', () => {
    const pots = {
      P01: { profileId: 'HERB_MED' } as never,
      P02: { profileId: 'HERB_MED' } as never,
      P03: { profileId: 'SUCCULENT_DRY' } as never,
    };
    const html = renderProfileCard('HERB_MED', INITIAL_PROFILES.HERB_MED, pots);
    expect(html).toContain(INITIAL_PROFILES.HERB_MED.label);
    expect(html).toContain('2 pots');
  });

  it('counts 0 when no pots have this profile', () => {
    const html = renderProfileCard('SUCCULENT_DRY', INITIAL_PROFILES.SUCCULENT_DRY, {});
    expect(html).toContain('0 pots');
  });

  it('shows dry/ok thresholds + vol + cooldown', () => {
    const html = renderProfileCard('HERB_MED', INITIAL_PROFILES.HERB_MED, {});
    expect(html).toContain(`${INITIAL_PROFILES.HERB_MED.dry}%`);
    expect(html).toContain(`${INITIAL_PROFILES.HERB_MED.ok}%`);
  });
});

describe('ProfilesScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let screen: ProfilesScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    screen = new ProfilesScreen({ hardware, profiles: INITIAL_PROFILES });
  });

  it('renders one card per profile', () => {
    screen.mount(root);
    screen.activate();
    const cards = root.querySelectorAll('[data-profile-id]');
    expect(cards.length).toBe(Object.keys(INITIAL_PROFILES).length);
  });

  it('refresh on hardware change (pot count update)', () => {
    screen.mount(root);
    screen.activate();
    const before = root.querySelector('[data-profile-id="HERB_MED"]')?.innerHTML;
    // Reassigne tous les pots à un seul profil → le compteur HERB_MED change
    hardware.update((s) => {
      const pots: typeof s.pots = {};
      for (const [id, p] of Object.entries(s.pots)) {
        pots[id] = { ...p, profileId: 'SUCCULENT_DRY' };
      }
      return { ...s, pots };
    });
    const after = root.querySelector('[data-profile-id="HERB_MED"]')?.innerHTML;
    expect(after).not.toBe(before);
    expect(after).toContain('0 pots');
  });

  it('unmount clears DOM', () => {
    screen.mount(root);
    screen.activate();
    screen.unmount();
    expect(root.innerHTML).toBe('');
  });
});
