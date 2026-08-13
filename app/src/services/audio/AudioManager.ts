import { AudioDeviceManager } from './AudioDeviceManager';
import { RecordingController } from './RecordingController';
import type { AudioDevice } from './types/AudioDevice';

export class AudioManager {
  private static controller: RecordingController | null = null;

  /**
   * Resolves a singleton instance of the RecordingController.
   */
  static getController(onVolumeChange?: (level: number) => void): RecordingController {
    if (!this.controller) {
      this.controller = new RecordingController(onVolumeChange);
    }
    return this.controller;
  }

  /**
   * Retrieves lists of microphones hardware.
   */
  static async listMicrophones(): Promise<AudioDevice[]> {
    return AudioDeviceManager.getMicrophones();
  }

  /**
   * Retrieves lists of speakers outputs hardware.
   */
  static async listSpeakers(): Promise<AudioDevice[]> {
    return AudioDeviceManager.getSpeakers();
  }
}
