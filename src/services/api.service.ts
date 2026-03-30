import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { config } from '../app-config';

@Injectable({
  providedIn: 'root'
})

export class ApiService {
  constructor(private http: HttpClient) { }

  getRosters(): Observable<any> {
    return this.http.get(`${config.api.endPoint}/getRoster?rostergroupid=${config.api.staticId}`);
  }

  getHistory(): Observable<any> {
    return this.http.get(`${config.api.endPoint}/getHistory?rostergroupid=${config.api.staticId}`);
  }

  getUser(): Observable<any> {
    return this.http.get(`${config.api.endPoint}/getUser`, { withCredentials: true });
  }

  logoutUser(): Observable<any> {
    return this.http.get(`${config.api.endPoint}/logout`, { withCredentials: true });
  }
}