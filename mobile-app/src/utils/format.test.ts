import { describe, it, expect } from 'vitest';
import {
  fmtDurationHuman,
  fmtDurationShort,
  fmtUptime,
  fmtMacShort,
  fmtPct,
  fmtLiters,
} from './format';

describe('fmtDurationHuman', () => {
  it("returns '—' for 0, null, undefined", () => {
    expect(fmtDurationHuman(0)).toBe('—');
    expect(fmtDurationHuman(null)).toBe('—');
    expect(fmtDurationHuman(undefined)).toBe('—');
  });

  it('formats minutes < 1h', () => {
    expect(fmtDurationHuman(60)).toBe('1m');
    expect(fmtDurationHuman(120)).toBe('2m');
    expect(fmtDurationHuman(45 * 60)).toBe('45m');
  });

  it('formats hours < 24h', () => {
    expect(fmtDurationHuman(3600)).toBe('1h');
    expect(fmtDurationHuman(2 * 3600)).toBe('2h');
    expect(fmtDurationHuman(2 * 3600 + 30 * 60)).toBe('2h 30m');
  });

  it('formats days', () => {
    expect(fmtDurationHuman(86400)).toBe('1j');
    expect(fmtDurationHuman(2 * 86400 + 5 * 3600)).toBe('2j 5h');
    expect(fmtDurationHuman(47 * 86400 + 14 * 3600)).toBe('47j 14h');
  });

  it('handles edge case 59 seconds (sub-minute)', () => {
    expect(fmtDurationHuman(59)).toBe('0m');
  });
});

describe('fmtDurationShort', () => {
  it('formats < 60s as Xs', () => {
    expect(fmtDurationShort(0)).toBe('0s');
    expect(fmtDurationShort(30)).toBe('30s');
    expect(fmtDurationShort(59)).toBe('59s');
  });

  it('formats < 1h as Xmin YYs', () => {
    expect(fmtDurationShort(60)).toBe('1min 00s');
    expect(fmtDurationShort(125)).toBe('2min 05s');
    expect(fmtDurationShort(3599)).toBe('59min 59s');
  });

  it('formats >= 1h as Xh YYmin', () => {
    expect(fmtDurationShort(3600)).toBe('1h 00min');
    expect(fmtDurationShort(3 * 3600 + 38 * 60)).toBe('3h 38min');
  });

  it('handles negative input (clamp)', () => {
    expect(fmtDurationShort(-1)).toBe('0s');
    expect(fmtDurationShort(-100)).toBe('0s');
  });
});

describe('fmtUptime', () => {
  it("formats 'Xd HH:MM'", () => {
    expect(fmtUptime(0)).toBe('0d 00:00');
    expect(fmtUptime(14 * 86400 + 6 * 3600 + 22 * 60)).toBe('14d 06:22');
    expect(fmtUptime(86400 + 60)).toBe('1d 00:01');
  });
});

describe('fmtMacShort', () => {
  it("returns '—' for null/empty", () => {
    expect(fmtMacShort(null)).toBe('—');
    expect(fmtMacShort(undefined)).toBe('—');
    expect(fmtMacShort('')).toBe('—');
  });

  it('uppercases valid MAC', () => {
    expect(fmtMacShort('aa:bb:cc:dd:ee:ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(fmtMacShort('24:6F:28:7C:1A:42')).toBe('24:6F:28:7C:1A:42');
  });
});

describe('fmtPct', () => {
  it('clamps to [0..100]', () => {
    expect(fmtPct(-5)).toBe('0%');
    expect(fmtPct(150)).toBe('100%');
    expect(fmtPct(72)).toBe('72%');
  });

  it('respects decimals', () => {
    expect(fmtPct(72.5, 1)).toBe('72.5%');
    expect(fmtPct(72.567, 2)).toBe('72.57%');
  });
});

describe('fmtLiters', () => {
  it('formats with 1 decimal', () => {
    expect(fmtLiters(0)).toBe('0.0 L');
    expect(fmtLiters(23.7)).toBe('23.7 L');
    expect(fmtLiters(2.84)).toBe('2.8 L');
  });
});
