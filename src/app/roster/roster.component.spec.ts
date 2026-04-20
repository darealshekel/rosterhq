import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { RosterComponent } from './roster.component';
import { GroupRoster, RosterSyncState } from '../api-model';
import { RosterStateService } from '../../services/roster-state.service';
import { getWeeklyResetContext } from '../../shared/rosterhq-core.js';

class MockRosterStateService {
  private readonly subject = new BehaviorSubject<RosterSyncState>({
    reset: getWeeklyResetContext(),
    raidCompletions: [],
    lifeEnergy: [],
    version: 0
  });

  readonly state$ = this.subject.asObservable();

  start(): void {}

  upsertRaidCompletion() {
    return of(this.subject.value);
  }

  updateLifeEnergy() {
    return of(this.subject.value);
  }

  pushState(state: RosterSyncState): void {
    this.subject.next(state);
  }
}

describe('RosterComponent', () => {
  let component: RosterComponent;
  let fixture: ComponentFixture<RosterComponent>;
  let rosterState: MockRosterStateService;

  beforeEach(async () => {
    rosterState = new MockRosterStateService();

    await TestBed.configureTestingModule({
      imports: [RosterComponent],
      providers: [
        {
          provide: RosterStateService,
          useValue: rosterState
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RosterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects synced weekly completions in roster totals', () => {
    const rosters: GroupRoster[] = [
      {
        key: 'shekel',
        title: "Shekel's Roster",
        sourcePath: '/character/test',
        sourceCharacter: 'Tester',
        bannerImage: '',
        bannerAccent: '#ff5fab',
        averageItemLevel: 0,
        averageCombatPower: 0,
        highestItemLevel: 0,
        allCharacters: [],
        characters: [
          {
            id: 777,
            name: 'Bröke',
            classKey: 'soul_eater',
            classLabel: 'Souleater',
            itemLevel: 1745,
            combatPower: 5000,
            combatPowerIsEstimate: false,
            lastUpdate: 1,
            characterUrl: 'https://example.com/broke'
          }
        ]
      }
    ];

    component.rosters = rosters;
    rosterState.pushState({
      reset: getWeeklyResetContext(),
      raidCompletions: [
        {
          weekId: getWeeklyResetContext().currentWeekId,
          rosterKey: 'shekel',
          characterId: 777,
          characterName: 'Bröke',
          familyKey: 'serca',
          raidKey: 'serca-nightmare',
          difficulty: 'NIGHTMARE',
          boughtIn: false,
          completedAt: new Date().toISOString(),
          completedSource: 'discord'
        }
      ],
      lifeEnergy: [],
      version: 1
    });

    const plannerRow = component.plannerRosters[0].plannerRows[0];
    expect(plannerRow.raidsByFamily['serca']?.completed).toBeTrue();
    expect(plannerRow.raidsByFamily['serca']?.raidKey).toBe('serca-nightmare');
    expect(plannerRow.totalGold).toBe(94000);
    expect(component.plannerRosters[0].plannerTotalGold).toBe(94000);
  });

  it('counts checked raids toward character total gold before anything is completed', () => {
    component.rosters = [
      {
        key: 'shekel',
        title: "Shekel's Roster",
        sourcePath: '/character/test',
        sourceCharacter: 'Tester',
        bannerImage: '',
        bannerAccent: '#ff5fab',
        averageItemLevel: 0,
        averageCombatPower: 0,
        highestItemLevel: 0,
        allCharacters: [],
        characters: [
          {
            id: 777,
            name: 'Bröke',
            classKey: 'soul_eater',
            classLabel: 'Souleater',
            itemLevel: 1745,
            combatPower: 5000,
            combatPowerIsEstimate: false,
            lastUpdate: 1,
            characterUrl: 'https://example.com/broke'
          }
        ]
      }
    ];

    const plannerRow = component.plannerRosters[0].plannerRows[0];
    expect(plannerRow.totalGold).toBe(148000);
    expect(component.plannerRosters[0].plannerTotalGold).toBe(148000);
  });

  it('renders raids as checked until they are completed for the week', () => {
    component.rosters = [
      {
        key: 'shekel',
        title: "Shekel's Roster",
        sourcePath: '/character/test',
        sourceCharacter: 'Tester',
        bannerImage: '',
        bannerAccent: '#ff5fab',
        averageItemLevel: 0,
        averageCombatPower: 0,
        highestItemLevel: 0,
        allCharacters: [],
        characters: [
          {
            id: 777,
            name: 'Bröke',
            classKey: 'soul_eater',
            classLabel: 'Souleater',
            itemLevel: 1745,
            combatPower: 5000,
            combatPowerIsEstimate: false,
            lastUpdate: 1,
            characterUrl: 'https://example.com/broke'
          }
        ]
      }
    ];

    fixture.detectChanges();

    const raid = component.plannerRosters[0].plannerRows[0].raidsByFamily['serca'];
    expect(raid).toBeDefined();
    expect(component.isRaidAvailable(raid!)).toBeTrue();

    rosterState.pushState({
      reset: getWeeklyResetContext(),
      raidCompletions: [
        {
          weekId: getWeeklyResetContext().currentWeekId,
          rosterKey: 'shekel',
          characterId: 777,
          characterName: 'Bröke',
          familyKey: 'serca',
          raidKey: 'serca-nightmare',
          difficulty: 'NIGHTMARE',
          boughtIn: false,
          completedAt: new Date().toISOString(),
          completedSource: 'discord'
        }
      ],
      lifeEnergy: [],
      version: 3
    });

    const completedRaid = component.plannerRosters[0].plannerRows[0].raidsByFamily['serca'];
    expect(completedRaid?.completed).toBeTrue();
    expect(component.isRaidAvailable(completedRaid!)).toBeFalse();
  });

  it('keeps non-whitelisted 1740 characters on serca hm', () => {
    component.rosters = [
      {
        key: 'test',
        title: 'Test Roster',
        sourcePath: '/character/test',
        sourceCharacter: 'Tester',
        bannerImage: '',
        bannerAccent: '#ff5fab',
        averageItemLevel: 0,
        averageCombatPower: 0,
        highestItemLevel: 0,
        allCharacters: [],
        characters: [
          {
            id: 201,
            name: 'Paladeeznutt',
            classKey: 'holy_knight',
            classLabel: 'Holyknight',
            itemLevel: 1744.17,
            combatPower: 3795.99,
            combatPowerIsEstimate: false,
            lastUpdate: 1,
            characterUrl: 'https://example.com/paladeeznutt'
          }
        ]
      }
    ];

    const sercaRaid = component.plannerRosters[0].plannerRows[0].raidsByFamily['serca'];
    expect(sercaRaid?.raidKey).toBe('serca-hm');
    expect(sercaRaid?.difficulty).toBe('HM');
  });

  it('uses persisted life energy status when projecting the full timer', () => {
    component.rosters = [
      {
        key: 'shekel',
        title: "Shekel's Roster",
        sourcePath: '/character/test',
        sourceCharacter: 'Tester',
        bannerImage: '',
        bannerAccent: '#ff5fab',
        averageItemLevel: 0,
        averageCombatPower: 0,
        highestItemLevel: 0,
        allCharacters: [],
        characters: []
      }
    ];

    const updatedAt = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
    rosterState.pushState({
      reset: getWeeklyResetContext(),
      raidCompletions: [],
      lifeEnergy: [
        {
          rosterKey: 'shekel',
          current_life_energy: 10000,
          life_energy_last_updated_at: updatedAt,
          calculated_full_at: new Date(Date.now() + (30 * 60 * 1000)).toISOString(),
          reminder_sent_at: null
        }
      ],
      version: 2
    });

    const preview = component.getLifeEnergyPreview('shekel');
    expect(preview.currentLifeEnergy).toBeGreaterThanOrEqual(10000);
    expect(preview.msUntilFull).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('shows a single shared life energy panel bound to the selected roster', () => {
    component.rosters = [
      {
        key: 'shekel',
        title: "Shekel's Roster",
        sourcePath: '/character/test',
        sourceCharacter: 'Tester',
        bannerImage: '',
        bannerAccent: '#ff5fab',
        averageItemLevel: 0,
        averageCombatPower: 0,
        highestItemLevel: 0,
        allCharacters: [],
        characters: []
      },
      {
        key: 'dj',
        title: "DJ's Roster",
        sourcePath: '/character/dj',
        sourceCharacter: 'DJ',
        bannerImage: '',
        bannerAccent: '#ff5fab',
        averageItemLevel: 0,
        averageCombatPower: 0,
        highestItemLevel: 0,
        allCharacters: [],
        characters: []
      }
    ];

    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.life-energy-shell').length).toBe(1);
    expect(component.selectedLifeEnergyRosterKey).toBe('shekel');

    component.onLifeEnergyRosterChange('dj');
    fixture.detectChanges();

    expect(component.selectedLifeEnergyRosterKey).toBe('dj');
    expect(host.querySelector('.life-energy-selected-roster strong')?.textContent).toContain("DJ's Roster");
  });
});
