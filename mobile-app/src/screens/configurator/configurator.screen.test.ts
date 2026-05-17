import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfiguratorScreen } from './configurator.screen';
import { ConfigStore } from '@/stores/config.store';
import { StorageService, STORAGE_KEYS } from '@/services/storage';

describe('ConfiguratorScreen', () => {
  let root: HTMLElement;
  let config: ConfigStore;
  let storage: StorageService;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: ConfiguratorScreen;

  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
    config = new ConfigStore();
    storage = new StorageService();
    onAction = vi.fn();
    screen = new ConfiguratorScreen({ config, storage, onAction });
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
});
