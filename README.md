# AI Meeting Assistant

An AI-powered desktop meeting assistant for Windows, macOS, and Linux. AI Meeting Assistant automatically detects when you join a meeting, records and transcribes the conversation, and turns it into a clean summary with action items — all stored locally on your machine.

## What it does

- **Automatic meeting detection** — Watches for active calls in Microsoft Teams (desktop and browser) and prompts you to start recording, both as an in-app banner and a native OS notification. No need to remember to press a button.
- **Live transcription** — Streams your microphone audio to your chosen AI provider's speech-to-text model in near real time while you talk.
- **Speaker diarization** — When using AssemblyAI or Deepgram, transcripts are labeled by speaker (Speaker A, Speaker B, ...) rather than a single generic voice.
- **AI-generated summaries** — After a meeting ends, generates a clean summary, key decisions, and follow-up action items from the transcript.
- **AI chat** — Ask questions about a specific meeting's transcript, or have a general conversation, using the same AI provider you've connected.
- **Live translation** — Translate any individual transcript line into one of several languages on demand.
- **Bring-your-own-key** — No bundled AI service or cloud account. You connect your own API key for OpenAI, Groq, Anthropic, Gemini, AWS Bedrock, Azure OpenAI, AssemblyAI, Deepgram, OpenRouter, Ollama, or any OpenAI-compatible endpoint. Keys are stored in your OS credential manager (Windows Credential Manager / macOS Keychain / Linux libsecret), never in plain text, and never sent anywhere except directly to the provider you chose.
- **Automatic fallback transcription** — If your primary provider's transcription call fails (expired key, rate limit, network blip), AI Meeting Assistant automatically retries through Deepgram if you've configured a key for it.
- **Fully local storage** — Meetings, transcripts, notes, action items, and chat history are stored in a local SQLite database on your device. There is no cloud sync and no account system.
- **Audio retention controls** — Configure how long recorded audio is kept (7/30/90 days or forever), see real storage usage, and clear all recordings with one click.
- **Customizable** — Theme (light/dark/system), notification preferences, transcription language, and quick provider switching, all from Settings.

## Tech stack

- Electron + React + TypeScript + Vite
- Tailwind CSS
- Zustand (state management)
- Better SQLite3 + Drizzle ORM (local database)
- pnpm

## 🏗️ System Architecture

