/**
 * ProfilesScreen — affiche les profils hydriques de plantes.
 * Read-only ; l'édition arrive en VAGUE 2.E avec un wizard dédié.
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId, PlantProfile, Pot } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import { configStore } from '@/stores';

export interface ProfilesScreenDeps {
  hardware: HardwareStore;
  profiles: Record<string, PlantProfile>;
}

export class ProfilesScreen extends BaseScreen {
  readonly id: ScreenId = 'profiles';
  private readonly deps: ProfilesScreenDeps;
  private unsub: (() => void) | null = null;

  constructor(deps: ProfilesScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <h1>Profils plantes</h1>
        <p class="subtitle">Seuils d'arrosage par catégorie</p>
      </header>
      <section class="profiles-list" id="profilesList" aria-label="Liste des profils"></section>
    `;
  }

  protected override onActivate(): void {
    this.refresh();
    this.unsub = this.deps.hardware.subscribe(() => this.refresh());
  }

  protected override onDeactivate(): void {
    this.unsub?.();
    this.unsub = null;
  }

  protected override onUnmount(): void {
    if (this.root) this.root.innerHTML = '';
  }

  private refresh(): void {
    if (!this.root) return;
    const list = this.root.querySelector<HTMLElement>('#profilesList');
    if (!list) return;
    const pots = this.deps.hardware.get().pots;
    list.innerHTML = Object.entries(this.deps.profiles)
      .map(([id, p]) => renderProfileCard(id, p, pots))
      .join('');
    void configStore; // re-render trigger placeholder pour vague suivante
  }
}

export function renderProfileCard(
  id: string,
  profile: PlantProfile,
  pots: Record<string, Pot>
): string {
  const potCount = Object.values(pots).filter((pot) => pot.profileId === id).length;
  return `
    <article class="profile-card" data-profile-id="${escapeAttr(id)}">
      <header>
        <h3>${escapeText(profile.label)}</h3>
        <span class="badge">${potCount} pots</span>
      </header>
      <dl>
        <dt>Seuil critique</dt><dd>${profile.dry}%</dd>
        <dt>Seuil cible</dt><dd>${profile.ok}%</dd>
        <dt>Volume cycle</dt><dd>${profile.vol} ml</dd>
        <dt>Cooldown</dt><dd>${Math.round(profile.cooldown / 60)} min</dd>
      </dl>
    </article>
  `;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
