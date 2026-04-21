import { Component } from '@angular/core';
import { AgentTimelineComponent } from './agent-timeline';


@Component({
  selector: 'app-realtime-page',
  standalone: true,
  imports: [AgentTimelineComponent],
  template: `
    <h2>Realtime Agent Stream</h2>
    <app-agent-timeline />
  `,
})
export class RealtimePageComponent {}