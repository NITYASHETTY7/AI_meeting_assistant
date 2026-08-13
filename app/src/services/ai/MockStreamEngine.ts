import type { LiveTranscriptionOptions, TranscriptEvent } from './AIProvider';

export class MockStreamEngine {
  private options?: LiveTranscriptionOptions;
  private intervalId: any = null;
  private sequenceId = 0;
  private startTime = 0;

  /**
   * Simulates opening a WebSocket-like stream connection.
   */
  async start(options: LiveTranscriptionOptions): Promise<void> {
    this.options = options;
    this.sequenceId = 0;
    this.startTime = Date.now();

    // Simulate network socket connection handshake delay
    setTimeout(() => {
      this.intervalId = setInterval(() => {
        this.generateMockSegment();
      }, 7000); // Generate a transcript segment every 7 seconds
    }, 600);
  }

  /**
   * Simulates closing the stream connection and cleaning up resources.
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Simulates sending a binary PCM float chunk down the network stream.
   */
  async processChunk(chunk: Float32Array): Promise<void> {
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i] * chunk[i];
    }
    const rms = Math.sqrt(sum / chunk.length);
    if (rms > 0.01) {
      console.log(`[MockStreamEngine] Streaming chunk - size: ${chunk.length} samples, RMS level: ${rms.toFixed(4)}`);
    }
  }

  private generateMockSegment(): void {
    if (!this.options) return;

    const speakers = ['Nisha Shetty', 'Devon Lane', 'Arlene McCoy'];
    const mockPhrases = [
      "We are testing the dynamic speech-to-text connection.",
      "The streaming layer seems fully provider-agnostic and maintains sequence order.",
      "Let's check if the typewriter effect displays smoothly on active notes.",
      "Yes, the autoscroll behavior updates nicely as well.",
      "I see the chunk buffers are compiling WAV files without drops.",
      "Looks correct. The compilation build is passing successfully."
    ];

    const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
    const timeStr = `${minutes}:${seconds}`;

    const speaker = speakers[this.sequenceId % speakers.length];
    const text = mockPhrases[this.sequenceId % mockPhrases.length];
    const segmentId = `seg-${Date.now()}-${this.sequenceId}`;

    const event: TranscriptEvent = {
      text,
      speaker,
      timestamp: timeStr,
      isPartial: false,
      confidence: 0.97,
      segmentId,
      sequenceId: this.sequenceId,
      audioStartTime: Math.max(0, elapsedSeconds - 6),
      audioEndTime: elapsedSeconds
    };

    // Trigger the callback
    this.options.onTranscriptUpdate(event);
    this.sequenceId++;
  }
}
