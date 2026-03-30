import { Component, Input, OnInit } from '@angular/core';
import { ApiResponse } from '../api-model';
import { MatGridListModule } from '@angular/material/grid-list';
import { NgClass, NgFor, NgIf, NgStyle } from '@angular/common';
import { groupBy } from 'lodash';
import { config } from '../../app-config';

@Component({
  selector: 'app-raid-info',
  imports: [MatGridListModule, NgFor, NgIf, NgStyle, NgClass],
  templateUrl: './raid-info.component.html',
  styleUrl: './raid-info.component.css'
})

export class RaidInfoComponent implements OnInit {
  @Input()
  set rosters(value: ApiResponse[]) {
    if (value.length == 0)
      return;

    this.groupByRoster(value);
  }

  groupedByRoster: string[] = ['Total'];
  raids = config.raids;

  characterRaidCount: { [key: string]: number } = {};

  constructor() { }

  ngOnInit(): void { }

  generateColumns(count: number) {
    this.raids.forEach((raid) => {
      console.error(!!raid.hideRaid)
      for (let index = 0; index <= count; index++) {
        raid.values.push({ dps: 0, supp: 0, dpsNames: [''], suppNames: [''] })
      }
    })
  }

  groupByRoster(value: ApiResponse[]) {
    const groupByRosterName = groupBy(value, 'RosterName')
    this.generateColumns(Object.keys(groupByRosterName).length)
    this.groupedByRoster = this.groupedByRoster.concat(Object.keys(groupByRosterName))
    for (let i = 1; i < this.groupedByRoster.length; i++) {
      const rosterName = this.groupedByRoster[i];
      for (let k = 0; k < groupByRosterName[rosterName].length; k++) {
        const char = groupByRosterName[rosterName][k];
        this.initializeCharacterRaidCount(char)
        this.updateSerkaRunCount(0, i, char)
        this.updateKazerosRunCount(3, i, char)
        this.updateAct4RunCount(4, i, char)
        this.updateMordumRunCount(5, i, char)
      }
    }
  }

  updateSerkaRunCount(rowIndex: number, indexToUpdate: number, char: ApiResponse) {
    switch (true) {
      case char.Level >= 1740:
        // NM
        this.increamentRoleByClassName(rowIndex, indexToUpdate, char, true)
        break;
      case char.Level >= 1730:
        // HM
        this.increamentRoleByClassName(rowIndex + 1, indexToUpdate, char, true)
        break;
      case char.Level >= 1710:
        // NM
        this.increamentRoleByClassName(rowIndex + 2, indexToUpdate, char, true)
        break;
      default:
        break;
    }
  }

  updateKazerosRunCount(rowIndex: number, indexToUpdate: number, char: ApiResponse) {
    switch (true) {
      case char.Level >= 1730:
        // HM
        this.increamentRoleByClassName(rowIndex, indexToUpdate, char)
        break;
      default:
        break;
    }
  }

  updateAct4RunCount(rowIndex: number, indexToUpdate: number, char: ApiResponse) {
    switch (true) {
      case char.Level >= 1720:
        // HM
        this.increamentRoleByClassName(rowIndex, indexToUpdate, char)
        break;
      default:
        break;
    }
  }

  updateMordumRunCount(rowIndex: number, indexToUpdate: number, char: ApiResponse) {
    switch (true) {
      case char.Level >= 1700:
        // HM
        this.increamentRoleByClassName(rowIndex, indexToUpdate, char)
        break;
      default:
        break;
    }
  }

  /**
   * Increament dps or supp for specific raid
   * 0 - Total
   * 1 - Kazeros HM
   * 2 - Kazeros NM
   * 3 - Act 4 HM
   * 4 - Act 4 NM
   * 5 - Mordum HM
   */
  increamentRoleByClassName(raidIndex: number, indexToUpdate: number, char: ApiResponse, ignore: boolean = false) {
    if (this.isMaximumRaidCountReached(char) && !ignore)
      return;

    if (!ignore)
      this.characterRaidCount[char.CharacterName] += 1;

    if (char.IsSupport) {
      this.raids[raidIndex].values[indexToUpdate].supp += 1
      this.raids[raidIndex].values[indexToUpdate].suppNames.push(char.CharacterName)
      this.raids[raidIndex].values[0].supp += 1;
      this.raids[raidIndex].values[0].suppNames.push(char.CharacterName)
    } else {
      this.raids[raidIndex].values[indexToUpdate].dps += 1
      this.raids[raidIndex].values[indexToUpdate].dpsNames.push(char.CharacterName)
      this.raids[raidIndex].values[0].dps += 1;
      this.raids[raidIndex].values[0].dpsNames.push(char.CharacterName)
    }
  }

  isMaximumRaidCountReached(char: ApiResponse): boolean {
    return this.characterRaidCount[char.CharacterName] === 3;
  }

  initializeCharacterRaidCount(char: ApiResponse) {
    this.characterRaidCount[char.CharacterName] = 0;
  }
}

