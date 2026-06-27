import {
  calculateLifeEnergyFromCurrent,
  clampLifeEnergy,
  formatLifeEnergyRemaining,
  getDifficultyLabel,
  getNextDailyResetAt,
  getWeeklyResetContext,
  projectLifeEnergyStatus,
  resolveRaidTierFromLog
} from './rosterhq-core.js';

describe('rosterhq-core', () => {
  it('clamps life energy safely', () => {
    expect(clampLifeEnergy(-10)).toBe(0);
    expect(clampLifeEnergy(12000)).toBe(11500);
    expect(clampLifeEnergy('4200')).toBe(4200);
  });

  it('calculates full life energy timing with 33-point restoration ticks', () => {
    const updatedAt = new Date('2026-04-20T12:00:00.000Z');
    const calculation = calculateLifeEnergyFromCurrent(11000, updatedAt);

    expect(calculation.missingLifeEnergy).toBe(500);
    expect(calculation.msUntilFull).toBe(Math.ceil(500 / 33) * 600000);
    expect(calculation.fullAt).toBe(new Date(updatedAt.getTime() + calculation.msUntilFull).toISOString());
  });

  it('projects life energy in discrete 10-minute ticks instead of continuous interpolation', () => {
    const updatedAt = '2026-04-20T12:00:00.000Z';

    const beforeFirstTick = projectLifeEnergyStatus(
      {
        current_life_energy: 10000,
        life_energy_last_updated_at: updatedAt,
        calculated_full_at: '2026-04-20T19:40:00.000Z'
      },
      new Date('2026-04-20T12:09:59.000Z')
    );
    const afterFirstTick = projectLifeEnergyStatus(
      {
        current_life_energy: 10000,
        life_energy_last_updated_at: updatedAt,
        calculated_full_at: '2026-04-20T19:40:00.000Z'
      },
      new Date('2026-04-20T12:10:00.000Z')
    );

    expect(beforeFirstTick.currentLifeEnergy).toBe(10000);
    expect(afterFirstTick.currentLifeEnergy).toBe(10033);
  });

  it('formats human-readable life energy timers', () => {
    expect(formatLifeEnergyRemaining(0)).toBe('Already full');
    expect(formatLifeEnergyRemaining(80 * 60000)).toBe('1h 20m');
  });

  it('formats roster raid difficulty labels consistently', () => {
    expect(getDifficultyLabel('NIGHTMARE')).toBe('NiM');
    expect(getDifficultyLabel('LV2')).toBe('Lv2');
  });

  it('maps final-boss logs back to the correct raid tier', () => {
    expect(
      resolveRaidTierFromLog(
        {
          itemLevel: 1730,
          name: 'Eqe'
        },
        'Archbishop Arcenos',
        'Level 2'
      )?.key
    ).toBe('cathedral-lv2');

    expect(
      resolveRaidTierFromLog(
        {
          itemLevel: 1745,
          name: 'Bröke'
        },
        'Witch of Agony, Serca',
        'Hard'
      )?.key
    ).toBe('serca-nightmare');

    expect(
      resolveRaidTierFromLog(
        {
          itemLevel: 1730,
          name: 'Eqe'
        },
        'Witch of Agony, Serca',
        'Hard'
      )?.key
    ).toBe('serca-hm');

    expect(
      resolveRaidTierFromLog(
        {
          itemLevel: 1700,
          name: 'Sheshekel'
        },
        'Corvus Tul Rak',
        'Hard'
      )
    ).toBeNull();
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
