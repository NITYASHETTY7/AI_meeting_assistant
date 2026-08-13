export interface FileStorage {
  saveRecording(fileName: string, data: Blob): Promise<string>;
  saveExport(fileName: string, data: string): Promise<string>;
  saveTempFile(fileName: string, data: any): Promise<string>;
  saveToCache(key: string, data: any): Promise<void>;
  getFromCache(key: string): Promise<any>;
}

// TODO: In the future, recordings and exports should be stored in Electron's app.getPath('userData') directory for production.
