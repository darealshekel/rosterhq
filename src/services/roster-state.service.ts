import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, of, timer } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { LifeEnergyStatusRecord, RosterSyncState, WeeklyRaidCompletionRecord } from '../app/api-model';
import { calculateLifeEnergyFromCurrent, getRaidTierByKey, getWeeklyResetContext } from '../shared/rosterhq-core.js';

interface RaidCompletionMutation {
  rosterKey: string;
  characterId: number;
  raidKey: string;
  boughtIn: boolean;
  completed: boolean;
}

interface LifeEnergyMutation {
  rosterKey: string;
  currentLifeEnergy: number;
}

@Injectable({
  providedIn: 'root'
})
export class RosterStateService implements OnDestroy {
  private readonly storageKey = 'roster-hq-sync-cache-v3';
  private readonly pollIntervalMs = 15000;
  private readonly endpoint = environment.rosterSyncApi;
  private readonly stateSubject = new BehaviorSubject<RosterSyncState>(this.restoreCachedState());
  private pollSubscription?: Subscription;

  readonly state$ = this.stateSubject.asObservable();

  constructor(private http: HttpClient) {}

  start(): void {
    if (!this.endpoint || this.pollSubscription) {
      return;
    }

    this.refresh().subscribe();
    this.pollSubscription = timer(this.pollIntervalMs, this.pollIntervalMs)
      .pipe(switchMap(() => this.fetchState()))
      .subscribe((state) => this.commitState(state));
  }

  refresh(): Observable<RosterSyncState> {
    if (!this.endpoint) {
      return of(this.snapshot);
    }

    return this.fetchState().pipe(tap((state) => this.commitState(state)));
  }

  upsertRaidCompletion(mutation: RaidCompletionMutation): Observable<RosterSyncState> {
    if (!this.endpoint) {
      const nextState = this.applyRaidCompletionMutation(this.snapshot, mutation);
      this.commitState(nextState);
      return of(nextState);
    }

    return this.http.put<RosterSyncState>(`${this.endpoint}/api/raid-completions`, mutation).pipe(
      tap((state) => this.commitState(state)),
      catchError(() => {
        const nextState = this.applyRaidCompletionMutation(this.snapshot, mutation);
        this.commitState(nextState);
        return of(nextState);
      })
    );
  }

  updateLifeEnergy(mutation: LifeEnergyMutation): Observable<RosterSyncState> {
    if (!this.endpoint) {
      const nextState = this.applyLifeEnergyMutation(this.snapshot, mutation);
      this.commitState(nextState);
      return of(nextState);
    }

    return this.http.put<RosterSyncState>(`${this.endpoint}/api/life-energy`, mutation).pipe(
      tap((state) => this.commitState(state)),
      catchError(() => {
        const nextState = this.applyLifeEnergyMutation(this.snapshot, mutation);
        this.commitState(nextState);
        return of(nextState);
      })
    );
  }

  get snapshot(): RosterSyncState {
    return this.stateSubject.value;
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
  }

  private fetchState(): Observable<RosterSyncState> {
    return this.http.get<RosterSyncState>(`${this.endpoint}/api/state`).pipe(
      catchError(() => of(this.snapshot))
    );
  }

  private applyRaidCompletionMutation(state: RosterSyncState, mutation: RaidCompletionMutation): RosterSyncState {
    const reset = state.reset ?? getWeeklyResetContext();
    const familyKey = getRaidTierByKey(mutation.raidKey)?.familyKey ?? mutation.raidKey.split('-').slice(0, -1).join('-');
    const existing = state.raidCompletions.filter(
      (completion) => !(completion.characterId === mutation.characterId && completion.familyKey === familyKey)
    );
    const nextCompletions = mutation.completed
      ? [
          ...existing,
          this.createFallbackCompletion(reset.currentWeekId, mutation, state.raidCompletions, familyKey)
        ]
      : existing;

    return {
      ...state,
      raidCompletions: nextCompletions,
      updatedAt: new Date().toISOString(),
      version: (state.version ?? 0) + 1
    };
  }

  private applyLifeEnergyMutation(state: RosterSyncState, mutation: LifeEnergyMutation): RosterSyncState {
    const computed = calculateLifeEnergyFromCurrent(mutation.currentLifeEnergy, new Date());
    const nextRecord: LifeEnergyStatusRecord = {
      rosterKey: mutation.rosterKey,
      current_life_energy: computed.currentLifeEnergy,
      life_energy_last_updated_at: new Date().toISOString(),
      calculated_full_at: computed.fullAt,
      reminder_sent_at: computed.isFull ? new Date().toISOString() : null
    };
    const nextLifeEnergy = [
      ...state.lifeEnergy.filter((entry) => entry.rosterKey !== mutation.rosterKey),
      nextRecord
    ];

    return {
      ...state,
      lifeEnergy: nextLifeEnergy,
      updatedAt: new Date().toISOString(),
      version: (state.version ?? 0) + 1
    };
  }

  private createFallbackCompletion(
    weekId: string,
    mutation: RaidCompletionMutation,
    existingCompletions: WeeklyRaidCompletionRecord[],
    familyKey: string
  ): WeeklyRaidCompletionRecord {
    const raidKeyParts = mutation.raidKey.split('-');
    const difficultyKey = raidKeyParts.at(-1)?.toUpperCase() === 'NIGHTMARE'
      ? 'NIGHTMARE'
      : (raidKeyParts.at(-1)?.toUpperCase() as WeeklyRaidCompletionRecord['difficulty'] | undefined) ?? 'NM';
    const existingMatch = existingCompletions.find(
      (completion) => completion.characterId === mutation.characterId && completion.familyKey === familyKey
    );

    return {
      id: existingMatch?.id,
      weekId,
      rosterKey: mutation.rosterKey,
      characterId: mutation.characterId,
      characterName: existingMatch?.characterName ?? `Character ${mutation.characterId}`,
      familyKey,
      raidKey: mutation.raidKey,
      difficulty: difficultyKey,
      boughtIn: mutation.boughtIn,
      completedAt: new Date().toISOString(),
      completedSource: 'website'
    };
  }

  private commitState(state: RosterSyncState): void {
    const normalizedState = this.normalizeState(state);
    this.stateSubject.next(normalizedState);
    this.persistCache(normalizedState);
  }

  private normalizeState(state: RosterSyncState | null | undefined): RosterSyncState {
    return {
      reset: state?.reset ?? getWeeklyResetContext(),
      raidCompletions: state?.raidCompletions ?? [],
      lifeEnergy: state?.lifeEnergy ?? [],
      updatedAt: state?.updatedAt,
      version: state?.version ?? 0
    };
  }

  private restoreCachedState(): RosterSyncState {
    try {
      if (typeof window === 'undefined') {
        return this.normalizeState(undefined);
      }

      const rawState = window.localStorage.getItem(this.storageKey);
      if (!rawState) {
        return this.normalizeState(undefined);
      }

      return this.normalizeState(JSON.parse(rawState) as RosterSyncState);
    } catch {
      return this.normalizeState(undefined);
    }
  }

  private persistCache(state: RosterSyncState): void {
    try {
      if (typeof window === 'undefined') {
        return;
      }

      window.localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch {
      // Ignore cache write failures in restricted browsing contexts.
    }
  }
}
