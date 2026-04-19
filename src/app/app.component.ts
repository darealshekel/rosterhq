import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatProgressSpinnerModule, ProgressSpinnerMode } from '@angular/material/progress-spinner';
import { HeaderComponent } from './header/header.component';
import { RosterComponent } from './roster/roster.component';
import { GroupRoster } from './api-model';
import { ApiService } from '../services/api.service';

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
        this.errorMessage = error instanceof Error ? error.message : 'Failed to load roster data.';
      }
    });
  }
}
