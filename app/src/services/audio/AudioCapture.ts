export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate: number = 44100;
  private onVolumeChange?: (level: number) => void;
  private onAudioChunk?: (chunk: Float32Array) => void;
  private isPaused: boolean = false;

  constructor(
    sampleRate: number = 44100,
    onVolumeChange?: (level: number) => void,
    onAudioChunk?: (chunk: Float32Array) => void
  ) {
    this.sampleRate = sampleRate;
    this.onVolumeChange = onVolumeChange;
    this.onAudioChunk = onAudioChunk;
  }

  /**
   * Initializes input media streams and script processor node listeners.
   */
  async start(deviceId: string = 'default'): Promise<void> {
    this.chunks = [];
    this.isPaused = false;

    // Build constraints based on hardware target settings
    const constraints = {
      audio: deviceId === 'default' ? true : { deviceId: { exact: deviceId } }
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Instantiate AudioContext using customized target rate settings
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({
      sampleRate: this.sampleRate
    });

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    
    // 4096 buffer size, mono channel input and output
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      if (this.isPaused) return;

      const inputBuffer = e.inputBuffer.getChannelData(0);
      const chunkCopy = new Float32Array(inputBuffer);
      
      // Cache sample bytes block
      this.chunks.push(chunkCopy);

      // Invoke chunk streaming callback
      if (this.onAudioChunk) {
        this.onAudioChunk(chunkCopy);
      }

      // Calculate realtime RMS volume level
      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        sum += inputBuffer[i] * inputBuffer[i];
      }
      const rms = Math.sqrt(sum / inputBuffer.length);
      const volumeLevel = Math.min(100, Math.round(rms * 250));
      
      if (this.onVolumeChange) {
        this.onVolumeChange(volumeLevel);
      }
    };

    // Route signals to pipeline
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  /**
   * Pauses samples recording triggers.
   */
  pause(): void {
    this.isPaused = true;
    if (this.onVolumeChange) {
      this.onVolumeChange(0);
    }
  }

  /**
   * Resumes samples recording triggers.
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Disconnects nodes, closes audio context streams, and flattens buffer array.
   */
  stop(): Float32Array {
    this.isPaused = false;
    
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    if (this.source) {
      this.source.disconnect();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    this.processor = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;

    // Concatenate chunks
    let totalLength = 0;
    for (const chunk of this.chunks) {
      totalLength += chunk.length;
    }

    const flatSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      flatSamples.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunks = [];
    return flatSamples;
  }
}
