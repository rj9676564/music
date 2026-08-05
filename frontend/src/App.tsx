import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import axios from "axios";
import { parseLrc, parseSrt } from "./utils/lrcParser";
import { mergeTranslation } from "./utils/lyricTranslation";
import type { LyricLine } from "./utils/lrcParser";
import { useSettingsStore } from "./store/settingsStore";
import { usePlayerStore } from "./store/playerStore";

// Components
import { PlayerPanel } from "./components/Player/PlayerPanel";
import { ChannelsPanel } from "./components/RSS/ChannelsPanel";
import { EpisodesPanel } from "./components/RSS/EpisodesPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import {
  SubtitlesIcon,
  SettingsIcon,
  RadioIcon,
  MusicNoteIcon,
} from "./components/Icons";

const LAST_PLAYBACK_STATE_KEY = "last-playback-state";

type PersistedPlaybackState = {
  version: 1;
  audioPath: string;
  musicInfo: any;
  currentChannel: any | null;
  currentTime: number;
  wasPlaying: boolean;
};

function App() {
  const APP_WINDOW_WIDTH = 760;
  const settings = useSettingsStore();

  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const audioPath = usePlayerStore((state) => state.audioPath);
  const lyrics = usePlayerStore((state) => state.lyrics);
  const activeIndex = usePlayerStore((state) => state.activeIndex);
  const musicInfo = usePlayerStore((state) => state.musicInfo);
  const isTranscribing = usePlayerStore((state) => state.isTranscribing);
  const playbackRate = usePlayerStore((state) => state.playbackRate);

  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime);
  const setActiveIndex = usePlayerStore((state) => state.setActiveIndex);
  const setAudio = usePlayerStore((state) => state.setAudio);
  const setLyrics = usePlayerStore((state) => state.setLyrics);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setTranscribing = usePlayerStore((state) => state.setTranscribing);
  const setPlaybackRate = usePlayerStore((state) => state.setPlaybackRate);
  const [isSummarizing, setSummarizing] = useState(false);

  type ViewMode = "player" | "channels" | "episodes" | "settings";
  const [viewMode, setViewMode] = useState<ViewMode>("player");
  const [playerSubpage, setPlayerSubpage] = useState<"overview" | "controls">(
    () =>
      localStorage.getItem("player-subpage") === "controls"
        ? "controls"
        : "overview",
  );
  const [isLyricLocked, setIsLyricLocked] = useState(true); // 默认锁定（点击穿透）
  const [podcastEpisodes, setPodcastEpisodes] = useState<any[]>([]);
  const [currentChannel, setCurrentChannel] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [loadingPodcast, setLoadingPodcast] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [sentenceLoopEnabled, setSentenceLoopEnabled] = useState(false);
  const [sentenceRepeatCount, setSentenceRepeatCount] = useState(() => {
    const saved = localStorage.getItem("sentence-repeat-count");
    const parsed = saved ? Number.parseInt(saved, 10) : 3;
    return Number.isFinite(parsed) ? Math.min(20, Math.max(1, parsed)) : 3;
  });
  const [sentenceLoopTargetIndex, setSentenceLoopTargetIndex] = useState<
    number | null
  >(null);
  const [sentenceLoopCompleted, setSentenceLoopCompleted] = useState(0);

  useEffect(() => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send("set-window-size", APP_WINDOW_WIDTH);
    }
  }, [APP_WINDOW_WIDTH, viewMode]);

  useEffect(() => {
    localStorage.setItem("player-subpage", playerSubpage);
  }, [playerSubpage]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const lyricListRef = useRef<HTMLDivElement>(null);
  const lastIpcUpdateRef = useRef({ index: -1, progress: -1 });
  const fetchControllerRef = useRef<AbortController | null>(null);
  const lastProgressPersistRef = useRef(0);
  const pendingRestoreRef = useRef<{
    currentTime: number;
    shouldPlay: boolean;
  } | null>(null);

  const resetSentenceLoop = useCallback(() => {
    setSentenceLoopEnabled(false);
    setSentenceLoopTargetIndex(null);
    setSentenceLoopCompleted(0);
  }, []);

  const getLyricEndTime = useCallback((index: number, currentLyrics: LyricLine[]) => {
    const line = currentLyrics[index];
    if (!line) return null;
    if (line.endTime !== undefined) return line.endTime;
    if (index < currentLyrics.length - 1) return currentLyrics[index + 1].time;
    return line.time + 2;
  }, []);

  const handleSentenceRepeatCountChange = useCallback((count: number) => {
    const nextCount = Math.min(20, Math.max(1, Math.round(count || 1)));
    setSentenceRepeatCount(nextCount);
    localStorage.setItem("sentence-repeat-count", String(nextCount));
    setSentenceLoopCompleted(0);
  }, []);

  const toggleSentenceLoop = useCallback(() => {
    if (sentenceLoopEnabled) {
      resetSentenceLoop();
      return;
    }
    if (activeIndex === -1 || !lyrics[activeIndex]) return;
    setSentenceLoopEnabled(true);
    setSentenceLoopTargetIndex(activeIndex);
    setSentenceLoopCompleted(0);
  }, [activeIndex, lyrics, resetSentenceLoop, sentenceLoopEnabled]);

  const findActiveLyricIndex = useCallback((time: number) => {
    const currentLyrics = usePlayerStore.getState().lyrics;
    for (let i = currentLyrics.length - 1; i >= 0; i -= 1) {
      const line = currentLyrics[i];
      const endTime =
        line.endTime !== undefined
          ? line.endTime
          : i < currentLyrics.length - 1
            ? currentLyrics[i + 1].time
            : Number.POSITIVE_INFINITY;

      if (time >= line.time && time <= endTime) {
        return i;
      }
    }
    return -1;
  }, []);

  const scrollToActive = useCallback(
    (immediate = false) => {
      const list = lyricListRef.current;
      if (!list || activeIndex === -1) return;
      const activeEl = list.children[activeIndex] as HTMLElement;
      if (!activeEl) return;
      const targetTop =
        activeEl.offsetTop - list.offsetHeight / 2 + activeEl.offsetHeight / 2;
      list.scrollTo({
        top: targetTop,
        behavior: immediate ? "auto" : "smooth",
      });
    },
    [activeIndex],
  );

  const handleOpenMusic = useCallback(async () => {
    if (!window.ipcRenderer) return;
    const file = await window.ipcRenderer.invoke("open-file", [
      { name: "Music", extensions: ["mp3", "wav", "m4a", "aac"] },
    ]);
    if (file) {
      const name =
        file.path
          .split("/")
          .pop()
          ?.replace(/\.[^/.]+$/, "") || "未知歌曲";
      resetSentenceLoop();
      setLyrics([]); // Clear lyrics immediately
      setAudio(file.url, { name, artist: "本地音源" });
      const match = await window.ipcRenderer.invoke(
        "find-matching-lyric",
        file.path,
      );
      setLyrics(
        match
          ? match.path.toLowerCase().endsWith(".srt")
            ? parseSrt(match.content)
            : parseLrc(match.content)
          : [],
      );
      const lastPos = localStorage.getItem(`pos-${file.url}`);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          if (lastPos) {
            audioRef.current.currentTime = parseFloat(lastPos);
            setCurrentTime(parseFloat(lastPos));
          }
        }
      }, 0);
    }
  }, [resetSentenceLoop, setAudio, setLyrics, setCurrentTime]);

  const persistPlaybackState = useCallback(
    (overrides?: Partial<PersistedPlaybackState>) => {
      const playerState = usePlayerStore.getState();
      const path = overrides?.audioPath ?? playerState.audioPath;
      if (!path) return;

      // translation 可达数十 KB，且重启后能由轮询重新取回，不进 localStorage。
      // srtContent 必须保留 —— 它是重启后恢复播客歌词的唯一来源（见 restoreTrack）。
      const { translation: _tr, ...persistableMusicInfo } =
        overrides?.musicInfo ?? playerState.musicInfo;

      const playbackState: PersistedPlaybackState = {
        version: 1,
        audioPath: path,
        musicInfo: persistableMusicInfo,
        currentChannel:
          overrides?.currentChannel !== undefined
            ? overrides.currentChannel
            : currentChannel,
        currentTime:
          overrides?.currentTime ??
          audioRef.current?.currentTime ??
          playerState.currentTime,
        wasPlaying:
          overrides?.wasPlaying ??
          (audioRef.current ? !audioRef.current.paused : playerState.isPlaying),
      };

      localStorage.setItem(
        LAST_PLAYBACK_STATE_KEY,
        JSON.stringify(playbackState),
      );
      localStorage.setItem(`pos-${path}`, String(playbackState.currentTime));

      if (path.startsWith("local-file://media")) {
        const filePath = decodeURIComponent(
          path.replace("local-file://media", ""),
        );
        localStorage.setItem(
          "last-played-music",
          JSON.stringify({
            path: filePath,
            name: playbackState.musicInfo?.name,
            artist: playbackState.musicInfo?.artist,
          }),
        );
      }
    },
    [currentChannel],
  );

  const togglePlay = useCallback(() => {
    if (!audioPath) {
      handleOpenMusic();
      return;
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setPlaying(false);
        localStorage.setItem(
          `pos-${audioPath}`,
          audioRef.current.currentTime.toString(),
        );
        persistPlaybackState({
          currentTime: audioRef.current.currentTime,
          wasPlaying: false,
        });
      } else {
        audioRef.current
          .play()
          .then(() => setPlaying(true))
          .catch((e) => {
            console.error("Audio playback error:", e);
            console.error("Audio src:", audioRef.current?.src);
            console.error("Audio path:", audioPath);
          });
      }
    }
  }, [isPlaying, audioPath, handleOpenMusic, persistPlaybackState, setPlaying]);

  // Audio loading state management
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadStart = () => {
      console.log("📥 Loading audio...");
      setIsLoadingAudio(true);
    };

    const handleLoadedMetadata = () => {
      console.log("📊 Metadata loaded, duration:", audio.duration);
      setDuration(audio.duration);
    };

    const handleCanPlay = () => {
      console.log("✅ Audio ready to play");
      setIsLoadingAudio(false);
    };

    const handleWaiting = () => {
      console.log("⏳ Buffering...");
      setIsLoadingAudio(true);
    };

    const handlePlaying = () => {
      console.log("▶️ Audio is playing");
      setIsLoadingAudio(false);
    };

    const handleStalled = () => {
      console.log("⚠️ Network stalled");
      // Don't change loading state, might recover
    };

    const handleError = (e: Event) => {
      console.error("❌ Audio error:", e);
      setIsLoadingAudio(false);
      setPlaying(false);
    };

    // Sync play/pause state with actual audio events
    const handlePlay = () => {
      console.log("🎵 Audio play event fired");
      setPlaying(true);
    };

    const handlePause = () => {
      console.log("⏸️ Audio pause event fired");
      setPlaying(false);
    };

    const handleEnded = () => {
      console.log("🏁 Audio ended");
      setPlaying(false);
      // Handle loop if enabled
      if (settings.loop && audio) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.error("Loop play failed:", e));
      }
    };

    // Add all event listeners
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioPath, setPlaying, setDuration, settings.loop]);

  // Main Sync Engine
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let intervalID: NodeJS.Timeout;
    const sync = () => {
      const rawTime = audio.currentTime;
      const time = rawTime + settings.lyricOffset;
      if (Math.abs(rawTime - usePlayerStore.getState().currentTime) > 0.05)
        setCurrentTime(rawTime);
      const currentLyrics = usePlayerStore.getState().lyrics;
      const index = findActiveLyricIndex(time);
      if (
        sentenceLoopEnabled &&
        sentenceLoopTargetIndex !== null &&
        sentenceLoopTargetIndex >= 0 &&
        sentenceLoopTargetIndex < currentLyrics.length
      ) {
        const targetLine = currentLyrics[sentenceLoopTargetIndex];
        const targetEndTime = getLyricEndTime(
          sentenceLoopTargetIndex,
          currentLyrics,
        );
        if (
          targetEndTime !== null &&
          time >= targetEndTime &&
          sentenceLoopCompleted < sentenceRepeatCount
        ) {
          const targetTime = Math.max(0, targetLine.time - settings.lyricOffset);
          audio.currentTime = targetTime;
          setCurrentTime(targetTime);
          setSentenceLoopCompleted((count) => count + 1);
          return;
        }
        if (
          targetEndTime !== null &&
          time >= targetEndTime &&
          sentenceLoopCompleted >= sentenceRepeatCount
        ) {
          resetSentenceLoop();
        }
      }
      if (index !== usePlayerStore.getState().activeIndex) {
        setActiveIndex(index);
        if (index !== -1) {
          setTimeout(() => scrollToActive(), 0);
        }
      }
      if (index !== -1 && settings.showDesktopLyric) {
        const l = currentLyrics[index];
        const dur =
          l.endTime !== undefined
            ? l.endTime - l.time
            : index < currentLyrics.length - 1
              ? currentLyrics[index + 1].time - l.time
              : 2;
        const progress = Math.min(
          1.0,
          Math.max(0, (time - l.time) / (dur || 1)),
        );
        if (
          index !== lastIpcUpdateRef.current.index ||
          Math.abs(progress - lastIpcUpdateRef.current.progress) > 0.01
        ) {
          window.ipcRenderer?.send("update-lyric", {
            text: currentLyrics[index].text,
            translation: settings.showTranslation
              ? currentLyrics[index].translation
              : undefined,
            progress,
          });
          lastIpcUpdateRef.current = { index, progress };
        }
      }
    };
    if (isPlaying) intervalID = setInterval(sync, 16);
    return () => clearInterval(intervalID);
  }, [
    findActiveLyricIndex,
    isPlaying,
    sentenceLoopCompleted,
    sentenceLoopEnabled,
    sentenceLoopTargetIndex,
    sentenceRepeatCount,
    settings.showDesktopLyric,
    settings.lyricOffset,
    getLyricEndTime,
    resetSentenceLoop,
    scrollToActive,
    setCurrentTime,
    setActiveIndex,
  ]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        toggleSentenceLoop();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        resetSentenceLoop();
        if (audioRef.current) audioRef.current.currentTime += 5;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        resetSentenceLoop();
        if (audioRef.current) audioRef.current.currentTime -= 5;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resetSentenceLoop, togglePlay, toggleSentenceLoop]);

  // Settings Sync (IPC)
  useEffect(() => {
    const { updateSettings, ...data } = settings;
    window.ipcRenderer?.send("update-settings", data);
    window.ipcRenderer?.send("toggle-lyric-window", data.showDesktopLyric);
  }, [settings]);

  // Handle Audio Output Device Change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const applySinkId = async () => {
      try {
        // @ts-ignore - setSinkId might not be in the standard type definition yet
        if (typeof audio.setSinkId === "function") {
          const deviceId =
            settings.audioDeviceId === "default" ? "" : settings.audioDeviceId;

          // Only apply if it's different from the current sinkId
          // @ts-ignore
          if (audio.sinkId !== deviceId) {
            console.log(
              "🔌 Switching audio output device to:",
              deviceId || "default",
            );
            // @ts-ignore
            await audio.setSinkId(deviceId);
          }
        } else {
          console.warn(
            "⚠️ Your browser does not support setSinkId() to switch audio output devices.",
          );
        }
      } catch (err) {
        console.error("❌ Failed to set audio output device:", err);
      }
    };

    applySinkId();
  }, [settings.audioDeviceId, audioPath]); // Re-apply when device ID or audio source changes

  // Handle Playback Rate Change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.playbackRate !== playbackRate) {
      console.log("⏩ Setting playback rate to:", playbackRate);
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate, audioPath]);

  // 初始化歌词窗口的点击穿透状态
  useEffect(() => {
    if (settings.showDesktopLyric && window.ipcRenderer) {
      // 默认锁定状态（点击穿透）
      window.ipcRenderer.invoke(
        "set-lyric-ignore-mouse-events",
        isLyricLocked,
        {
          forward: true,
        },
      );
    }
  }, [settings.showDesktopLyric, isLyricLocked]);

  useEffect(() => {
    if (!audioPath) return;
    persistPlaybackState();
  }, [audioPath, currentChannel, musicInfo, persistPlaybackState]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioPath) return;

    const persistProgress = () => {
      const now = Date.now();
      if (now - lastProgressPersistRef.current < 1500) return;
      lastProgressPersistRef.current = now;
      persistPlaybackState({
        currentTime: audio.currentTime,
        wasPlaying: !audio.paused,
      });
    };

    const persistImmediately = () => {
      lastProgressPersistRef.current = Date.now();
      persistPlaybackState({
        currentTime: audio.currentTime,
        wasPlaying: !audio.paused,
      });
    };

    audio.addEventListener("timeupdate", persistProgress);
    audio.addEventListener("seeked", persistImmediately);
    audio.addEventListener("pause", persistImmediately);

    return () => {
      audio.removeEventListener("timeupdate", persistProgress);
      audio.removeEventListener("seeked", persistImmediately);
      audio.removeEventListener("pause", persistImmediately);
    };
  }, [audioPath, persistPlaybackState]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      persistPlaybackState({
        currentTime: audioRef.current?.currentTime,
        wasPlaying: !!audioRef.current && !audioRef.current.paused,
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      handleBeforeUnload();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [persistPlaybackState]);

  // Restore
  useEffect(() => {
    const restore = async () => {
      if (!window.ipcRenderer) return;

      const restoreTrack = async (playback: PersistedPlaybackState) => {
        const isLocal = playback.audioPath.startsWith("local-file://media");
        if (isLocal) {
          const filePath = decodeURIComponent(
            playback.audioPath.replace("local-file://media", ""),
          );
          const exists = await window.ipcRenderer.invoke(
            "check-file-exists",
            filePath,
          );
          if (!exists) return;

          const savedLyric = localStorage.getItem(`lyric-${playback.audioPath}`);
          if (
            savedLyric &&
            (await window.ipcRenderer.invoke("check-file-exists", savedLyric))
          ) {
            const content = await window.ipcRenderer.invoke(
              "read-file-content",
              savedLyric,
            );
            if (content) {
              setLyrics(
                savedLyric.toLowerCase().endsWith(".srt")
                  ? parseSrt(content)
                  : parseLrc(content),
              );
            }
          } else {
            const match = await window.ipcRenderer.invoke(
              "find-matching-lyric",
              filePath,
            );
            if (match) {
              setLyrics(
                match.path.toLowerCase().endsWith(".srt")
                  ? parseSrt(match.content)
                  : parseLrc(match.content),
              );
            }
          }
        } else if (playback.musicInfo?.srtContent) {
          setLyrics(parseSrt(playback.musicInfo.srtContent));
        } else {
          setLyrics([]);
        }

        resetSentenceLoop();
        setViewMode("player");
        setCurrentChannel(playback.currentChannel || null);
        setAudio(playback.audioPath, playback.musicInfo);
        const savedPosition = localStorage.getItem(`pos-${playback.audioPath}`);
        pendingRestoreRef.current = {
          currentTime: Math.max(
            0,
            playback.currentTime ||
              (savedPosition ? Number.parseFloat(savedPosition) : 0) ||
              0,
          ),
          shouldPlay: playback.wasPlaying,
        };
      };

      const savedPlayback = localStorage.getItem(LAST_PLAYBACK_STATE_KEY);
      if (savedPlayback) {
        try {
          await restoreTrack(JSON.parse(savedPlayback));
          return;
        } catch (error) {
          console.error("Failed to restore last playback state:", error);
        }
      }

      const savedLegacy = localStorage.getItem("last-played-music");
      if (savedLegacy) {
        try {
          const { path, name, artist } = JSON.parse(savedLegacy);
          const full = `local-file://media${path}`;
          const lp = localStorage.getItem(`pos-${full}`);
          await restoreTrack({
            version: 1,
            audioPath: full,
            musicInfo: { name, artist },
            currentChannel: null,
            currentTime: lp ? parseFloat(lp) : 0,
            wasPlaying: false,
          });
        } catch (error) {
          console.error("Failed to restore legacy playback state:", error);
        }
      }
    };
    restore();
  }, [resetSentenceLoop, setAudio, setCurrentChannel, setCurrentTime, setLyrics]);

  useEffect(() => {
    const audio = audioRef.current;
    const pendingRestore = pendingRestoreRef.current;
    if (!audio || !audioPath || !pendingRestore) return;

    const applyRestore = () => {
      audio.currentTime = pendingRestore.currentTime;
      setCurrentTime(pendingRestore.currentTime);
      if (pendingRestore.shouldPlay) {
        audio
          .play()
          .then(() => setPlaying(true))
          .catch((error) =>
            console.error("Failed to resume last playback:", error),
          );
      }
      pendingRestoreRef.current = null;
    };

    if (audio.readyState >= 1) {
      applyRestore();
      return;
    }

    const handleLoadedMetadata = () => applyRestore();
    audio.addEventListener("loadedmetadata", handleLoadedMetadata, {
      once: true,
    });
    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [audioPath, setCurrentTime, setPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const upd = () => setDuration(audio.duration);
    audio.addEventListener("loadedmetadata", upd);
    return () => audio.removeEventListener("loadedmetadata", upd);
  }, [audioPath, setDuration]);

  // 循环播放逻辑
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (settings.loop) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.error("Loop play error:", e));
      }
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [audioPath, settings.loop]);

  // 监听音频设备变化（如蓝牙断开）
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }

    let lastDeviceCount = 0;
    let deviceCheckTimeout: NodeJS.Timeout | null = null;

    // 检查设备是否可用
    const checkDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(
          (device) => device.kind === "audiooutput",
        );
        const currentDeviceCount = audioOutputs.length;

        // 如果设备数量减少，可能是设备断开
        if (lastDeviceCount > 0 && currentDeviceCount < lastDeviceCount) {
          console.log("Audio device disconnected, pausing playback");
          if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            setPlaying(false);
          }
        }

        lastDeviceCount = currentDeviceCount;
      } catch (e) {
        console.error("Error checking audio devices:", e);
      }
    };

    // 初始化设备列表
    checkDevices();

    // 监听设备变化事件
    const handleDeviceChange = () => {
      // 延迟检查，避免频繁触发
      if (deviceCheckTimeout) {
        clearTimeout(deviceCheckTimeout);
      }
      deviceCheckTimeout = setTimeout(checkDevices, 500);
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    // 监听音频播放错误（设备断开可能导致播放失败）
    const audio = audioRef.current;
    const handleAudioError = () => {
      console.log("Audio playback error, may be due to device disconnection");
      if (isPlaying) {
        setPlaying(false);
      }
    };

    if (audio) {
      audio.addEventListener("error", handleAudioError);
      // Note: Removed 'suspend' event listener as it incorrectly interferes with playback state.
      // The 'suspend' event fires when the browser pauses data loading (e.g., buffering),
      // which doesn't mean playback has stopped. Use 'play' and 'pause' events instead.
    }

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
      if (deviceCheckTimeout) {
        clearTimeout(deviceCheckTimeout);
      }
      if (audio) {
        audio.removeEventListener("error", handleAudioError);
      }
    };
  }, [isPlaying, setPlaying, audioPath]);

  // Fetch channels on mount
  useEffect(() => {
    const fetchChannels = async () => {
      console.log(`📡 Fetching channels from: ${settings.apiUrl}/api/channels`);
      setLoadingChannels(true);
      try {
        // Try to fetch from local Go backend first
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`${settings.apiUrl}/api/channels`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          setChannels(data);
        } else {
          throw new Error("Backend failed");
        }
      } catch (e) {
        console.warn("Failed to fetch from backend, using fallback");
        // Fallback to hardcoded list if backend is down
        setChannels([
          {
            id: "the-daily",
            name: "The Daily",
            author: "The New York Times",
            rss: "https://feeds.simplecast.com/54nAGcIl",
            description: "This is how the news should sound.",
          },
          {
            id: "techmeme-ride-home",
            name: "Techmeme Ride Home",
            author: "Techmeme",
            rss: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/A97C9631-B244-469D-BE92-AED10141680D/48F097BA-0869-4820-AB49-AED101416820/podcast.rss",
            description: "The day's tech news, every day at 5pm ET.",
          },
          {
            id: "gcores",
            name: "机核 GCORES",
            author: "GCORES",
            rss: "https://feed.xyz/gcores",
            description: "Share the core culture of games.",
          },
        ]);
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchChannels();
  }, [settings.apiUrl]);

  // 定期检查转录状态
  useEffect(() => {
    const currentGuid = musicInfo.guid;

    // 等字幕，或者字幕已就绪但译文还在路上时都要继续轮询。
    // 旧写法只要有 srtContent 就直接返回，导致最常见的情况
    // （字幕早就有了、翻译还在跑）永远观察不到 translation_status 变化。
    const waitingForSrt = !musicInfo.srtContent;
    const waitingForTranslation =
      !!musicInfo.srtContent &&
      !musicInfo.translation &&
      musicInfo.translationStatus !== "failed";

    if (!currentGuid || !currentChannel || (!waitingForSrt && !waitingForTranslation)) {
      return;
    }

    console.log(
      waitingForSrt
        ? "🔄 Waiting for transcription:"
        : "🔄 Waiting for translation:",
      musicInfo.name,
    );

    const checkInterval = setInterval(async () => {
      try {
        const response = await axios.get(
          `${settings.apiUrl}/api/channels/${currentChannel.id}/episodes`,
        );

        const updatedEpisode = response.data.episodes.find(
          (ep: any) => ep.guid === currentGuid,
        );

        if (updatedEpisode) {
          // 如果状态发生了变化，更新列表
          setPodcastEpisodes((prev) =>
            prev.map((ep) =>
              ep.guid === updatedEpisode.guid ? updatedEpisode : ep,
            ),
          );

          const srtArrived = updatedEpisode.srt_content && !musicInfo.srtContent;
          const translationArrived =
            updatedEpisode.translation && !musicInfo.translation;

          if (srtArrived || translationArrived) {
            console.log(
              srtArrived
                ? "✅ Transcription completed! Loading subtitles..."
                : "✅ Translation completed! Loading bilingual lyrics...",
            );

            const srt = updatedEpisode.srt_content || musicInfo.srtContent || "";
            const merged = mergeTranslation(
              parseSrt(srt),
              updatedEpisode.translation || "",
            );

            // 译文到达时不要重置整句复听：用户可能正在复听某一句
            if (srtArrived) resetSentenceLoop();
            setLyrics(merged.lines);

            // 这里不能用 setAudio —— 它会把 currentTime 归零、isPlaying 置 false，
            // 而译文往往在用户听到一半时才到达。只补丁 musicInfo。
            usePlayerStore.setState((state) => ({
              musicInfo: {
                ...state.musicInfo,
                srtContent: srt,
                translation: updatedEpisode.translation,
                translationLang: updatedEpisode.translation_lang,
                translationStatus: updatedEpisode.translation_status,
              },
            }));
          } else if (
            updatedEpisode.translation_status !== musicInfo.translationStatus
          ) {
            usePlayerStore.setState((state) => ({
              musicInfo: {
                ...state.musicInfo,
                translationStatus: updatedEpisode.translation_status,
              },
            }));
          }
        }
      } catch (error) {
        console.error("Failed to check transcription status:", error);
      }
    }, 15000); // 每 15 秒检查一次

    return () => {
      console.log("🛑 Stopping transcription status checker");
      clearInterval(checkInterval);
    };
  }, [
    musicInfo.guid,
    musicInfo.srtContent,
    currentChannel,
    settings.apiUrl,
    audioPath,
    musicInfo,
    resetSentenceLoop,
    setAudio,
    setLyrics,
  ]);

  const performTranscription = async (path: string, guid?: string) => {
    if (isTranscribing) return false;
    setTranscribing(true);
    try {
      const res: any = await window.ipcRenderer?.invoke(
        "transcribe-audio",
        path,
        guid,
      );
      if (res.success && res.srtContent) {
        const parsed = parseSrt(res.srtContent);
        resetSentenceLoop();
        setLyrics(parsed);

        // Update local state
        if (guid) {
          setPodcastEpisodes((prev) =>
            prev.map((ep) =>
              ep.guid === guid ? { ...ep, srt_content: res.srtContent } : ep,
            ),
          );
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("Transcription error:", e);
      return false;
    } finally {
      setTranscribing(false);
    }
  };

  const handleAiTranscribe = async () => {
    if (!audioPath) {
      alert("请先打开一个音频文件");
      return;
    }

    const currentEp = podcastEpisodes.find((ep) => (ep.audio_url || ep.audioUrl) === audioPath);
    let targetPath = audioPath.replace("local-file://media", "");

    if (!audioPath.startsWith("local-file://") && currentEp) {
      if (currentEp.local_audio_path) {
        targetPath = currentEp.local_audio_path;
      } else {
        alert("请先下载该播客到本地再进行转录");
        return;
      }
    }

    const success = await performTranscription(targetPath, currentEp?.guid);
    if (success) {
      alert("🎉 转录成功！");
    } else {
      alert("转录失败，请检查后端日志");
    }
  };

  const handleFetchChannel = async (channel: any) => {
    // 1. Abort previous request if exists
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }

    // 2. Create new controller
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoadingPodcast(true);
    setCurrentChannel(channel);

    try {
      // Call backend to get episodes
      const res = await fetch(
        `${settings.apiUrl}/api/channels/${channel.id}/episodes`,
        {
          signal: controller.signal,
        },
      );

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPodcastEpisodes(data.episodes || []);
          setViewMode("episodes");
        } else {
          alert("获取失败");
        }
      } else {
        throw new Error("Backend error");
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        console.log("Request aborted");
        return; // Ignore abort errors
      }
      console.error(e);
      alert(`无法从 ${settings.apiUrl} 获取播客列表，请检查网络或后端服务状态`);
    } finally {
      // Only turn off loading if this is the current active request
      if (fetchControllerRef.current === controller) {
        setLoadingPodcast(false);
        fetchControllerRef.current = null;
      }
    }
  };

  const handleSummarize = async () => {
    console.log("🔍 Summarize check:", {
      isSummarizing,
      musicInfoGuid: musicInfo.guid,
    });

    if (isSummarizing) {
      console.log("⚠️ Summary already in progress...");
      return;
    }

    if (!musicInfo.guid) {
      console.error(
        "❌ Cannot summarize: Current track has no GUID!",
        musicInfo,
      );
      alert(
        "错误：当前曲目缺少 ID 信息，无法生成 AI 摘要。请尝试重新点击列表中的节目播放。",
      );
      return;
    }

    // Get srt content from current lyrics if not in episode metadata
    const srtContent =
      musicInfo.srtContent || lyrics.map((l) => l.text).join("\n"); // Fallback if no srt

    if (!srtContent) {
      alert("请先生成或加载歌词");
      return;
    }

    setSummarizing(true);
    console.log("🤖 Starting AI Summary request...", {
      guid: musicInfo.guid,
      model: settings.llmModel,
      apiBase: settings.llmApiBase,
    });

    try {
      const res = await fetch(`${settings.apiUrl}/api/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guid: musicInfo.guid,
          srtContent: srtContent,
          apiKey: settings.llmApiKey,
          apiBase: settings.llmApiBase,
          model: settings.llmModel,
        }),
      });

      console.log("📡 API Response received, status:", res.status);
      const data = await res.json();
      console.log("📦 API Data decoded:", data);

      if (data.success) {
        console.log("✨ Summary generated successfully!");
        // Update current music info with summary
        usePlayerStore.setState((state) => ({
          musicInfo: { ...state.musicInfo, summary: data.summary },
        }));

        // Also update in episodes list
        setPodcastEpisodes((prev) =>
          prev.map((ep) =>
            ep.guid === musicInfo.guid ? { ...ep, summary: data.summary } : ep,
          ),
        );
      } else {
        alert(data.message || "生成摘要失败");
      }
    } catch (e) {
      console.error("Summary error:", e);
      alert("生成摘要请求失败");
    } finally {
      setSummarizing(false);
    }
  };

  const handleDownload = async (episode: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${settings.apiUrl}/api/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guid: episode.guid, url: episode.audio_url || episode.audioUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.status === "exists" ? "已存在缓存" : "缓存成功");

        // Update local state with returned episode data
        if (data.episode) {
          setPodcastEpisodes((prev) =>
            prev.map((ep) => (ep.guid === episode.guid ? data.episode : ep)),
          );
        }
      }
    } catch (err) {
      console.error(err);
      alert("缓存失败");
    }
  };

  const handleRequestTranscription = async (episode: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await axios.post(`${settings.apiUrl}/api/queue-transcription`, {
        guid: episode.guid,
        audioUrl: episode.audio_url || episode.audioUrl,
        title: episode.title,
      });
      if (res.data.success) {
        alert("已加入转录队列 🪄");
        // 更新本地状态，显示“排队中”
        setPodcastEpisodes((prev) =>
          prev.map((ep) =>
            ep.guid === episode.guid
              ? { ...ep, transcription_status: "pending" }
              : ep,
          ),
        );
      }
    } catch (err) {
      console.error(err);
      alert("加入队列失败");
    }
  };

  const handlePlayPodcast = (episode: any) => {
    const audioUrl = episode.audio_url || episode.audioUrl;
    const playUrl = episode.local_audio_path
      ? `${settings.apiUrl}/media/${episode.local_audio_path.split("/").pop()}`
      : audioUrl;

    console.log("Playing podcast:", {
      title: episode.title,
      hasLocalPath: !!episode.local_audio_path,
      localPath: episode.local_audio_path,
      playUrl,
      hasSrtContent: !!episode.srt_content,
    });

    if (playUrl) {
      resetSentenceLoop();
      setViewMode("player");
      setAudio(playUrl, {
        name: episode.title || currentChannel?.name || "Podcast",
        artist: currentChannel?.author || "Podcast",
        cover: episode.image_url || currentChannel?.image_url,
        guid: episode.guid,
        summary: episode.summary,
        srtContent: episode.srt_content,
        translation: episode.translation,
        translationLang: episode.translation_lang,
        translationStatus: episode.translation_status,
      });

      // Load lyrics if available in episode data
      if (episode.srt_content) {
        console.log("Loading SRT lyrics from episode data");
        const merged = mergeTranslation(
          parseSrt(episode.srt_content),
          episode.translation || "",
        );
        console.log(
          `Lyrics: ${merged.total} lines, ${merged.matched} translated (${merged.strategy})`,
        );
        setLyrics(merged.lines);

        // 存量节目在转录时还没有翻译功能，播放时按需补翻（后台异步）。
        // 服务端对同一集有并发保护，重复点播放不会重复消耗 token。
        const needsTranslation =
          !episode.translation && episode.translation_status !== "pending";
        if (episode.guid && needsTranslation) {
          console.log("🌐 Requesting translation:", episode.title);
          axios
            .post(`${settings.apiUrl}/api/translate`, { guid: episode.guid })
            .then(() => {
              console.log("✅ Translation queued");
              setPodcastEpisodes((prev) =>
                prev.map((ep) =>
                  ep.guid === episode.guid
                    ? { ...ep, translation_status: "pending" }
                    : ep,
                ),
              );
            })
            .catch((error: unknown) => {
              console.error("❌ Failed to queue translation:", error);
            });
        }
      } else {
        setLyrics([]);

        // 自动加入转录队列（后台异步处理）
        const audioUrl = episode.audio_url || episode.audioUrl;
        if (audioUrl) {
          console.log("🎙️ Adding to transcription queue:", episode.title);
          axios
            .post(`${settings.apiUrl}/api/queue-transcription`, {
              guid: episode.guid,
              audioUrl: audioUrl,
              title: episode.title,
            })
            .then(() => {
              console.log("✅ Added to transcription queue");
            })
            .catch((error: unknown) => {
              console.error("❌ Failed to queue transcription:", error);
            });
        }
      }

      // Auto-play after setting audio
      setTimeout(() => {
        if (audioRef.current) {
          console.log("🚀 Attempting auto-play...");
          audioRef.current
            .play()
            .then(() => console.log("✅ Auto-play succeeded"))
            .catch((e) => console.error("❌ Auto-play failed:", e));
        }
      }, 100);
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    resetSentenceLoop();

    // Remember if audio was playing before seeking
    const wasPlaying = !audioRef.current.paused;

    const updateProgress = (clientX: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      const newTime = percent * duration;
      audioRef.current!.currentTime = newTime;
      setCurrentTime(newTime);
    };

    // Initial seek on mouse down
    updateProgress(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateProgress(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Resume playing if it was playing before
      if (wasPlaying && audioRef.current) {
        audioRef.current
          .play()
          .catch((e) => console.error("Resume play error:", e));
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const currentProgress = useMemo(() => {
    if (activeIndex === -1 || !lyrics[activeIndex]) return 0;
    const l = lyrics[activeIndex];
    const dur =
      l.endTime !== undefined
        ? l.endTime - l.time
        : activeIndex < lyrics.length - 1
          ? lyrics[activeIndex + 1].time - l.time
          : 2;
    const adjustedTime = currentTime + settings.lyricOffset;
    return Math.min(
      1.0,
      Math.max(0, (adjustedTime - l.time) / (dur || 1)),
    );
  }, [activeIndex, currentTime, lyrics, settings.lyricOffset]);

  return (
    <div
      className="player-container"
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        overflow: "hidden",
        height: "100vh",
        boxSizing: "border-box",
      }}>

      <div className="sidebar-rail">
        <div className="sidebar-primary-actions">
          <button
            className={`tool-btn ${viewMode === "player" ? "active" : ""}`}
            onClick={() => setViewMode("player")}
            title="播放器">
            <MusicNoteIcon className="icon" size={20} />
          </button>
          <button
            className={`tool-btn ${
              viewMode === "channels" || viewMode === "episodes" ? "active" : ""
            }`}
            onClick={() => setViewMode("channels")}
            title="频道与节目">
            <RadioIcon className="icon" />
          </button>
          <button
            className={`tool-btn ${settings.showDesktopLyric ? "active" : ""}`}
            onClick={() => {
              settings.updateSettings({
                showDesktopLyric: !settings.showDesktopLyric,
              });
            }}
            title={settings.showDesktopLyric ? "隐藏桌面歌词" : "显示桌面歌词"}>
            <SubtitlesIcon className="icon" />
          </button>
        </div>

        <div className="sidebar-secondary-actions">
          <button
            className={`tool-btn tool-btn-secondary ${
              viewMode === "settings" ? "active" : ""
            }`}
            onClick={() => setViewMode("settings")}
            title="设置">
            <SettingsIcon className="icon" />
          </button>
        </div>
      </div>

      <div
        className={`content-shell ${
          viewMode === "player" ? "content-shell-player" : "content-shell-browser"
        }`}>
        {viewMode === "player" ? (
          <div className="player-stage">
            <PlayerPanel
              settings={settings}
              hasAudio={!!audioPath}
              musicInfo={musicInfo}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              isLoading={isLoadingAudio}
              isTranscribing={isTranscribing}
              isSummarizing={isSummarizing}
              onSummarize={handleSummarize}
              playbackRate={playbackRate}
              setPlaybackRate={setPlaybackRate}
              playerSubpage={playerSubpage}
              setPlayerSubpage={setPlayerSubpage}
              togglePlay={togglePlay}
              lyrics={lyrics}
              activeIndex={activeIndex}
              lyricListRef={lyricListRef}
              currentProgress={currentProgress}
              sentenceLoopEnabled={sentenceLoopEnabled}
              sentenceRepeatCount={sentenceRepeatCount}
              sentenceLoopCompleted={sentenceLoopCompleted}
              canUseSentenceLoop={activeIndex !== -1 && !!lyrics[activeIndex]}
              onToggleSentenceLoop={toggleSentenceLoop}
              onSentenceRepeatCountChange={handleSentenceRepeatCountChange}
              showDesktopLyric={settings.showDesktopLyric}
              isLyricLocked={isLyricLocked}
              onToggleLyricLock={() => {
                const newLockState = !isLyricLocked;
                setIsLyricLocked(newLockState);
                (window as any).ipcRenderer?.invoke(
                  "set-lyric-ignore-mouse-events",
                  newLockState,
                  { forward: true },
                );
              }}
              handleOpenMusic={handleOpenMusic}
              handleSeek={handleProgressMouseDown}
            />
          </div>
        ) : viewMode === "settings" ? (
          <div className="browser-stage">
            <SettingsDialog
              embedded
              onClose={() => setViewMode("player")}
              settings={settings}
              isTranscribing={isTranscribing}
              onAiTranscribe={handleAiTranscribe}
              onResetLyricWindow={() =>
                (window as any).ipcRenderer?.invoke("reset-lyric-window")
              }
            />
          </div>
        ) : viewMode === "channels" ? (
          <div className="browser-stage">
            <ChannelsPanel
              loadingChannels={loadingChannels}
              channels={channels}
              currentChannel={currentChannel}
              loadingPodcast={loadingPodcast}
              onFetchChannel={handleFetchChannel}
              onClose={() => setViewMode("player")}
            />
          </div>
        ) : (
          <div className="browser-stage">
            <EpisodesPanel
              currentChannel={currentChannel}
              episodes={podcastEpisodes}
              onBack={() => setViewMode("channels")}
              onPlayEpisode={handlePlayPodcast}
              onDownloadEpisode={handleDownload}
              onRequestTranscription={handleRequestTranscription}
            />
          </div>
        )}
      </div>

      {audioPath && <audio ref={audioRef} src={audioPath} key={audioPath} />}
    </div>
  );
}

export default App;