┌──────────────────────────────────────────────────────────────────────────────┐
│                         AI MEETING ASSISTANT                                 │
│                         Desktop Application                                  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌───────────────────┐               ┌───────────────────┐
          │   React Renderer  │    Inter      │  Electron Main    │
          │                   │    Process    │     Process       │
          │ • Dashboard       │ Communication │                   │
          │ • Meeting UI      │◄───── IPC ───►│ • OS APIs         │
          │ • Live Transcript │               │ • Audio Capture   │
          │ • AI Chat         │               │ • Meeting Detect. │
          │ • Settings        │               │ • Database        │
          │ • Meeting History │               │ • Credentials     │
          └─────────┬─────────┘               └─────────┬─────────┘
                    │                                   │
                    ▼                                   ▼
          ┌───────────────────┐               ┌───────────────────┐
          │  Zustand Store    │               │ Meeting Detection │
          │                   │               │                   │
          │ • Meeting State   │               │ Every ~5 seconds  │
          │ • Recording State │               │ • PowerShell      │
          │ • Transcript      │               │ • OS Window       │
          │ • AI Provider     │               │ • Title Matching  │
          │ • UI State        │               └─────────┬─────────┘
          └─────────┬─────────┘                         │
                    │                                   ▼
                    │                          ┌───────────────────┐
                    │                          │ Meeting Detected  │
                    │                          └─────────┬─────────┘
                    │                                    │
                    │                                    ▼
                    │                          ┌───────────────────┐
                    │                          │ OS Notification   │
                    │                          └───────────────────┘
                    │
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           AUDIO PIPELINE                                     │
└──────────────────────────────────────────────────────────────────────────────┘

       ┌─────────────────────┐             ┌─────────────────────┐
       │  Microphone Input   │             │    System Audio     │
       │      (User)         │             │  WASAPI Loopback    │
       └──────────┬──────────┘             └──────────┬──────────┘
                  │                                   │
                  ▼                                   ▼
       ┌─────────────────────┐             ┌─────────────────────┐
       │   Audio Capture     │             │   Audio Capture     │
       └──────────┬──────────┘             └──────────┬──────────┘
                  │                                   │
                  └─────────────────┬─────────────────┘
                                    ▼
                         ┌────────────────────────────────────────-
                         │  PCM(Pulse Code Modulation) Audio      │
                         │    16 kHz / Mono                       │
                         └──────────┬─────────────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Audio Chunks       │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │  RMS / VAD Check     │
                         └──────────┬───────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                         ▼                     ▼
                   ┌───────────┐        ┌───────────────┐
                   │  Silence  │        │    Speech     │
                   └─────┬─────┘        └───────┬───────┘
                         │                      │
                         ▼                      ▼
                    Ignore /              Audio Buffer
                       Wait                    │
                                              ▼
                                    ┌────────────────────┐
                                    │ ~300 ms Pre-Roll   │
                                    │      Buffer        │
                                    └─────────┬──────────┘
                                              │
                                              ▼
                                    Continue Capturing
                                              │
                                              ▼
                                    ┌────────────────────┐
                                    │ Silence Detection  │
                                    │      Timer         │
                                    └─────────┬──────────┘
                                              │
                                              ▼
                                    Silence > Duration
                                              │
                                              ▼
                                    ┌────────────────────┐
                                    │ Utterance          │
                                    │ Finalized          │
                                    └─────────┬──────────┘
                                              │
                                              ▼
                                    ┌────────────────────┐
                                    │    Whisper STT     │
                                    └─────────┬──────────┘
                                              │
                                              ▼
                                    ┌────────────────────┐
                                    │ Transcript Segment │
                                    └─────────┬──────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                    ┌───────────────────┐           ┌───────────────────┐
                    │ Hallucination     │           │ Speaker           │
                    │ Filtering         │           │ Processing        │
                    └─────────┬─────────┘           └─────────┬─────────┘
                              │                               │
                              └───────────────┬───────────────┘
                                              ▼
                                    ┌────────────────────┐
                                    │  Clean Transcript  │
                                    └─────────┬──────────┘
                                              │
                                              ▼
                                    ┌────────────────────┐
                                    │   Zustand / UI     │
                                    └─────────┬──────────┘
                                              │
                                              ▼
                                    ┌────────────────────┐
                                    │   SQLite Storage   │
                                    └────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────┐
│                         AI PROCESSING PIPELINE                               │
└──────────────────────────────────────────────────────────────────────────────┘

                              Clean Transcript
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │ AI Provider Abstraction │
                         └────────────┬────────────┘
                                      │
              ┌───────────────────────┼────────────────────────┐
              │            │          │          │             │
              ▼            ▼          ▼          ▼             ▼
           OpenAI       Gemini    Anthropic   OpenRouter   Custom Provider
              │            │          │          │             │
              └────────────┴──────────┴──────────┴─────────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │   AI Response Layer  │
                           └──────────┬───────────┘
                                      │
                     ┌────────────────┼────────────────┐
                     │                │                │
                     ▼                ▼                ▼
                 Summary        Action Items       AI Insights
                     │                │                │
                     └────────────────┼────────────────┘
                                      │
                                      ▼
                                 AI Chat
                                      │
                                      ▼
                              SQLite Persistence


┌──────────────────────────────────────────────────────────────────────────────┐
│                         DATA & SECURITY                                      │
└──────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────┐
                         │      SQLite DB       │
                         │                      │
                         │ • Meetings           │
                         │ • Transcripts        │
                         │ • Summaries          │
                         │ • Action Items       │
                         │ • Meeting Metadata   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │    Drizzle ORM       │
                         │                      │
                         │ Type-safe DB Access  │
                         └──────────────────────┘


                         API Keys / Credentials
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ OS Credential        │
                         │ Manager              │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         Secure Local Storage

## Directory structure

- `app/` — the Electron + React + TypeScript application. All development happens here.

## Getting started

```bash
cd app
pnpm install
pnpm dev
```

This starts the Vite dev server for the React UI and launches the Electron app with hot module reload.

On first launch, you'll be guided through a short setup: connect an AI provider with your own API key, grant microphone access, and enable desktop notifications.

## Building for production

```bash
cd app
pnpm build
```

## Local data

- SQLite database: `app/database/granola.db`
- Recorded audio: `app/recordings/`

Neither is included in this repository — they contain your personal meeting data and are excluded via `.gitignore`.

## Privacy

AI Meeting Assistant does not operate any backend server, does not collect analytics, and does not transmit your data anywhere except directly to the AI provider you configure with your own API key. Your meeting audio, transcripts, and notes stay on your device.
