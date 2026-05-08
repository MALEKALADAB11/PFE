export interface Advisor {
  id:           string;
  name:         string;
  initials:     string;
  role:         string;
  avatarColor:  string;
  caRealized:   number;
  caObjectif:   number;
  performance:  number;
  previsionEod: number;
  coachScore:   number;
  clients:      number;
  status:       'ok' | 'top' | 'urgent' | 'attente';  
  coachAdvice?: string;
}

export interface CoachingCard {
  id: string;
  advisorName: string;
  advisorInitials: string;
  avatarColor: string;
  priority: 'HIGH' | 'MED' | 'OK';
  target: number;
  gap: number;
  context: string;
  advice: string;
  time: string;
  status: 'pending' | 'approved' | 'escalate';
}