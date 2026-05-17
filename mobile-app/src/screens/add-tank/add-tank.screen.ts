/**
 * AddTankScreen — wizard 4 étapes pour ajouter un réservoir.
 *
 * 1. Identité (nom)
 * 2. Capacité (litres)
 * 3. Contrôleur (MASTER / SLAVE)
 * 4. Confirmation
 */
import { BaseWizard, type WizardStep } from '../wizard/wizard-stepper';
import type { ScreenId, ControllerId } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export interface NewTankState {
  name: string;
  cap: number;
  controller: ControllerId;
}

const INITIAL: NewTankState = { name: '', cap: 25, controller: 'SLAVE' };

export interface AddTankScreenDeps {
  onComplete: (state: NewTankState) => void;
  onCancel: () => void;
}

export class AddTankScreen extends BaseWizard<NewTankState> {
  readonly id: ScreenId = 'addTank';

  constructor(deps: AddTankScreenDeps) {
    const steps: WizardStep<NewTankState>[] = [
      {
        title: 'Nom du réservoir',
        render: (s) => `
          <div class="field">
            <label for="name">Nom</label>
            <input id="name" type="text" maxlength="64" value="${escapeHtml(s.name)}" />
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          name: root.querySelector<HTMLInputElement>('#name')?.value.trim() ?? '',
        }),
        validate: (s) => (s.name.length === 0 ? 'Le nom est requis.' : null),
      },
      {
        title: 'Capacité',
        render: (s) => `
          <div class="field">
            <label for="cap">Capacité (L)</label>
            <input id="cap" type="number" min="1" max="500" value="${s.cap}" />
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          cap: Number(root.querySelector<HTMLInputElement>('#cap')?.value ?? 0),
        }),
        validate: (s) => (s.cap >= 1 && s.cap <= 500 ? null : 'Capacité entre 1 et 500 L.'),
      },
      {
        title: 'Contrôleur',
        render: (s) => `
          <div class="field">
            <label for="controller">Contrôleur</label>
            <select id="controller">
              <option value="SLAVE" ${s.controller === 'SLAVE' ? 'selected' : ''}>SLAVE (balcon)</option>
              <option value="MASTER" ${s.controller === 'MASTER' ? 'selected' : ''}>MASTER (intérieur)</option>
            </select>
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          controller:
            (root.querySelector<HTMLSelectElement>('#controller')?.value as ControllerId) ??
            s.controller,
        }),
        validate: (s) =>
          s.controller === 'SLAVE' || s.controller === 'MASTER' ? null : 'Contrôleur invalide.',
      },
      {
        title: 'Confirmation',
        render: (s) => `
          <dl class="confirm">
            <dt>Nom</dt><dd>${escapeHtml(s.name)}</dd>
            <dt>Capacité</dt><dd>${s.cap} L</dd>
            <dt>Contrôleur</dt><dd>${escapeHtml(s.controller)}</dd>
          </dl>
        `,
        collect: (_root, s) => s,
        validate: () => null,
      },
    ];

    super({ steps, initialState: INITIAL, onComplete: deps.onComplete, onCancel: deps.onCancel });
  }
}
