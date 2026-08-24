import type { AudioDevice } from './types/AudioDevice';

export class AudioDeviceManager {
  /**
   * Triggers audio permissions and enumerates input microphone devices.
   */
  static async getMicrophones(): Promise<AudioDevice[] | any[]> {
    try {
      // Prompt permissions if not already active to load device descriptors
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (tempStream) {
        tempStream.getTracks().forEach((t) => t.stop());
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone (${d.deviceId.slice(0, 5)})`,
          kind: 'audioinput'
        }));
    } catch (err) {
      console.error('Failed to retrieve microphones list:', err);
      return [];
    }
  }

  /**
   * Enumerates output speaker/audio destination devices.
   */
  static async getSpeakers(): Promise<AudioDevice[] | any[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker (${d.deviceId.slice(0, 5)})`,
          kind: 'audiooutput'
        }));
    } catch (err) {
      console.error('Failed to retrieve speakers output list:', err);
      return [];
    }
  }
}
