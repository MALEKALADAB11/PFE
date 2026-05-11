import { TestBed } from '@angular/core/testing';

import { MockData } from './mock-data';

describe('MockData', () => {
  let service: MockData;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MockData);
import { MockDataService } from './mock-data';

describe('MockDataService', () => {
  let service: MockDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MockDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
