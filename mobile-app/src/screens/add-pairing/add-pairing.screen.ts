/**
 * AddPairingScreen — wizard 3 étapes pour appairer un esclave ESP-NOW.
 *
 * 1. Préparation (rappel : mettre l'esclave en mode pairing via bouton physique 5s)
 * 2. Scan / saisie de la MAC esclave
 * 3. Confirmation + écriture NVS
 */
import { BaseWizard, type WizardStep } from '../wizard/wizard-stepper';
import type { ScreenId } from '@/types';
import { isValidMac } from '@/utils/sanitize';

export interface NewPairingState {
  slaveMac: string;
  pmkConfirmed: boolean;
}

const INITIAL: NewPairingState = { slaveMac: '', pmkConfirmed: false };

export interface AddPairingScreenDeps {
  onComplete: (state: NewPairingState) => void;
  onCancel: () => void;
}

export class AddPairingScreen extends BaseWizard<NewPairingState> {
  readonly id: ScreenId = 'addPairing';

  constructor(deps: AddPairingScreenDeps) {
    const steps: WizardStep<NewPairingState>[] = [
      {
        title: "Préparer l'esclave",
        render: () => `
          <ol class="instructions">
            <li>Vérifier que l'esclave est alimenté (LED bleue).</li>
            <li>Maintenir le bouton physique 5 secondes pour activer le mode pairing.</li>
            <li>La LED passe en clignotement bleu rapide.</li>
          </ol>
        `,
        collect: (_root, s) => s,
        validate: () => null,
      },
      {
        title: 'Saisir la MAC esclave',
        render: (s) => `
          <div class="field">
            <label for="slaveMac">MAC address (format AA:BB:CC:DD:EE:FF)</label>
            <input type="text" id="slaveMac" placeholder="AA:BB:CC:DD:EE:FF"
                   maxlength="17" value="${s.slaveMac}" />
            <small>Visible sur l'étiquette esclave ou via le port série.</small>
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          slaveMac:
            root.querySelector<HTMLInputElement>('#slaveMac')?.value.trim().toUpperCase() ?? '',
        }),
        validate: (s) =>
          isValidMac(s.slaveMac) ? null : 'MAC invalide (format AA:BB:CC:DD:EE:FF).',
      },
      {
        title: 'Confirmation',
        render: (s) => `
          <p>L'esclave <strong>${s.slaveMac}</strong> sera appairé au maître.</p>
          <div class="field">
            <label>
              <input type="checkbox" id="pmkConfirmed" ${s.pmkConfirmed ? 'checked' : ''} />
              Je confirme que le PMK ESP-NOW est correctement configuré.
            </label>
          </div>
        `,
        collect: (root, s) => ({
          ...s,
          pmkConfirmed: root.querySelector<HTMLInputElement>('#pmkConfirmed')?.checked ?? false,
        }),
        validate: (s) =>
          s.pmkConfirmed ? null : "Confirmez le PMK avant de finaliser l'appairage.",
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
