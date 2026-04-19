import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RosterComponent } from './roster.component';
import { GroupRoster } from '../api-model';

describe('RosterComponent', () => {
  let component: RosterComponent;
  let fixture: ComponentFixture<RosterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RosterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RosterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('updates only the toggled planner state without rebuilding the planner tree', () => {
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
            id: 101,
            name: 'Bröke',
            classKey: 'soul_eater',
            classLabel: 'Souleater',
            itemLevel: 1745,
            combatPower: 5000,
            combatPowerIsEstimate: false,
            lastUpdate: 1,
            characterUrl: 'https://example.com/alpha'
          },
          {
            id: 102,
            name: 'Beta',
            classKey: 'blade',
            classLabel: 'Deathblade',
            itemLevel: 1715,
            combatPower: 3000,
            combatPowerIsEstimate: false,
            lastUpdate: 1,
            characterUrl: 'https://example.com/beta'
          }
        ]
      }
    ];

    component.rosters = rosters;

    const plannerRostersRef = component.plannerRosters;
    const rosterRef = component.plannerRosters[0];
    const alphaRowRef = component.plannerRosters[0].plannerRows[0];
    const betaRowRef = component.plannerRosters[0].plannerRows[1];

    expect(alphaRowRef.totalGold).toBe(148000);
    expect(rosterRef.plannerTotalGold).toBe(256000);
    expect(rosterRef.plannerCompletedCount).toBe(6);

    component.onRaidToggle(101, 'serca-nightmare', false);

    expect(component.plannerRosters).toBe(plannerRostersRef);
    expect(component.plannerRosters[0]).toBe(rosterRef);
    expect(component.plannerRosters[0].plannerRows[0]).toBe(alphaRowRef);
    expect(component.plannerRosters[0].plannerRows[1]).toBe(betaRowRef);
    expect(alphaRowRef.raidsByFamily['serca']?.completed).toBeFalse();
    expect(alphaRowRef.totalGold).toBe(94000);
    expect(rosterRef.plannerTotalGold).toBe(202000);
    expect(rosterRef.plannerCompletedCount).toBe(5);
  });

  it('keeps non-whitelisted 1740 characters on serca hm', () => {
    const rosters: GroupRoster[] = [
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

    component.rosters = rosters;

    const sercaRaid = component.plannerRosters[0].plannerRows[0].raidsByFamily['serca'];

    expect(sercaRaid?.raidKey).toBe('serca-hm');
    expect(sercaRaid?.difficulty).toBe('HM');
    expect(sercaRaid?.gold).toBe(44000);
  });

  it('subtracts configured chest gold from completed raid totals', () => {
    const rosters: GroupRoster[] = [
      {
        key: 'test',
        title: 'Chest Test',
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
            id: 301,
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

    const rosterRef = component.plannerRosters[0];
    const rowRef = rosterRef.plannerRows[0];

    expect(rowRef.totalGold).toBe(148000);

    component.onChestToggle(301, 'final-day-hm', true);

    expect(rowRef.raidsByFamily['final-day']?.buysChest).toBeTrue();
    expect(rowRef.totalGold).toBe(131360);
    expect(rosterRef.plannerTotalGold).toBe(131360);
  });
});
