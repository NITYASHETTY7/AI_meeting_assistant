export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
}

export interface CalendarService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getUpcomingEvents(): Promise<CalendarEvent[]>;
}
