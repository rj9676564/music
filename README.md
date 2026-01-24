# Molten Music 🎵

Molten Music is a modern, cross-platform desktop music player built with Electron and React. It features a futuristic "liquid metal" design, powerful desktop lyric capabilities, and offline AI-powered lyrics generation.

![Molten Music Icon](public/icon.png)

## ✨ Features

- **Futuristic UI**: Glassmorphism design with fluid animations and a "molten" aesthetic.
- **Desktop Lyrics**: 
  - Floating desktop lyric window.
  - Karaoke-style word-by-word highlighting.
  - **Transparent Mode**: Pure text lyrics floating on your screen with customizable text shadows.
  - Fully customizable colors, fonts, and sizes.
  - "Lock" mode to let mouse events pass through.
- **Local Music Support**: 
  - Supports MP3, WAV, FLAC, M4A, and more.
  - Auto-scans for matching `.lrc` or `.srt` lyric files.
  - Manual lyric file selection support.
- **AI-Powered Transcription**:
  - Integrated with OpenAI Whisper (via local/remote API).
  - One-click "AI Generate Lyrics" for songs without lyric files.
  - Automatically saves generated lyrics as `.srt` files.
- **Smart Progress**:
  - Desktop lyric window stays in sync even when the main window is minimized (background throttling disabled).
  - Smooth 60fps lyric rendering.

## 🛠️ Tech Stack

- **Core**: [Electron](https://www.electronjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Styling**: CSS Modules, Glassmorphism
- **AI Integration**: Custom Whisper API client

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm (recommended) or npm

### Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:rj9676564/music.git
   cd molten-spicule
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run in development mode:
   ```bash
   pnpm dev
   ```

### Building for Production

To build the application for your local OS (macOS/Windows/Linux):

```bash
pnpm build
```

The output text will be in the `release` or `dist` directory.

## 🤖 AI Configuration

To use the AI transcription feature, you need a running Whisper ASR Webservice.
By default, it is configured to connect to: `http://d.mrlb.top:9999`

You can change this in `electron/main.ts` if you host your own local Whisper server (e.g., using [ahmetoner/whisper-asr-webservice](https://github.com/ahmetoner/whisper-asr-webservice)).

## 📄 License

[MIT](LICENSE)
