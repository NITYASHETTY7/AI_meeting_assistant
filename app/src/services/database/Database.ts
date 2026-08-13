export interface DatabaseService {
  initialize(): Promise<void>;
  close(): Promise<void>;
}

// TODO: In the future, the database should be stored in Electron's app.getPath('userData') directory for production.
