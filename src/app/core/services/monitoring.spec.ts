import { TestBed } from '@angular/core/testing';
import { Monitoring } from '../../features/monitoring/monitoring';
import { MonitoringService } from './monitoring.service';


describe('Monitoring', () => {
  let service: Monitoring;
  describe('MonitoringService', () => {
    let service: MonitoringService;

    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(MonitoringService);
    });

    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });
});