import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfiguratorScreen } from './configurator.screen';
import { ConfigStore } from '@/stores/config.store';
import { StorageService, STORAGE_KEYS } from '@/services/storage';
import { ConfigBackupService } from '@/services/config-backup';

describe('ConfiguratorScreen', () => {
  let root: HTMLElement;
  let config: ConfigStore;
  let storage: StorageService;
  let backup: ConfigBackupService;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: ConfiguratorScreen;

  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
    config = new ConfigStore();
    storage = new StorageService();
    backup = new ConfigBackupService({ storage, buildId: 'test' });
    onAction = vi.fn();
    screen = new ConfiguratorScreen({ config, storage, backup, onAction });
  });

  function submit(): void {
    root
      .querySelector<HTMLFormElement>('#configForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('mount + activate renders form fields', () => {
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('#restUrl')).not.toBeNull();
    expect(root.querySelector('#mqttUrl')).not.toBeNull();
    expect(root.querySelector('#mode')).not.toBeNull();
  });

  it('pre-fills with stored config', () => {
    storage.set(STORAGE_KEYS.REST_CONFIG, { url: 'http://hydra.local', token: 'TOKEN_A' });
    storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://broker:9001', user: 'u', pass: 'p' });
    screen.mount(root);
    screen.activate();
    expect(root.querySelector<HTMLInputElement>('#restUrl')?.value).toBe('http://hydra.local');
    expect(root.querySelector<HTMLInputElement>('#mqttUrl')?.value).toBe('ws://broker:9001');
  });

  it('saves valid config', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLInputElement>('#restUrl')!.value = 'http://hydra.local';
    // Token = 32 hex chars (format hardcoded firmware-side)
    const token = '0123456789abcdef0123456789abcdef';
    root.querySelector<HTMLInputElement>('#restToken')!.value = token;
    root.querySelector<HTMLInputElement>('#mqttUrl')!.value = 'ws://broker:9001';
    root.querySelector<HTMLSelectElement>('#mode')!.value = 'SCHEDULED';
    submit();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'save',
        payload: expect.objectContaining({
          rest: { url: 'http://hydra.local', token },
          mode: 'SCHEDULED',
        }),
      })
    );
  });

  it('rejects invalid REST URL', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLInputElement>('#restUrl')!.value = 'not-a-url';
    submit();
    expect(root.querySelector('#formError')?.textContent).toContain('URL REST invalide');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('rejects invalid REST token (non-hex)', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLInputElement>('#restUrl')!.value = 'http://hydra.local';
    root.querySelector<HTMLInputElement>('#restToken')!.value = 'has space + invalid chars!';
    submit();
    expect(root.querySelector('#formError')?.textContent).toContain('Token');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('rejects MQTT URL not starting with ws://', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLInputElement>('#mqttUrl')!.value = 'http://broker';
    submit();
    expect(root.querySelector('#formError')?.textContent).toContain('ws://');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('accepts wss:// MQTT URL', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLInputElement>('#mqttUrl')!.value = 'wss://broker.example.com:8883';
    // Pas de REST → pas de validation token requise
    submit();
    expect(onAction).toHaveBeenCalled();
  });

  it('back button dispatches back action', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="back"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'back' });
  });

  describe('backup UI (VAGUE 4.B)', () => {
    it('renders export + import buttons + file input', () => {
      screen.mount(root);
      screen.activate();
      expect(root.querySelector('[data-action="exportConfig"]')).not.toBeNull();
      expect(root.querySelector('[data-action="importConfig"]')).not.toBeNull();
      expect(root.querySelector<HTMLInputElement>('#importFile')).not.toBeNull();
    });

    it('export button calls backup.downloadFile', async () => {
      const downloadSpy = vi.spyOn(backup, 'downloadFile').mockResolvedValue();
      screen.mount(root);
      screen.activate();
      root.querySelector<HTMLElement>('[data-action="exportConfig"]')?.click();
      await new Promise((r) => setTimeout(r, 10));
      expect(downloadSpy).toHaveBeenCalled();
    });

    it('shows status on export success', async () => {
      vi.spyOn(backup, 'downloadFile').mockResolvedValue();
      screen.mount(root);
      screen.activate();
      root.querySelector<HTMLElement>('[data-action="exportConfig"]')?.click();
      await new Promise((r) => setTimeout(r, 10));
      const status = root.querySelector('#backupStatus');
      expect(status?.textContent).toContain('téléchargé');
      expect(status?.hasAttribute('hidden')).toBe(false);
    });

    it('shows error status on export failure', async () => {
      vi.spyOn(backup, 'downloadFile').mockRejectedValue(new Error('disk full'));
      screen.mount(root);
      screen.activate();
      root.querySelector<HTMLElement>('[data-action="exportConfig"]')?.click();
      await new Promise((r) => setTimeout(r, 10));
      const status = root.querySelector<HTMLElement>('#backupStatus');
      expect(status?.textContent).toContain('disk full');
      expect(status?.classList.contains('backup-status-error')).toBe(true);
    });

    it('import file triggers backup.importJson + configImported action', async () => {
      // Pre-build a valid backup
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://orig' });
      const json = await backup.exportJson();

      screen.mount(root);
      screen.activate();

      const fileInput = root.querySelector<HTMLInputElement>('#importFile')!;
      // Simule un fichier sélectionné via une fake File
      const file = new File([json], 'config.json', { type: 'application/json' });
      // jsdom n'a pas Blob.text() — polyfill
      (file as { text: () => Promise<string> }).text = async () => json;
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      await new Promise((r) => setTimeout(r, 10));
      expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'configImported' }));
    });

    it('shows error when imported file is invalid JSON', async () => {
      screen.mount(root);
      screen.activate();
      const fileInput = root.querySelector<HTMLInputElement>('#importFile')!;
      const file = new File(['{ broken'], 'bad.json', { type: 'application/json' });
      (file as { text: () => Promise<string> }).text = async () => '{ broken';
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
      const status = root.querySelector<HTMLElement>('#backupStatus');
      expect(status?.textContent).toContain('JSON invalide');
      expect(status?.classList.contains('backup-status-error')).toBe(true);
    });
  });
});
