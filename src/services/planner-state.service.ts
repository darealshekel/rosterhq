import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, of, timer } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface PlannerSharedState {
  completionState: Record<string, boolean>;
  chestState: Record<string, boolean>;
  updatedAt?: string;
  version?: number;
}

interface PlannerMutation {
  kind: 'completion' | 'chest';
  key: string;
  value: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PlannerStateService implements OnDestroy {
  private readonly storageKey = 'roster-hq-shared-planner-cache-v1';
  private readonly pollIntervalMs = 15000;
  private readonly endpoint = environment.sharedPlannerStateApi;
  private readonly stateSubject = new BehaviorSubject<PlannerSharedState>(this.restoreCachedState());
  private pollSubscription?: Subscription;

  readonly state$ = this.stateSubject.asObservable();

  constructor(private http: HttpClient) {}

  start(): void {
    if (!this.endpoint) {
      return;
    }

    if (this.pollSubscription) {
      return;
    }

    this.refresh().subscribe();
    this.pollSubscription = timer(this.pollIntervalMs, this.pollIntervalMs)
      .pipe(switchMap(() => this.fetchState()))
      .subscribe((state) => this.commitState(state));
  }

  refresh(): Observable<PlannerSharedState> {
    if (!this.endpoint) {
      return of(this.snapshot);
    }

    return this.fetchState().pipe(
      tap((state) => this.commitState(state))
    );
  }

  setCompletion(key: string, value: boolean): Observable<PlannerSharedState> {
    return this.mutateState({ kind: 'completion', key, value });
  }

  setChest(key: string, value: boolean): Observable<PlannerSharedState> {
    return this.mutateState({ kind: 'chest', key, value });
  }

  get snapshot(): PlannerSharedState {
    return this.stateSubject.value;
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
  }

  private fetchState(): Observable<PlannerSharedState> {
    return this.http.get<PlannerSharedState>(`${this.endpoint}/state`).pipe(
      catchError(() => of(this.snapshot))
    );
  }

  private mutateState(mutation: PlannerMutation): Observable<PlannerSharedState> {
    if (!this.endpoint) {
      const nextState = this.applyMutation(this.snapshot, mutation);
      this.commitState(nextState);
      return of(nextState);
    }

    return this.http.post<PlannerSharedState>(`${this.endpoint}/state`, mutation).pipe(
      tap((state) => this.commitState(state)),
      catchError(() => {
        const nextState = this.applyMutation(this.snapshot, mutation);
        this.commitState(nextState);
        return of(nextState);
      })
    );
  }

  private applyMutation(state: PlannerSharedState, mutation: PlannerMutation): PlannerSharedState {
    const completionState = { ...(state.completionState ?? {}) };
    const chestState = { ...(state.chestState ?? {}) };

    if (mutation.kind === 'completion') {
      completionState[mutation.key] = mutation.value;
    } else {
      chestState[mutation.key] = mutation.value;
    }

    return {
      completionState,
      chestState,
      updatedAt: new Date().toISOString(),
      version: (state.version ?? 0) + 1
    };
  }

  private commitState(state: PlannerSharedState): void {
    const normalizedState = this.normalizeState(state);
    this.stateSubject.next(normalizedState);
    this.persistCache(normalizedState);
  }

  private normalizeState(state: PlannerSharedState | null | undefined): PlannerSharedState {
    return {
      completionState: state?.completionState ?? {},
      chestState: state?.chestState ?? {},
      updatedAt: state?.updatedAt,
      version: state?.version ?? 0
    };
  }

  private restoreCachedState(): PlannerSharedState {
    try {
      if (typeof window === 'undefined') {
        return this.normalizeState(undefined);
      }

      const rawState = window.localStorage.getItem(this.storageKey);
      if (!rawState) {
        return this.normalizeState(undefined);
      }

      return this.normalizeState(JSON.parse(rawState) as PlannerSharedState);
    } catch {
      return this.normalizeState(undefined);
    }
  }

  private persistCache(state: PlannerSharedState): void {
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
