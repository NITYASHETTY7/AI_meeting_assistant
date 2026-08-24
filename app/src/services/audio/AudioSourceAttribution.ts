/**
 * AudioSourceAttribution
 *
 * DETERMINISTIC source-to-speaker mapping. This is a two-audio-source
 * problem, not a speaker-identification problem — there is no AI decision,
 * no correlation, and no inference anywhere in this file.
 *
 *   MICROPHONE     → SPEAKER 1 (local user)
 *   SYSTEM OUTPUT  → SPEAKER 2 (remote participant)
 *
 * That is the complete rule. It holds regardless of:
 *  - whether headphones or speakers are in use
 *  - whether the other participant's audio leaks back into the microphone
 *    (acoustic echo/bleed) — the system-output stream is ALREADY the
 *    authoritative source for Speaker 2, so a leaked copy arriving via the
 *    microphone is never turned into a second Speaker 2 utterance; it's
 *    simply mic audio, attributed to Speaker 1 like any other mic audio.
 *  - the audio content itself — nothing here inspects voice
 *    characteristics, runs cross-correlation against a reference buffer,
 *    or asks a model to guess who's speaking.
 *
 * Previous versions of this file attempted echo/bleed correlation
 * (comparing mic audio against a rolling system-output buffer to detect
 * "is this the same audio leaking in") and a confidence-scored
 * local/remote/unknown three-way classification. That approach is
 * intentionally removed per explicit product direction: speaker identity
 * is fixed by which physical capture stream a chunk came from, full stop.
 * Diarization to distinguish MULTIPLE remote participants WITHIN the
 * system-output stream is an explicitly separate, later concern — not
 * addressed by this file.
 */

/** Which physical capture stream a chunk of audio came from. */
export type AudioSource = 'microphone' | 'system';

/** Deterministic speaker identity — fixed 1:1 by source, never inferred. */
export type SpeakerIdentity = 'Speaker 1' | 'Speaker 2';

export interface AttributedSegment {
  source: AudioSource;
  speaker: SpeakerIdentity;
  /**
   * Always 1 — kept only so downstream code that reads `confidence` (e.g.
   * TranscriptEvent) doesn't need a separate optional/required split.
   * There is no scoring here: a deterministic mapping is either right or
   * the source itself was wrong, never "partially confident".
   */
  confidence: 1;
  chunk: Float32Array;
  capturedAtMs: number;
}

export class AudioSourceAttribution {
  /** Deterministic: every microphone chunk is Speaker 1, unconditionally. */
  attributeMicChunk(chunk: Float32Array, capturedAtMs: number = Date.now()): AttributedSegment {
    return { source: 'microphone', speaker: 'Speaker 1', confidence: 1, chunk, capturedAtMs };
  }

  /** Deterministic: every system-output chunk is Speaker 2, unconditionally. */
  attributeSystemChunk(chunk: Float32Array, capturedAtMs: number = Date.now()): AttributedSegment {
    return { source: 'system', speaker: 'Speaker 2', confidence: 1, chunk, capturedAtMs };
  }
}
