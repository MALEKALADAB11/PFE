export interface Agent {
  id: string;
  name: string;
  status: 'LIVE' | 'ACTIVE' | 'DONE' | 'RUN' | 'ERROR';
  latency: number;
}
