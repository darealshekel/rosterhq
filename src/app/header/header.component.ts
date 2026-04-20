import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { GroupRoster } from '../api-model';
import { getNextDailyResetAt, getWeeklyResetContext } from '../../shared/rosterhq-core.js';

@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, NgIf, NgFor, DecimalPipe],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
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
    const dailyTarget = getNextDailyResetAt(now);
    const weeklyTarget = new Date(getWeeklyResetContext(now).nextWeeklyResetAt);

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
}
