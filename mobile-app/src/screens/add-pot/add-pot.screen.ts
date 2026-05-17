/**
 * AddPotScreen — wizard 5 étapes pour ajouter un pot.
 *
 * 1. Position physique (zone + slot MUX)
 * 2. Identité (nom, nom court, espèce)
 * 3. Profil hydrique
 * 4. Volume du pot (ml)
 * 5. Confirmation
 */
import { BaseWizard, type WizardStep } from '../wizard/wizard-stepper';
import type { ScreenId, PlantProfile, ZoneLabel } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export interface NewPotState {
  zone: ZoneLabel;
  muxChannel: number;
  name: string;
  nameShort: string;
  species: string;
  profileId: string;
  vol: number;
}

const INITIAL: NewPotState = {
  zone: 'balcon',
  muxChannel: 0,
  name: '',
  nameShort: '',
  species: '',
  profileId: '',
  vol: 1500,
};

export interface AddPotScreenDeps {
  profiles: Record<string, PlantProfile>;
  onComplete: (state: NewPotState) => void;
  onCancel: () => void;
}

export class AddPotScreen extends BaseWizard<NewPotState> {
  readonly id: ScreenId = 'addPot';

  constructor(deps: AddPotScreenDeps) {
    const profileOptions = (selected: string): string =>
      Object.entries(deps.profiles)
        .map(
          ([id, p]) =>
            `<option value="${escapeHtml(id)}" ${id === selected ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
        )
        .join('');

    const steps: WizardStep<NewPotState>[] = [
      {
        title: 'Position physique',
        render: (s) => `
          <div class="field">
            <label for="zone">Zone</label>
            <select id="zone">
              <option value="balcon" ${s.zone === 'balcon' ? 'selected' : ''}>Balcon</option>
              <option value="interieur" ${s.zone === 'interieur' ? 'selected' : ''}>Intérieur</option>
            </select>
          </div>
          <div class="field">
            <label for="muxChannel">Canal MUX (0-9)</label>
            <input type="number" id="muxChannel" min="0" max="9" value="${s.muxChannel}" />
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          zone: (root.querySelector<HTMLSelectElement>('#zone')?.value as ZoneLabel) ?? s.zone,
          muxChannel: Number(root.querySelector<HTMLInputElement>('#muxChannel')?.value ?? 0),
        }),
        validate: (s) => {
          if (s.muxChannel < 0 || s.muxChannel > 9) return 'Canal MUX entre 0 et 9.';
          return null;
        },
      },
      {
        title: 'Identité',
        render: (s) => `
          <div class="field"><label for="name">Nom complet</label>
            <input id="name" maxlength="64" value="${escapeHtml(s.name)}" /></div>
          <div class="field"><label for="nameShort">Nom court (≤ 16)</label>
            <input id="nameShort" maxlength="16" value="${escapeHtml(s.nameShort)}" /></div>
          <div class="field"><label for="species">Espèce</label>
            <input id="species" maxlength="80" value="${escapeHtml(s.species)}" /></div>
        `,
        collect: (root, s) => ({
          ...s,
          name: root.querySelector<HTMLInputElement>('#name')?.value.trim() ?? '',
          nameShort: root.querySelector<HTMLInputElement>('#nameShort')?.value.trim() ?? '',
          species: root.querySelector<HTMLInputElement>('#species')?.value.trim() ?? '',
        }),
        validate: (s) => {
          if (!s.name) return 'Le nom est requis.';
          if (!s.nameShort) return 'Le nom court est requis.';
          return null;
        },
      },
      {
        title: 'Profil hydrique',
        render: (s) => `
          <div class="field">
            <label for="profileId">Profil</label>
            <select id="profileId" required>${profileOptions(s.profileId)}</select>
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          profileId: root.querySelector<HTMLSelectElement>('#profileId')?.value ?? '',
        }),
        validate: (s) => (deps.profiles[s.profileId] ? null : 'Sélectionnez un profil.'),
      },
      {
        title: 'Volume du pot',
        render: (s) => `
          <div class="field">
            <label for="vol">Volume (ml)</label>
            <input type="number" id="vol" min="100" max="50000" value="${s.vol}" />
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          vol: Number(root.querySelector<HTMLInputElement>('#vol')?.value ?? 0),
        }),
        validate: (s) => (s.vol >= 100 && s.vol <= 50000 ? null : 'Volume entre 100 et 50000 ml.'),
      },
      {
        title: 'Confirmation',
        render: (s) => `
          <dl class="confirm">
            <dt>Zone</dt><dd>${escapeHtml(s.zone)}</dd>
            <dt>Canal MUX</dt><dd>${s.muxChannel}</dd>
            <dt>Nom</dt><dd>${escapeHtml(s.name)}</dd>
            <dt>Nom court</dt><dd>${escapeHtml(s.nameShort)}</dd>
            <dt>Espèce</dt><dd>${escapeHtml(s.species)}</dd>
            <dt>Profil</dt><dd>${escapeHtml(s.profileId)}</dd>
            <dt>Volume</dt><dd>${s.vol} ml</dd>
          </dl>
        `,
        collect: (_root, s) => s,
        validate: () => null,
      },
    ];

    super({
      steps,
      initialState: INITIAL,
      onComplete: deps.onComplete,
      onCancel: deps.onCancel,
    });
  }
}
