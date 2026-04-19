import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { GroupRoster } from '../api-model';

@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, NgIf, NgFor, DecimalPipe],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  private readonly resetTimeZone = 'Asia/Jerusalem';
  private intervalId: number | null = null;

  @Input() rosters: GroupRoster[] = [];
  @Input() loading = false;

  dailyReset = '--H --M --S';
  weeklyReset = '--D --H --M --S';

  ngOnInit(): void {
    this.safeUpdateResetTimers();
    if (typeof window !== 'undefined') {
      this.intervalId = window.setInterval(() => this.safeUpdateResetTimers(), 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }
  }

  trackedCharacters(): number {
    return this.rosters.reduce((sum, roster) => sum + roster.characters.length, 0);
  }

  averagePeakLevel(): number {
    if (!Array.isArray(this.rosters) || !this.rosters.length) {
      return 0;
    }

    const totalPeak = this.rosters.reduce((sum, roster) => sum + roster.highestItemLevel, 0);
    return totalPeak / this.rosters.length;
  }

  private updateResetTimers(): void {
    const now = new Date();
    const dailyTarget = this.getNextReset(now, false);
    const weeklyTarget = this.getNextReset(now, true);

    this.dailyReset = this.formatDailyCountdown(dailyTarget.getTime() - now.getTime());
    this.weeklyReset = this.formatWeeklyCountdown(weeklyTarget.getTime() - now.getTime());
  }

  private safeUpdateResetTimers(): void {
    try {
      this.updateResetTimers();
    } catch {
      this.dailyReset = '--H --M --S';
      this.weeklyReset = '--D --H --M --S';
    }
  }

  private getNextReset(now: Date, weekly: boolean): Date {
    const local = this.getZonedParts(now);
    const currentWeekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    let dayOffset = 0;

    if (weekly) {
      dayOffset = (3 - currentWeekday + 7) % 7;
      if (dayOffset === 0 && this.isAtOrPastReset(local)) {
        dayOffset = 7;
      }
    } else if (this.isAtOrPastReset(local)) {
      dayOffset = 1;
    }

    const baseDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
    baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);

    return this.zonedDateTimeToUtcDate(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth() + 1,
      baseDate.getUTCDate(),
      13,
      0,
      0
    );
  }

  private isAtOrPastReset(local: ReturnType<HeaderComponent['getZonedParts']>): boolean {
    return local.hour > 13 || (local.hour === 13 && (local.minute > 0 || local.second >= 0));
  }

  private formatDailyCountdown(msUntilReset: number): string {
    const totalSeconds = Math.max(0, Math.floor(msUntilReset / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M ${String(seconds).padStart(2, '0')}S`;
  }

  private formatWeeklyCountdown(msUntilReset: number): string {
    const totalSeconds = Math.max(0, Math.floor(msUntilReset / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [
      `${String(days).padStart(2, '0')}D`,
      `${String(hours).padStart(2, '0')}H`,
      `${String(minutes).padStart(2, '0')}M`,
      `${String(seconds).padStart(2, '0')}S`
    ].join(' ');
  }

  private zonedDateTimeToUtcDate(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    let guess = desiredUtc;

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const zoned = this.getZonedParts(new Date(guess));
      const zonedAsUtc = Date.UTC(
        zoned.year,
        zoned.month - 1,
        zoned.day,
        zoned.hour,
        zoned.minute,
        zoned.second
      );
      guess += desiredUtc - zonedAsUtc;
    }

    return new Date(guess);
  }

  private getZonedParts(date: Date): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } {
    let formatter: Intl.DateTimeFormat;

    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: this.resetTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
    } catch {
      formatter = new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
    }

    const parts = formatter.formatToParts(date);
    const getValue = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');

    return {
      year: getValue('year'),
      month: getValue('month'),
      day: getValue('day'),
      hour: getValue('hour'),
      minute: getValue('minute'),
      second: getValue('second')
    };
  }
}
