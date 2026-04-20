import {
  calculateLifeEnergyFromCurrent,
  clampLifeEnergy,
  formatLifeEnergyRemaining,
  getNextDailyResetAt,
  getWeeklyResetContext
} from './rosterhq-core.js';

describe('rosterhq-core', () => {
  it('clamps life energy safely', () => {
    expect(clampLifeEnergy(-10)).toBe(0);
    expect(clampLifeEnergy(12000)).toBe(11500);
    expect(clampLifeEnergy('4200')).toBe(4200);
  });

  it('calculates full life energy timing with exact restore math', () => {
    const updatedAt = new Date('2026-04-20T12:00:00.000Z');
    const calculation = calculateLifeEnergyFromCurrent(11000, updatedAt);

    expect(calculation.missingLifeEnergy).toBe(500);
    expect(calculation.msUntilFull).toBe(Math.ceil((500 * 600000) / 33));
    expect(calculation.fullAt).toBe(new Date(updatedAt.getTime() + calculation.msUntilFull).toISOString());
  });

  it('formats human-readable life energy timers', () => {
    expect(formatLifeEnergyRemaining(0)).toBe('Already full');
    expect(formatLifeEnergyRemaining(80 * 60000)).toBe('1h 20m');
  });

  it('keeps weekly reminder timing aligned to the weekly reset definition', () => {
    const context = getWeeklyResetContext(new Date('2026-04-20T09:30:00.000Z'));
    const reminderAt = new Date(context.weeklyReminderAt).getTime();
    const nextResetAt = new Date(context.nextWeeklyResetAt).getTime();

    expect(nextResetAt - reminderAt).toBe(24 * 60 * 60 * 1000);
  });

  it('returns the next daily reset from the shared reset rules', () => {
    const nextDailyReset = getNextDailyResetAt(new Date('2026-04-20T09:30:00.000Z'));
    expect(nextDailyReset instanceof Date).toBeTrue();
    expect(Number.isNaN(nextDailyReset.getTime())).toBeFalse();
  });
});
