import { describe, it, expect, beforeEach } from 'vitest';
import { LiveLogStore } from './live-log.store';

describe('LiveLogStore', () => {
  let store: LiveLogStore;

  beforeEach(() => {
    store = new LiveLogStore(3); // small ring buffer pour test
  });

  it('starts empty', () => {
    expect(store.get().entries).toEqual([]);
  });

  it('pushEvent appends entries', () => {
    store.pushEvent('info', 'event 1', 0);
    store.pushEvent('warn', 'event 2', 0);
    expect(store.get().entries).toHaveLength(2);
    expect(store.get().entries[0]?.msg).toBe('event 1');
    expect(store.get().entries[1]?.tag).toBe('warn');
  });

  it('ring buffer drops oldest when full', () => {
    store.pushEvent('info', 'a', 0);
    store.pushEvent('info', 'b', 0);
    store.pushEvent('info', 'c', 0);
    store.pushEvent('info', 'd', 0); // overflow

    const entries = store.get().entries;
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.msg)).toEqual(['b', 'c', 'd']);
  });

  it('clear empties the buffer', () => {
    store.pushEvent('info', 'x', 0);
    store.clear();
    expect(store.get().entries).toEqual([]);
  });

  it('seed replaces entries entirely', () => {
    store.pushEvent('info', 'old', 0);
    store.seed([
      { time: '12:00:00', tag: 'info', msg: 'seeded 1' },
      { time: '12:00:01', tag: 'warn', msg: 'seeded 2' },
    ]);
    expect(store.get().entries).toHaveLength(2);
    expect(store.get().entries[0]?.msg).toBe('seeded 1');
  });

  it('pushEvent uses Date.now() when timestamp omitted', () => {
    store.pushEvent('info', 'auto-time');
    expect(store.get().entries[0]?.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
