import { TestBed } from '@angular/core/testing';

import { Monitoring } from './monitoring';

describe('Monitoring', () => {
  let service: Monitoring;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Monitoring);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
