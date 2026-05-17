/**
 * ConfiguratorScreen — éditeur de configuration système.
 *
 * Permet de configurer :
 *  - REST endpoint (url + token)
 *  - MQTT broker (url + user + pass)
 *  - Mode arrosage (AUTO / SCHEDULED / SOLAR / MANUAL)
 *
 * Les configs sont appliquées via onSave qui appelle storage + bridges côté
 * caller (main.ts).
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId, WateringMode, RestConfig, MqttConfig } from '@/types';
import type { ConfigStore } from '@/stores/config.store';
import { StorageService, STORAGE_KEYS } from '@/services/storage';
import { isValidUrl, isValidApiToken, escapeHtml } from '@/utils/sanitize';

export interface ConfiguratorPayload {
  rest: RestConfig;
  mqtt: MqttConfig;
  mode: WateringMode;
}

export type ConfiguratorAction = { type: 'save'; payload: ConfiguratorPayload } | { type: 'back' };

export interface ConfiguratorScreenDeps {
  config: ConfigStore;
  storage: StorageService;
  onAction: (action: ConfiguratorAction) => void;
}

const MODES: WateringMode[] = ['AUTO', 'SCHEDULED', 'SOLAR', 'MANUAL'];

export class ConfiguratorScreen extends BaseScreen {
  readonly id: ScreenId = 'configurator';
  private readonly deps: ConfiguratorScreenDeps;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: ConfiguratorScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action="back"]');
      if (target) this.deps.onAction({ type: 'back' });
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(): void {
    this.render();
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    this.clickHandler = null;
    if (this.root) this.root.innerHTML = '';
  }

  private render(): void {
    if (!this.root) return;
    const rest = this.deps.storage.get<RestConfig | null>(STORAGE_KEYS.REST_CONFIG, null);
    const mqtt = this.deps.storage.get<MqttConfig | null>(STORAGE_KEYS.MQTT_CONFIG, null);
    const currentMode = this.deps.config.get().watering.mode;

    this.root.innerHTML = `
      <header class="screen-header">
        <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
        <h1>Configurateur</h1>
      </header>
      <form id="configForm" class="form" novalidate>
        <fieldset>
          <legend>API REST (master)</legend>
          <div class="field">
            <label for="restUrl">URL</label>
            <input type="url" id="restUrl" placeholder="http://hydra.local"
                   value="${escapeHtml(rest?.url ?? '')}" />
          </div>
          <div class="field">
            <label for="restToken">Token X-Hydra-Token</label>
            <input type="text" id="restToken" autocomplete="off"
                   value="${escapeHtml(rest?.token ?? '')}" />
          </div>
        </fieldset>

        <fieldset>
          <legend>MQTT broker</legend>
          <div class="field">
            <label for="mqttUrl">WebSocket URL</label>
            <input type="text" id="mqttUrl" placeholder="ws://broker:9001"
                   value="${escapeHtml(mqtt?.url ?? '')}" />
          </div>
          <div class="field">
            <label for="mqttUser">Username</label>
            <input type="text" id="mqttUser" value="${escapeHtml(mqtt?.user ?? '')}" />
          </div>
          <div class="field">
            <label for="mqttPass">Password</label>
            <input type="password" id="mqttPass" autocomplete="off"
                   value="${escapeHtml(mqtt?.pass ?? '')}" />
          </div>
        </fieldset>

        <fieldset>
          <legend>Mode d'arrosage</legend>
          <div class="field">
            <label for="mode">Mode</label>
            <select id="mode">
              ${MODES.map(
                (m) => `<option value="${m}" ${m === currentMode ? 'selected' : ''}>${m}</option>`
              ).join('')}
            </select>
          </div>
        </fieldset>

        <p id="formError" class="form-error" role="alert" hidden></p>
        <div class="action-bar">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </form>
    `;

    const form = this.root.querySelector<HTMLFormElement>('#configForm');
    form?.addEventListener('submit', (e: SubmitEvent) => this.handleSubmit(e));
  }

  private handleSubmit(e: SubmitEvent): void {
    e.preventDefault();
    if (!this.root) return;
    const restUrl = this.root.querySelector<HTMLInputElement>('#restUrl')?.value.trim() ?? '';
    const restToken = this.root.querySelector<HTMLInputElement>('#restToken')?.value.trim() ?? '';
    const mqttUrl = this.root.querySelector<HTMLInputElement>('#mqttUrl')?.value.trim() ?? '';
    const mqttUser = this.root.querySelector<HTMLInputElement>('#mqttUser')?.value ?? '';
    const mqttPass = this.root.querySelector<HTMLInputElement>('#mqttPass')?.value ?? '';
    const modeRaw = this.root.querySelector<HTMLSelectElement>('#mode')?.value ?? 'AUTO';
    const errorEl = this.root.querySelector<HTMLElement>('#formError');
    if (!errorEl) return;

    if (restUrl && !isValidUrl(restUrl, ['http', 'https'])) {
      this.showError(errorEl, 'URL REST invalide.');
      return;
    }
    if (restToken && !isValidApiToken(restToken)) {
      this.showError(errorEl, 'Token REST invalide (32 caractères hexadécimaux requis).');
      return;
    }
    if (mqttUrl && !(mqttUrl.startsWith('ws://') || mqttUrl.startsWith('wss://'))) {
      this.showError(errorEl, 'URL MQTT doit commencer par ws:// ou wss://');
      return;
    }
    if (!MODES.includes(modeRaw as WateringMode)) {
      this.showError(errorEl, 'Mode arrosage invalide.');
      return;
    }
    errorEl.hidden = true;
    this.deps.onAction({
      type: 'save',
      payload: {
        rest: { url: restUrl, token: restToken },
        mqtt: { url: mqttUrl, user: mqttUser, pass: mqttPass },
        mode: modeRaw as WateringMode,
      },
    });
  }

  private showError(el: HTMLElement, msg: string): void {
    el.textContent = msg;
    el.hidden = false;
  }
}
