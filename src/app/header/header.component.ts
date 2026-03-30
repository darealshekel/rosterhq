import { Component, ElementRef, HostListener, OnInit, signal, } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ApiService } from '../../services/api.service';
import { first } from 'rxjs';
import { isNull } from 'lodash';
import { NgIf } from '@angular/common';
import { config } from '../../app-config';

interface User {
  discord_id: string,
  avatar: string
}

@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, NgIf],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  user = signal<User | null>(null);
  isDiscordImageFocus = signal<boolean>(false);
  displayDiscord = false

  constructor(private api: ApiService, private eRef: ElementRef) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const clickedInsideDropdown = target.closest('.discord-user');
    // Close dropdown only if clicked outside this component
    if (!clickedInsideDropdown) {
      this.isDiscordImageFocus.update(() => false);
    }
  }

  ngOnInit(): void {
    this.api.getUser().pipe(first()).subscribe((res) => {
      if (isNull(res))
        return;

      this.user.update(() => res);
    })

    setTimeout(() => {
      this.displayDiscord = true;
    }, 200)
  }

  redirectDiscordLogin() {
    window.location.href = `${config.api.endPoint}/auth/discord/login`;
  }

  isUserSet() {
    return isNull(this.user())
  }

  getAvatar(): string {
    return `https://cdn.discordapp.com/avatars/${this.user()?.discord_id}/${this.user()?.avatar}`
  }

  onUserClick() {
    this.isDiscordImageFocus.update(() => !this.isDiscordImageFocus())
  }

  onLogoutClick() {
    this.api.logoutUser().pipe(first()).subscribe((res) => { })
    this.user.update(() => null)
  }
}
