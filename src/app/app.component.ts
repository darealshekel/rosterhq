import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatProgressSpinnerModule, ProgressSpinnerMode } from '@angular/material/progress-spinner';
import { HeaderComponent } from './header/header.component';
import { RosterComponent } from './roster/roster.component';
import { GroupRoster } from './api-model';
import { ApiService } from '../services/api.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [HeaderComponent, RosterComponent, NgIf, MatProgressSpinnerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  providers: [ApiService]
})
export class AppComponent implements OnInit {
  title = 'group-roster-hq';
  mode: ProgressSpinnerMode = 'indeterminate';
  status: 'pending' | 'success' | 'error' = 'pending';
  isLoading = true;
  errorMessage = '';
  rostersData: GroupRoster[] = [];
  readonly loadingMessage = environment.production
    ? 'Loading the latest published roster snapshot...'
    : 'Fetching your live rosters from lostark.bible...';
  readonly errorTitle = environment.production ? 'Roster snapshot failed' : 'Roster sync failed';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadRosters();
  }

  loadRosters(): void {
    this.status = 'pending';
    this.isLoading = true;
    this.errorMessage = '';

    this.api.getGroupRosters().subscribe({
      next: (data) => {
        this.rostersData = data;
        this.status = 'success';
        this.isLoading = false;
      },
      error: (error) => {
        this.status = 'error';
        this.isLoading = false;
        this.errorMessage = error instanceof Error
          ? error.message
          : environment.production
            ? 'Failed to load the published roster snapshot.'
            : 'Failed to load live roster data.';
      }
    });
  }
}
