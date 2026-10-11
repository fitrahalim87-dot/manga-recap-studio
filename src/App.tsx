import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Film,
  Upload,
  FileText,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Trash2,
  MoveLeft,
  MoveRight,
  Download,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Maximize2,
  Layers,
  ChevronRight,
  Shuffle,
  FileVideo,
  HardDrive,
  Zap
} from 'lucide-react';
import { MotionType, PanelItem, ScenePlan, VideoConfig } from './types';
import {
  resolveMotion,
  PAN_MOTIONS,
  calcWindowBox,
  formatTime
} from './utils/motion';
import {
  SAMPLE_SCRIPT,
  generateSamplePanels,
  createSyntheticNarrationAudio
} from './utils/sampleData';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'img' | 'txt' | 'sync' | 'out'>('img');

  // Panels & Images
  const [panels, setPanels] = useState<PanelItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Script Narration
  const [scriptText, setScriptText] = useState<string>('');

  // Audio
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);

  // Sync state
  const [durations, setDurations] = useState<number[]>([]);
  const [starts, setStarts] = useState<number[]>([]);
  const [confidences, setConfidences] = useState<number[]>([]);
  const [isManualSyncOpen, setIsManualSyncOpen] = useState<boolean>(false);
  const [tapSyncState, setTapSyncState] = useState<'idle' | 'playing' | 'paused' | 'done'>('idle');
  const [tapIndex, setTapIndex] = useState<number>(0);
  const [tapLag, setTapLag] = useState<number>(0.2);
  const [manualStarts, setManualStarts] = useState<number[]>([]);

  // Auto-sync status
  const [isAutoSyncing, setIsAutoSyncing] = useState<boolean>(false);
  const [autoSyncProgress, setAutoSyncProgress] = useState<number>(0);
  const [syncLang, setSyncLang] = useState<string>('id');
  const [syncModel, setSyncModel] = useState<string>('small');
  const [serverHealth, setServerHealth] = useState<string>('Memeriksa koneksi server...');

  // Video render config (30 FPS for silky-smooth export)
  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    width: 1280,
    height: 720,
    fps: 30,
    transitionSec: 0.4,
    aspectRatio: '16:9',
    defaultMotion: 'random'
  });
  const [scenePlans, setScenePlans] = useState<ScenePlan[]>([]);

  // Preview & Export state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewProgress, setPreviewProgress] = useState<number>(0); // 0 to total duration
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string>('');
  const [showSubtitlesOnVideo, setShowSubtitlesOnVideo] = useState<boolean>(false);

  // MP4 Auto-Compression states
  const [isCompressingMp4, setIsCompressingMp4] = useState<boolean>(false);
  const [compressStatusText, setCompressStatusText] = useState<string>('');
  const [videoFormat, setVideoFormat] = useState<'mp4' | 'webm'>('mp4');
  const [videoFileSize, setVideoFileSize] = useState<number | null>(null);
  const [originalFileSize, setOriginalFileSize] = useState<number | null>(null);
  const [autoCompressMp4, setAutoCompressMp4] = useState<boolean>(true);
  const [compressionQuality, setCompressionQuality] = useState<'high' | 'standard' | 'compact'>('standard');
  const lastRecordedBlobRef = useRef<Blob | null>(null);

  // Deterministic smooth motions per panel (no shaky-action)
  const getResolvedMotionForPanel = useCallback((idx: number, motion: MotionType): MotionType => {
    if (motion === 'random') {
      const flow: MotionType[] = [
        'zoom-in',
        'pan-top-to-bottom',
        'zoom-out',
        'pan-left-to-right',
        'pan-bottom-to-top',
        'pan-right-to-left'
      ];
      return flow[idx % flow.length];
    }
    return motion;
  }, []);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewAnimFrameRef = useRef<number | null>(null);
  const loadedImagesRef = useRef<Map<string, HTMLImageElement | HTMLCanvasElement>>(new Map());
  const previewAudioSnippetTimer = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Check backend server on mount
  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((j) => {
        setServerHealth(
          j.aiSyncAvailable
            ? 'Server AI Gemini Aktif (Auto-Sync Presisi)'
            : 'Server Aktif (Mode Heuristik & Tap-Sync)'
        );
      })
      .catch(() => {
        setServerHealth('Mode Mandiri (Client-Side Rendering)');
      });
  }, []);

  // Split script into paragraphs (1 paragraph = 1 panel)
  const paragraphs = useMemo(() => {
    return scriptText
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [scriptText]);

  // Sync plans when panels change
  useEffect(() => {
    setScenePlans((prev) => {
      return panels.map((_, i) => {
        if (prev[i]) return prev[i];
        return {
          motion: videoConfig.defaultMotion,
          speed: 1.0,
          easing: 'smooth',
          duration: durations[i] || 4.0,
          transition: videoConfig.transitionSec > 0 ? 'crossfade' : 'none'
        };
      });
    });
  }, [panels, videoConfig.defaultMotion, videoConfig.transitionSec, durations]);

  // Keep loaded images cache & pre-rasterize into Canvas for instantaneous, zero-lag drawing
  useEffect(() => {
    panels.forEach((p) => {
      if (!loadedImagesRef.current.has(p.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = p.url;
        img.onload = () => {
          try {
            const maxDim = 1920;
            const nw = img.naturalWidth || img.width || 900;
            const nh = img.naturalHeight || img.height || 1200;
            const scale = Math.min(1, maxDim / Math.max(nw, nh));
            const sw = Math.round(nw * scale);
            const sh = Math.round(nh * scale);
            const off = document.createElement('canvas');
            off.width = sw;
            off.height = sh;
            const octx = off.getContext('2d');
            if (octx) {
              octx.imageSmoothingEnabled = true;
              octx.imageSmoothingQuality = 'high';
              octx.drawImage(img, 0, 0, sw, sh);
              loadedImagesRef.current.set(p.id, off);
              return;
            }
          } catch (e) {
            console.warn('Pre-rasterize fallback:', e);
          }
          loadedImagesRef.current.set(p.id, img);
        };
      }
    });
  }, [panels]);

  // Add image files
  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const newItems: PanelItem[] = [];
    const sortedFiles = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (!sortedFiles.length) {
      showToast('Tidak ada file gambar valid.');
      return;
    }

    sortedFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      newItems.push({
        id: `panel-${Date.now()}-${idx}-${Math.random()}`,
        name: file.name,
        file,
        url
      });
    });

    setPanels((prev) => [...prev, ...newItems]);
    setDurations([]);
    setConfidences([]);
    showToast(`${newItems.length} gambar berhasil ditambahkan.`);
  };

  // Load sample demo
  const handleLoadDemo = () => {
    const demoPanels = generateSamplePanels();
    setPanels(demoPanels);
    setScriptText(SAMPLE_SCRIPT);

    // Create synthetic demo audio
    const { blob, url } = createSyntheticNarrationAudio(14.5);
    const demoAudioFile = new File([blob], 'demo_voiceover.wav', { type: 'audio/wav' });
    setAudioFile(demoAudioFile);
    setAudioUrl(url);

    // Default durations
    const defaultDurs = [3.8, 3.6, 3.6, 3.5];
    setDurations(defaultDurs);
    setConfidences([0.95, 0.92, 0.94, 0.98]);

    showToast('Contoh manga demo (4 panel + naskah + audio) berhasil dimuat!');
  };

  // Reorder panel
  const movePanel = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= panels.length || fromIdx === toIdx) return;
    const updated = [...panels];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setPanels(updated);
    setDurations([]);
  };

  const removePanel = (idx: number) => {
    const target = panels[idx];
    if (target.url.startsWith('blob:')) {
      URL.revokeObjectURL(target.url);
    }
    setPanels((prev) => prev.filter((_, i) => i !== idx));
    setDurations([]);
  };

  const clearAllPanels = () => {
    if (!panels.length) return;
    if (window.confirm('Hapus semua panel gambar?')) {
      panels.forEach((p) => {
        if (p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
      });
      setPanels([]);
      setDurations([]);
      showToast('Semua panel gambar telah dihapus.');
    }
  };

  // Audio selection
  const handleAudioSelect = (file: File | null) => {
    if (!file) return;
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl);
    }
    const url = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioUrl(url);
    setTapSyncState('idle');
    setTapIndex(0);
    setManualStarts([]);
    if (audioRef.current) {
      audioRef.current.playbackRate = 1.0;
    }
    showToast(`Audio "${file.name}" terpilih.`);
  };

  // Audio element listeners
  useEffect(() => {
    const aud = audioRef.current;
    if (!aud) return;

    const onLoadedMetadata = () => {
      setAudioDuration(aud.duration || 0);
    };

    const onTimeUpdate = () => {
      setAudioCurrentTime(aud.currentTime || 0);
    };

    const onEnded = () => {
      if (tapSyncState === 'playing') {
        finishManualTapSync(true);
      }
      setIsPreviewPlaying(false);
    };

    aud.addEventListener('loadedmetadata', onLoadedMetadata);
    aud.addEventListener('timeupdate', onTimeUpdate);
    aud.addEventListener('ended', onEnded);

    return () => {
      aud.removeEventListener('loadedmetadata', onLoadedMetadata);
      aud.removeEventListener('timeupdate', onTimeUpdate);
      aud.removeEventListener('ended', onEnded);
    };
  }, [tapSyncState]);

  // Even split duration
  const handleEvenDuration = () => {
    if (!panels.length) {
      showToast('Masukkan gambar panel terlebih dahulu!');
      return;
    }
    const total = audioDuration > 0 ? audioDuration : panels.length * 4.0;
    const each = Number((total / panels.length).toFixed(2));
    const newDurs = panels.map(() => each);
    setDurations(newDurs);
    setConfidences(panels.map(() => 0.9));
    showToast('Durasi dibagi rata sesuai panjang audio.');
  };

  // Manual Tap-Sync logic
  const handleTapSync = () => {
    const aud = audioRef.current;
    const n = panels.length;
    if (!aud) return;

    if (tapSyncState === 'idle') {
      if (!n) {
        showToast('Masukkan panel gambar dulu di Tab 1.');
        return;
      }
      if (!audioFile && !audioUrl) {
        showToast('Pilih file audio narasi dulu.');
        return;
      }
      aud.currentTime = 0;
      setManualStarts([0]);
      setTapIndex(0);
      setTapSyncState('playing');
      aud.play().catch(() => showToast('Gagal memutar audio'));
    } else if (tapSyncState === 'paused') {
      // Melanjutkan audio dari posisi panel saat ini
      aud.play().catch(() => showToast('Gagal memutar audio'));
      setTapSyncState('playing');
    } else if (tapSyncState === 'playing') {
      if (tapIndex < n - 1) {
        const cur = aud.currentTime;
        const corrected = Math.max(0, cur - tapLag);
        setManualStarts((prev) => [...prev, Number(corrected.toFixed(2))]);
        setTapIndex((prev) => prev + 1);
      } else {
        finishManualTapSync(false);
      }
    } else if (tapSyncState === 'done') {
      setTapSyncState('idle');
      setTapIndex(0);
      setManualStarts([]);
    }
  };

  const finishManualTapSync = (isAutoEnd: boolean) => {
    const aud = audioRef.current;
    if (aud) aud.pause();

    const n = panels.length;
    const total = audioDuration || (aud?.currentTime ?? n * 4);
    const startsArr = [...manualStarts];

    const calculatedDurs = panels.map((_, i) => {
      const s = startsArr[i] !== undefined ? startsArr[i] : total;
      const e = i + 1 < n && startsArr[i + 1] !== undefined ? startsArr[i + 1] : total;
      return Math.max(0.4, Number((e - s).toFixed(2)));
    });

    setDurations(calculatedDurs);
    setStarts(startsArr);
    setConfidences(panels.map(() => 0.95));
    setTapSyncState('done');

    if (isAutoEnd && startsArr.length < n) {
      showToast('Audio habis sebelum semua panel di-tap. Silakan cek tabel durasi.');
    } else {
      showToast('Tap sync selesai! Durasi siap dipakai.');
    }
  };

  const handleManualPauseToggle = () => {
    const aud = audioRef.current;
    if (!aud) return;
    if (tapSyncState === 'playing') {
      aud.pause();
      setTapSyncState('paused');
    } else if (tapSyncState === 'paused') {
      aud.play();
      setTapSyncState('playing');
    }
  };

  const handleManualUndo = () => {
    const aud = audioRef.current;
    // 1. Audio WAJIB berhenti seketika
    if (aud) {
      aud.pause();
    }

    if (tapIndex > 0) {
      // 2. Mundur 1 panel ke narasi sebelumnya
      const prevIdx = tapIndex - 1;
      setTapIndex(prevIdx);

      // 3. Potong start timestamp terakhir
      const updatedStarts = manualStarts.slice(0, prevIdx + 1);
      setManualStarts(updatedStarts);

      // 4. Kembalikan posisi audio ke awal narasi panel sebelumnya
      const targetTime = updatedStarts[prevIdx] !== undefined ? updatedStarts[prevIdx] : 0;
      if (aud) {
        aud.currentTime = targetTime;
        setAudioCurrentTime(targetTime);
      }

      setTapSyncState('paused');
      showToast(`Audio dijeda. Kembali ke Panel ${prevIdx + 1} (${formatTime(targetTime)}).`);
    } else if (tapIndex === 0) {
      // Jika di panel 1, reset ke titik awal detik 0:00
      if (aud) {
        aud.currentTime = 0;
        setAudioCurrentTime(0);
      }
      setManualStarts([0]);
      setTapIndex(0);
      setTapSyncState('paused');
      showToast('Kembali ke awal narasi (Panel 1, 0:00).');
    }
  };

  // Keyboard shortcut for Tap Sync (Spacebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'sync' || !isManualSyncOpen) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) handleTapSync();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, isManualSyncOpen, tapSyncState, tapIndex, panels.length]);

  // Audio snippet preview for a specific panel
  const handlePreviewPanelAudio = (panelIdx: number) => {
    const aud = audioRef.current;
    if (!aud || !durations.length) return;
    if (previewAudioSnippetTimer.current) {
      clearTimeout(previewAudioSnippetTimer.current);
    }

    let startOffset = 0;
    for (let k = 0; k < panelIdx; k++) {
      startOffset += durations[k] || 0;
    }
    const duration = durations[panelIdx] || 4.0;

    aud.currentTime = Math.min(startOffset, aud.duration || startOffset);
    aud.play().catch(() => {});

    previewAudioSnippetTimer.current = setTimeout(() => {
      aud.pause();
    }, Math.min(duration, 15) * 1000);
  };

  // Auto-Sync request
  const handleAutoSync = async () => {
    if (!panels.length) {
      showToast('Masukkan gambar panel terlebih dahulu.');
      return;
    }
    if (!paragraphs.length) {
      showToast('Masukkan naskah narasi di Tab 2.');
      return;
    }
    if (paragraphs.length !== panels.length) {
      showToast(`Peringatan: ${paragraphs.length} paragraf vs ${panels.length} panel.`);
    }

    setIsAutoSyncing(true);
    setAutoSyncProgress(0.2);

    try {
      let audioBase64: string | null = null;
      let mimeType = 'audio/mp3';

      if (audioFile) {
        mimeType = audioFile.type || 'audio/mp3';
        const buffer = await audioFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        audioBase64 = btoa(binary);
      }

      setAutoSyncProgress(0.6);

      const resp = await fetch('/api/autosync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paragraphs,
          audioDuration: audioDuration || panels.length * 4.0,
          audioBase64,
          mimeType,
          lang: syncLang,
          model: syncModel
        })
      });

      setAutoSyncProgress(0.9);

      if (!resp.ok) {
        throw new Error('Gagal menghubungi server autosync');
      }

      const data = await resp.json();
      if (data.durations && Array.isArray(data.durations)) {
        setDurations(data.durations);
        if (data.starts) setStarts(data.starts);
        if (data.confidence) setConfidences(data.confidence);
        showToast(
          data.source === 'gemini-ai'
            ? 'Auto-Sync selesai menggunakan Gemini AI!'
            : 'Auto-Sync selesai (Analisis Heuristik)!'
        );
      } else {
        throw new Error('Format respon tidak sesuai');
      }
    } catch (err: any) {
      console.warn('Auto-sync fallback to word-count distribution:', err);
      // Fallback
      const dur = audioDuration > 0 ? audioDuration : panels.length * 4.0;
      const totalWords = paragraphs.reduce((a, p) => a + p.split(/\s+/).filter(Boolean).length, 0);
      const computedDurs = panels.map((_, i) => {
        const text = paragraphs[i] || '';
        const words = text.split(/\s+/).filter(Boolean).length || 4;
        return Number(((words / Math.max(1, totalWords)) * dur).toFixed(2));
      });
      setDurations(computedDurs);
      setConfidences(panels.map(() => 0.8));
      showToast('Sinkronisasi estimasi kata diterapkan.');
    } finally {
      setIsAutoSyncing(false);
      setAutoSyncProgress(1.0);
    }
  };

  // Total calculated video duration
  const totalVideoDuration = useMemo(() => {
    if (!durations.length) return panels.length * 4.0;
    return Number(durations.reduce((a, b) => a + b, 0).toFixed(2));
  }, [durations, panels.length]);

  // Change Aspect Ratio
  const handleAspectRatioChange = (aspect: '16:9' | '9:16') => {
    if (aspect === '16:9') {
      setVideoConfig((prev) => ({ ...prev, aspectRatio: '16:9', width: 1280, height: 720 }));
    } else {
      setVideoConfig((prev) => ({ ...prev, aspectRatio: '9:16', width: 720, height: 1280 }));
    }
  };

  // Real-time Canvas Frame Drawer
  const renderCanvasFrameAtTime = useCallback(
    (targetTime: number, targetCanvas?: HTMLCanvasElement) => {
      const canvas = targetCanvas || previewCanvasRef.current;
      if (!canvas || !panels.length) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      // Find which panel corresponds to targetTime
      let accumulated = 0;
      let activeIdx = 0;
      let panelLocalTime = 0;

      for (let i = 0; i < panels.length; i++) {
        const pDur = durations[i] || scenePlans[i]?.duration || 4.0;
        if (targetTime >= accumulated && targetTime < accumulated + pDur) {
          activeIdx = i;
          panelLocalTime = targetTime - accumulated;
          break;
        }
        accumulated += pDur;
        if (i === panels.length - 1 && targetTime >= accumulated) {
          activeIdx = i;
          panelLocalTime = pDur;
        }
      }

      const currentPanel = panels[activeIdx];
      const currentPlan = scenePlans[activeIdx] || {
        motion: videoConfig.defaultMotion,
        speed: 1.0,
        easing: 'smooth',
        duration: 4.0,
        transition: 'crossfade'
      };

      const panelTotalDur = durations[activeIdx] || currentPlan.duration || 4.0;
      const normalizedP = Math.min(1.0, Math.max(0.0, panelLocalTime / Math.max(0.1, panelTotalDur)));

      // Motion resolution - deterministic per panel to prevent jitter
      const resolved = getResolvedMotionForPanel(activeIdx, currentPlan.motion);

      const img = loadedImagesRef.current.get(currentPanel.id);
      if (img) {
        const iw = (img as HTMLCanvasElement).width || (img as HTMLImageElement).naturalWidth || (img as any).width;
        const ih = (img as HTMLCanvasElement).height || (img as HTMLImageElement).naturalHeight || (img as any).height;
        const box = calcWindowBox(
          iw,
          ih,
          W,
          H,
          resolved,
          normalizedP,
          currentPlan.speed,
          currentPlan.easing
        );

        ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, 0, 0, W, H);

        // Check for crossfade transition with previous panel
        const transSec = videoConfig.transitionSec;
        if (
          currentPlan.transition !== 'none' &&
          transSec > 0 &&
          panelLocalTime < transSec &&
          activeIdx > 0
        ) {
          const prevPanel = panels[activeIdx - 1];
          const prevImg = loadedImagesRef.current.get(prevPanel.id);
          if (prevImg) {
            const blendRatio = panelLocalTime / transSec; // 0 to 1
            ctx.save();
            ctx.globalAlpha = 1.0 - blendRatio;
            const prevResolved = getResolvedMotionForPanel(
              activeIdx - 1,
              scenePlans[activeIdx - 1]?.motion || 'zoom-in'
            );
            const piw = (prevImg as HTMLCanvasElement).width || (prevImg as HTMLImageElement).naturalWidth || (prevImg as any).width;
            const pih = (prevImg as HTMLCanvasElement).height || (prevImg as HTMLImageElement).naturalHeight || (prevImg as any).height;
            const prevBox = calcWindowBox(
              piw,
              pih,
              W,
              H,
              prevResolved,
              1.0,
              1.0,
              'smooth'
            );
            ctx.drawImage(prevImg, prevBox.sx, prevBox.sy, prevBox.sw, prevBox.sh, 0, 0, W, H);
            ctx.restore();
          }
        }
      }

      // Subtitle caption ONLY if user explicitly enabled it (Clean Anime Caption style)
      if (showSubtitlesOnVideo) {
        const captionText = paragraphs[activeIdx];
        if (captionText && captionText.trim()) {
          const maxChar = videoConfig.aspectRatio === '9:16' ? 42 : 75;
          const shortText =
            captionText.length > maxChar ? captionText.slice(0, maxChar) + '...' : captionText;

          ctx.save();
          const fontSize = videoConfig.aspectRatio === '9:16' ? 26 : 22;
          ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          const textY = H - (videoConfig.aspectRatio === '9:16' ? 60 : 36);

          // Deep black outline (Anime Subtitle style)
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 6;
          ctx.lineJoin = 'round';
          ctx.strokeText(shortText, W / 2, textY);

          // Crisp white text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(shortText, W / 2, textY);
          ctx.restore();
        }
      }
    },
    [panels, durations, scenePlans, videoConfig, paragraphs, showSubtitlesOnVideo, getResolvedMotionForPanel]
  );

  // Playback Loop
  useEffect(() => {
    let lastTs = performance.now();

    const loop = (ts: number) => {
      const delta = (ts - lastTs) / 1000;
      lastTs = ts;

      if (isPreviewPlaying) {
        setPreviewProgress((prev) => {
          const next = prev + delta;
          if (next >= totalVideoDuration) {
            setIsPreviewPlaying(false);
            if (audioRef.current) audioRef.current.pause();
            return 0;
          }
          renderCanvasFrameAtTime(next);
          return next;
        });
      }

      previewAnimFrameRef.current = requestAnimationFrame(loop);
    };

    previewAnimFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (previewAnimFrameRef.current) cancelAnimationFrame(previewAnimFrameRef.current);
    };
  }, [isPreviewPlaying, totalVideoDuration, renderCanvasFrameAtTime]);

  // Initial canvas draw
  useEffect(() => {
    if (panels.length) {
      renderCanvasFrameAtTime(previewProgress);
    }
  }, [panels, videoConfig.width, videoConfig.height, renderCanvasFrameAtTime, previewProgress]);

  // Toggle Live Preview
  const handleTogglePreview = () => {
    if (!panels.length) {
      showToast('Tambahkan gambar panel terlebih dahulu.');
      return;
    }
    const aud = audioRef.current;
    if (isPreviewPlaying) {
      setIsPreviewPlaying(false);
      if (aud) aud.pause();
    } else {
      if (aud) {
        aud.currentTime = previewProgress;
        aud.play().catch(() => {});
      }
      setIsPreviewPlaying(true);
    }
  };

  const handleResetPreview = () => {
    const aud = audioRef.current;
    if (aud) {
      aud.pause();
      aud.currentTime = 0;
    }
    setIsPreviewPlaying(false);
    setPreviewProgress(0);
    renderCanvasFrameAtTime(0);
  };

  // Auto-compress recorded video to MP4 using server-side FFmpeg (H.264 + AAC + constant 30 FPS)
  // Sends the original pristine audioFile directly to FFmpeg to preserve 100% natural vocal pitch
  const handleCompressRecordedBlob = async (
    rawBlob: Blob,
    targetQuality: 'high' | 'standard' | 'compact' = compressionQuality
  ) => {
    setIsCompressingMp4(true);
    setCompressStatusText('Mengompresi ke MP4 H.264 & menjaga keaslian suara narasi...');
    try {
      const crfVal = targetQuality === 'high' ? 20 : targetQuality === 'compact' ? 28 : 23;
      const formData = new FormData();
      formData.append('video', rawBlob, 'canvas_record.webm');
      if (audioFile) {
        // Send the original voiceover file directly to FFmpeg to preserve exact vocal pitch & clarity!
        formData.append('audio', audioFile, audioFile.name || 'voiceover.mp3');
      }

      const res = await fetch(`/api/compress-mp4?crf=${crfVal}&preset=veryfast`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Server kompresi gagal (HTTP ${res.status})`);
      }

      const mp4Blob = await res.blob();
      const mp4Url = URL.createObjectURL(mp4Blob);
      setRenderedVideoUrl(mp4Url);
      setVideoFormat('mp4');
      setVideoFileSize(mp4Blob.size);
      setOriginalFileSize(rawBlob.size + (audioFile ? audioFile.size : 0));
      setCompressionQuality(targetQuality);
      showToast(`Sukses! Video MP4 selesai dengan suara narasi jernih & pitch asli (${(mp4Blob.size / (1024 * 1024)).toFixed(1)} MB)`);
    } catch (err: any) {
      console.warn('MP4 Auto Compression fallback:', err);
      const fallbackUrl = URL.createObjectURL(rawBlob);
      setRenderedVideoUrl(fallbackUrl);
      setVideoFormat('webm');
      setVideoFileSize(rawBlob.size);
      showToast('Kompresi dialihkan, video rekaman langsung siap diunduh.');
    } finally {
      setIsCompressingMp4(false);
    }
  };

  const handleRecompress = async (targetQuality: 'high' | 'standard' | 'compact') => {
    if (!lastRecordedBlobRef.current) {
      showToast('Belum ada video rekaman untuk dikompres ulang.');
      return;
    }
    setCompressionQuality(targetQuality);
    await handleCompressRecordedBlob(lastRecordedBlobRef.current, targetQuality);
  };

  // In-Browser Video Render with Canvas & MediaRecorder (Smooth 30 FPS Hardware Accelerated)
  const handleRenderVideoInBrowser = async () => {
    if (!panels.length) {
      showToast('Masukkan gambar panel terlebih dahulu!');
      return;
    }

    const canvas = previewCanvasRef.current;
    if (!canvas) {
      showToast('Canvas preview belum siap.');
      return;
    }

    setIsRendering(true);
    setIsCompressingMp4(false);
    setCompressStatusText('');
    setRenderProgress(0);
    setRenderedVideoUrl('');
    setIsPreviewPlaying(false);
    if (audioRef.current) audioRef.current.pause();

    // Use hardware-accelerated canvas stream at locked 30 FPS
    const stream = canvas.captureStream(30);

    // Hardware-accelerated smooth codec selection (H.264 / VP8)
    const mimeTypes = [
      'video/mp4;codecs=avc1',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    let selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    let recorder: MediaRecorder;
    try {
      recorder = selectedMime
        ? new MediaRecorder(stream, {
            mimeType: selectedMime,
            videoBitsPerSecond: 4_500_000 // 4.5 Mbps for smooth crisp quality
          })
        : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = async () => {
      const finalBlob = new Blob(recordedChunks, { type: selectedMime || 'video/webm' });
      lastRecordedBlobRef.current = finalBlob;
      setOriginalFileSize(finalBlob.size);
      setIsRendering(false);
      setRenderProgress(1.0);

      if (autoCompressMp4) {
        await handleCompressRecordedBlob(finalBlob, compressionQuality);
      } else {
        const videoBlobUrl = URL.createObjectURL(finalBlob);
        setRenderedVideoUrl(videoBlobUrl);
        setVideoFormat(selectedMime.includes('mp4') ? 'mp4' : 'webm');
        setVideoFileSize(finalBlob.size);
        showToast('Render video selesai! Siap diunduh.');
      }
    };

    // Start recorder without micro-timeslice to generate standard smooth GOP video frames
    recorder.start();

    // Real-time synchronized rendering loop with quantized 30 FPS pacing
    const startTime = performance.now();
    let lastRenderedFrameIndex = -1;
    let animId: number;

    const renderLoop = () => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;

      if (elapsed >= totalVideoDuration) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }

      // Quantize to exact 30 FPS grid: guarantees 100% uniform motion without micro-stutter
      const frameIndex = Math.floor(elapsed * 30);
      if (frameIndex > lastRenderedFrameIndex) {
        lastRenderedFrameIndex = frameIndex;
        const quantizedT = frameIndex / 30;
        renderCanvasFrameAtTime(quantizedT, canvas);
        setPreviewProgress(quantizedT);
        setRenderProgress(Math.min(0.99, Number((quantizedT / totalVideoDuration).toFixed(3))));
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
  };

  return (
    <div className="min-h-screen bg-[#121418] text-[#e2e8f0] flex flex-col font-sans selection:bg-[#ff6b4a] selection:text-white">
      {/* Hidden audio element for sync & preview */}
      <audio
        ref={audioRef}
        {...(audioUrl ? { src: audioUrl } : {})}
        preload="auto"
        playsInline
        onPlay={(e) => {
          e.currentTarget.playbackRate = 1.0;
        }}
      />

      {/* Top Navigation Bar */}
      <header className="border-b border-[#222733] bg-[#171922] px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#ff4720] to-[#ff7a59] flex items-center justify-center shadow-lg shadow-[#ff4720]/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight text-white flex items-center gap-2">
              Manga Recap Studio
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded bg-[#ff6b4a]/20 text-[#ff7a59] border border-[#ff6b4a]/30">
                PRO ENGINE
              </span>
            </h1>
            <p className="text-xs text-[#8a94a6]">Automation Video & Audio Sync</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLoadDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#242938] hover:bg-[#2e3447] text-xs font-semibold text-[#a5b4fc] border border-[#3b4259] transition-all cursor-pointer"
            title="Muat 4 panel gambar manga, naskah, dan audio narasi demo"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#ff7a59]" />
            Muat Demo Manga
          </button>
        </div>
      </header>

      {/* Main Tabs */}
      <nav className="flex border-b border-[#222733] bg-[#14161f] sticky top-[57px] z-20">
        {[
          { key: 'img', label: '1. Panel Gambar', count: panels.length },
          { key: 'txt', label: '2. Naskah Narasi', count: paragraphs.length },
          { key: 'sync', label: '3. Sync Audio', activeMark: durations.length > 0 },
          { key: 'out', label: '4. Preview & Render', highlight: true }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex-1 py-3 px-2 text-xs md:text-sm font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === tab.key
                ? 'border-[#ff6b4a] text-white bg-[#ff6b4a]/5'
                : 'border-transparent text-[#8a94a6] hover:text-[#cbd5e1]'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  tab.count > 0 ? 'bg-[#ff6b4a]/20 text-[#ff8f73]' : 'bg-[#222733] text-[#64748b]'
                }`}
              >
                {tab.count}
              </span>
            )}
            {tab.activeMark && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
            )}
          </button>
        ))}
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 pb-28">
        {/* =========================================================
            TAB 1: GAMBAR PANEL
        ========================================================= */}
        {activeTab === 'img' && (
          <div className="space-y-4">
            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleAddFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-[#2d3445] hover:border-[#ff6b4a] bg-[#1a1d26] rounded-xl p-8 text-center cursor-pointer transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleAddFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#252a38] group-hover:bg-[#ff6b4a]/10 flex items-center justify-center text-[#8a94a6] group-hover:text-[#ff7a59] transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <p className="font-medium text-sm text-[#e2e8f0]">
                Tarik & letakkan file gambar manga ke sini
              </p>
              <p className="text-xs text-[#8a94a6] mt-1">
                Atau klik untuk memilih file (PNG, JPG, WebP) - Bisa langsung banyak
              </p>
            </div>

            {/* Panel Grid Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#8a94a6] px-1">
              <span className="font-medium text-white">
                {panels.length ? `${panels.length} panel gambar manga siap` : 'Belum ada panel'}
              </span>
              {panels.length > 0 && (
                <button
                  onClick={clearAllPanels}
                  className="text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus semua gambar
                </button>
              )}
            </div>

            {panels.length > 0 && (
              <div className="bg-[#171a24] border border-[#2b3347] rounded-lg p-2.5 text-xs text-[#a5b4fc] flex items-center gap-2">
                <span className="text-amber-400">💡</span>
                <span>
                  <strong>Tips:</strong> Periksa gambar di bawah. Jika ada foto yang tidak sengaja terupload (misal screenshot laptop/desktop), klik tombol <strong>✕</strong> merah di panel tersebut untuk menghapusnya.
                </span>
              </div>
            )}

            {/* Grid Panels */}
            {panels.length === 0 ? (
              <div className="bg-[#171922] border border-[#222733] rounded-xl p-8 text-center text-sm text-[#8a94a6]">
                <Layers className="w-8 h-8 mx-auto mb-2 text-[#475569]" />
                <p>Belum ada gambar panel manga.</p>
                <p className="text-xs text-[#64748b] mt-1">
                  Upload screenshot atau file komik lu, atau tekan tombol{' '}
                  <strong className="text-[#a5b4fc]">"Muat Demo Manga"</strong> di atas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {panels.map((panel, idx) => (
                  <div
                    key={panel.id}
                    draggable
                    onDragStart={() => setDraggedIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedIndex !== null && draggedIndex !== idx) {
                        movePanel(draggedIndex, idx);
                        setDraggedIndex(null);
                      }
                    }}
                    className="group relative bg-[#0b0c10] border border-[#252b3b] rounded-lg overflow-hidden flex flex-col shadow-md hover:border-[#ff6b4a]/60 transition-all"
                  >
                    {/* Index Badge */}
                    <div className="absolute top-2 left-2 z-10 bg-[#ff6b4a] text-white text-[11px] font-bold px-2 py-0.5 rounded shadow">
                      #{idx + 1}
                    </div>

                    {/* Image Preview */}
                    <div className="w-full aspect-[3/4] bg-black relative flex items-center justify-center overflow-hidden">
                      {panel.url ? (
                        <img
                          src={panel.url}
                          alt={panel.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : null}
                    </div>

                    {/* Filename */}
                    <div className="p-1.5 bg-[#171a24] text-[11px] truncate text-[#94a3b8] px-2">
                      {panel.name}
                    </div>

                    {/* Action Controls */}
                    <div className="grid grid-cols-3 border-t border-[#222733] bg-[#1c202d] text-xs divide-x divide-[#222733]">
                      <button
                        onClick={() => movePanel(idx, idx - 1)}
                        disabled={idx === 0}
                        className="py-1.5 flex items-center justify-center hover:bg-[#282e40] disabled:opacity-30 disabled:hover:bg-transparent text-[#94a3b8]"
                        title="Geser ke kiri / urutan sebelumnya"
                      >
                        <MoveLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => movePanel(idx, idx + 1)}
                        disabled={idx === panels.length - 1}
                        className="py-1.5 flex items-center justify-center hover:bg-[#282e40] disabled:opacity-30 disabled:hover:bg-transparent text-[#94a3b8]"
                        title="Geser ke kanan / urutan selanjutnya"
                      >
                        <MoveRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removePanel(idx)}
                        className="py-1.5 flex items-center justify-center hover:bg-rose-950/60 text-rose-400"
                        title="Hapus panel ini"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panels.length > 0 && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setActiveTab('txt')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff6b4a] hover:bg-[#ff5530] text-white text-sm font-semibold transition-all shadow-lg shadow-[#ff6b4a]/25 cursor-pointer"
                >
                  Lanjut ke Naskah Narasi <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 2: NASKAH NARASI
        ========================================================= */}
        {activeTab === 'txt' && (
          <div className="space-y-4">
            <div className="bg-[#171922] border border-[#222733] rounded-xl p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                <label className="text-xs font-semibold text-[#8a94a6] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#ff7a59]" />
                  Naskah Narasi (1 Paragraf = 1 Panel Manga)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScriptText(SAMPLE_SCRIPT)}
                    className="text-xs text-[#ff8f73] hover:underline"
                  >
                    Gunakan Contoh Naskah
                  </button>
                </div>
              </div>

              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="Tulis naskah narasi di sini...&#10;&#10;Pisahkan antar adegan dengan satu baris kosong (enter 2 kali).&#10;&#10;Satu paragraf akan otomatis dipasangkan dengan satu panel gambar manga."
                className="w-full min-h-[220px] bg-[#11131a] border border-[#262c3d] rounded-lg p-3 text-sm text-[#e2e8f0] placeholder-[#475569] focus:outline-none focus:border-[#ff6b4a] font-mono leading-relaxed resize-y"
              />

              {/* Status Paragraf vs Panel */}
              <div className="mt-3 flex items-center justify-between text-xs">
                <div>
                  {paragraphs.length === 0 ? (
                    <span className="text-[#64748b]">
                      Belum ada naskah. Panel gambar saat ini: {panels.length}
                    </span>
                  ) : paragraphs.length === panels.length ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Pas! {paragraphs.length} paragraf = {panels.length} panel gambar
                    </span>
                  ) : (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {paragraphs.length} paragraf vs {panels.length} panel. Idealnya sama (1 paragraf per panel).
                    </span>
                  )}
                </div>
                <span className="text-[#64748b]">
                  {paragraphs.reduce((a, b) => a + b.split(/\s+/).filter(Boolean).length, 0)} kata
                </span>
              </div>
            </div>

            {/* List breakdown */}
            {paragraphs.length > 0 && (
              <div className="bg-[#171922] border border-[#222733] rounded-xl p-4 md:p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8a94a6] mb-3">
                  Pemetaan Adegan ({paragraphs.length} Paragraf)
                </h3>
                <div className="space-y-2">
                  {paragraphs.map((para, i) => (
                    <div
                      key={i}
                      className="p-3 bg-[#11131a] border border-[#242938] rounded-lg text-xs flex gap-3 items-start"
                    >
                      <div className="px-2 py-0.5 rounded bg-[#ff6b4a]/20 text-[#ff8f73] font-bold shrink-0">
                        #{i + 1}
                      </div>
                      <div className="flex-1 text-[#cbd5e1] leading-relaxed">
                        {para}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-between">
              <button
                onClick={() => setActiveTab('img')}
                className="px-4 py-2 rounded-lg bg-[#222733] hover:bg-[#2b3140] text-xs font-semibold text-[#cbd5e1] cursor-pointer"
              >
                Kembali ke Gambar
              </button>
              <button
                onClick={() => setActiveTab('sync')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff6b4a] hover:bg-[#ff5530] text-white text-sm font-semibold transition-all shadow-lg shadow-[#ff6b4a]/25 cursor-pointer"
              >
                Lanjut ke Sync Audio <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 3: AUDIO & SYNC
        ========================================================= */}
        {activeTab === 'sync' && (
          <div className="space-y-4">
            {/* Audio Picker Card */}
            <div className="bg-[#171922] border border-[#222733] rounded-xl p-4 md:p-5">
              <label className="block text-xs font-semibold text-[#8a94a6] mb-2 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#ff7a59]" />
                Audio Narasi / Voiceover (MP3, WAV, M4A)
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleAudioSelect(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#222733] hover:bg-[#2d3342] text-xs font-semibold text-[#cbd5e1] border border-[#343b4d] flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Upload className="w-4 h-4 text-[#ff7a59]" />
                  {audioFile ? 'Ganti File Audio' : 'Pilih File Audio Narasi'}
                </button>

                {audioFile ? (
                  <div className="text-xs text-[#a5b4fc] flex items-center gap-2 truncate">
                    <span className="font-semibold text-white">{audioFile.name}</span>
                    <span className="text-[#8a94a6]">({formatTime(audioDuration)})</span>
                  </div>
                ) : (
                  <span className="text-xs text-[#64748b]">
                    Belum ada audio narasi. (Bisa pakai tombol demo di atas)
                  </span>
                )}
              </div>
            </div>

            {/* Sync Otomatis Card */}
            <div className="bg-[#171922] border border-[#222733] rounded-xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#ff7a59]" />
                  <h3 className="font-bold text-sm text-white">Sync Otomatis (AI Audio Alignment)</h3>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#1e2330] text-[#94a3b8] border border-[#293042]">
                  {serverHealth}
                </span>
              </div>
              <p className="text-xs text-[#8a94a6] mb-4">
                Audio akan dicocokkan dengan tiap paragraf naskah secara presisi sehingga durasi tiap gambar panel terisi otomatis tanpa perlu edit manual.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[11px] text-[#8a94a6] mb-1">Bahasa Narasi</label>
                  <select
                    value={syncLang}
                    onChange={(e) => setSyncLang(e.target.value)}
                    className="w-full bg-[#11131a] border border-[#242938] rounded-lg px-3 py-2 text-xs text-[#e2e8f0] focus:border-[#ff6b4a] outline-none"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                    <option value="auto">Deteksi Otomatis</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#8a94a6] mb-1">Mode Model</label>
                  <select
                    value={syncModel}
                    onChange={(e) => setSyncModel(e.target.value)}
                    className="w-full bg-[#11131a] border border-[#242938] rounded-lg px-3 py-2 text-xs text-[#e2e8f0] focus:border-[#ff6b4a] outline-none"
                  >
                    <option value="gemini">Gemini AI Engine (Direkomendasikan)</option>
                    <option value="small">Small (Cepat & Akurat)</option>
                    <option value="base">Base (Ekstra Cepat)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleAutoSync}
                  disabled={isAutoSyncing || !panels.length}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#ff6b4a] hover:bg-[#ff5530] disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md shadow-[#ff6b4a]/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isAutoSyncing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sedang Menganalisis Audio...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Jalankan Sync Otomatis
                    </>
                  )}
                </button>

                <button
                  onClick={handleEvenDuration}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#222733] hover:bg-[#2b3140] text-xs font-semibold text-[#cbd5e1] border border-[#303747] cursor-pointer"
                >
                  Bagi Rata Sesuai Panjang Audio
                </button>
              </div>

              {isAutoSyncing && (
                <div className="mt-3">
                  <div className="w-full bg-[#11131a] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#ff6b4a] h-full transition-all duration-300"
                      style={{ width: `${autoSyncProgress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Manual Tap Sync Toggle */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsManualSyncOpen(!isManualSyncOpen)}
                className="text-xs text-[#a5b4fc] hover:text-white flex items-center gap-1.5 py-1 font-semibold cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-[#ff7a59]" />
                {isManualSyncOpen ? 'Tutup Tap-Sync Manual' : 'Buka Tap-Sync Manual (Dengarkan Sambil Tap)'}
              </button>
            </div>

            {/* Manual Tap-Sync Stage */}
            {isManualSyncOpen && (
              <div className="bg-[#171922] border border-[#2b3347] rounded-xl p-4 md:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-[#242938] pb-3">
                  <div className="text-xs text-[#8a94a6]">
                    <strong>Cara Tap-Sync:</strong> Putar audio dan tap tombol besar (atau tekan <strong>Spasi</strong>) setiap narator berpindah membaca panel berikutnya.
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-[#8a94a6]">Kompensasi Lag:</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={tapLag}
                      onChange={(e) => setTapLag(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-[#11131a] border border-[#2b3140] rounded px-2 py-1 text-xs text-white text-center"
                    />
                    <span className="text-[11px] text-[#64748b]">detik</span>
                  </div>
                </div>

                {/* Stage Visual */}
                <div className="bg-[#0e1017] rounded-xl p-4 border border-[#222733] text-center">
                  <div className="flex items-center justify-between text-xs text-[#8a94a6] mb-2 font-mono">
                    <span>Panel Aktif: <strong className="text-white">{panels.length ? Math.min(tapIndex + 1, panels.length) : 0} / {panels.length}</strong></span>
                    <span className="text-[#ff7a59]">{formatTime(audioCurrentTime)} / {formatTime(audioDuration)}</span>
                  </div>

                  {/* Scene Selector Pills */}
                  {panels.length > 0 && (
                    <div className="flex items-center justify-center gap-1.5 flex-wrap mb-3 max-h-24 overflow-y-auto py-1">
                      {panels.map((_, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            setTapIndex(pIdx);
                            if (manualStarts[pIdx] !== undefined && audioRef.current) {
                              audioRef.current.currentTime = manualStarts[pIdx];
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                            tapIndex === pIdx
                              ? 'bg-[#ff6b4a] text-white shadow-md shadow-[#ff6b4a]/30 scale-105'
                              : 'bg-[#1a1e2b] text-[#94a3b8] hover:bg-[#252a3b]'
                          }`}
                        >
                          Panel {pIdx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {panels[tapIndex] && panels[tapIndex].url ? (
                    <div className="max-h-52 mx-auto mb-3 flex items-center justify-center">
                      <img
                        src={panels[tapIndex].url}
                        alt="Current panel"
                        className="max-h-52 object-contain rounded-lg border border-[#293042]"
                      />
                    </div>
                  ) : null}

                  {/* Kolom Teks Naskah Adegan Ini (Editable agar bisa disesuaikan setiap pindah adegan) */}
                  <div className="mt-3 text-left max-w-xl mx-auto bg-[#161922] p-3 rounded-xl border border-[#2b3347]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-[#ff8f73] flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        Naskah Narasi Panel Ini (Adegan #{tapIndex + 1}):
                      </label>
                      <span className="text-[10px] text-[#8a94a6]">Edit langsung teks naskah untuk adegan ini</span>
                    </div>

                    <textarea
                      rows={3}
                      value={paragraphs[tapIndex] || ''}
                      onChange={(e) => {
                        const newText = e.target.value;
                        const newParas = [...paragraphs];
                        while (newParas.length <= tapIndex) {
                          newParas.push('');
                        }
                        newParas[tapIndex] = newText;
                        setScriptText(newParas.join('\n\n'));
                      }}
                      placeholder={`Ketik atau sesuaikan narasi untuk Panel #${tapIndex + 1} di sini...`}
                      className="w-full bg-[#0d0f15] border border-[#262d3e] rounded-lg p-2.5 text-xs text-white font-mono focus:border-[#ff6b4a] outline-none leading-relaxed resize-y"
                    />

                    {tapIndex + 1 < panels.length && (
                      <div className="mt-2 pt-2 border-t border-[#222733] text-[11px] text-[#8a94a6] flex items-center gap-1.5">
                        <span className="font-semibold text-[#a5b4fc] shrink-0">Adegan Berikutnya (#{tapIndex + 2}):</span>
                        <span className="truncate flex-1 text-[#cbd5e1]">
                          {paragraphs[tapIndex + 1] || '(Belum ada naskah untuk panel berikutnya)'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tap Control Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleManualUndo}
                    disabled={tapSyncState === 'idle' || tapIndex === 0}
                    className="h-14 px-4 rounded-xl bg-[#222733] hover:bg-[#2b3140] disabled:opacity-30 text-white font-bold flex items-center justify-center cursor-pointer"
                    title="Mundur satu panel (Undo)"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleTapSync}
                    className="flex-1 h-14 rounded-xl bg-[#ff6b4a] hover:bg-[#ff5530] text-white font-bold text-base shadow-lg shadow-[#ff6b4a]/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    {tapSyncState === 'idle' && (
                      <>
                        <Play className="w-5 h-5" /> Mulai Tap-Sync
                      </>
                    )}
                    {tapSyncState === 'playing' && (
                      <>
                        {tapIndex < panels.length - 1 ? (
                          <>Panel Berikutnya ▶ ({tapIndex + 2}/{panels.length})</>
                        ) : (
                          'Selesai ■'
                        )}
                      </>
                    )}
                    {tapSyncState === 'paused' && 'Lanjutkan ▶'}
                    {tapSyncState === 'done' && 'Ulangi Tap-Sync ↺'}
                  </button>

                  <button
                    onClick={handleManualPauseToggle}
                    disabled={tapSyncState === 'idle' || tapSyncState === 'done'}
                    className="h-14 px-4 rounded-xl bg-[#222733] hover:bg-[#2b3140] disabled:opacity-30 text-white font-bold flex items-center justify-center cursor-pointer"
                    title="Pause / Resume"
                  >
                    {tapSyncState === 'paused' ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Durasi Panel Table */}
            {durations.length > 0 && durations.length === panels.length && (
              <div className="bg-[#171922] border border-[#222733] rounded-xl p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#ff7a59]" />
                    Durasi Tiap Panel Manga
                  </h3>
                  <div className="text-xs text-[#8a94a6] font-mono">
                    Total: <strong className="text-white">{formatTime(totalVideoDuration)}</strong>
                    {audioDuration > 0 && ` · Audio: ${formatTime(audioDuration)}`}
                  </div>
                </div>
                <p className="text-xs text-[#8a94a6] mb-3">
                  Tekan <strong className="text-[#a5b4fc]">▶</strong> untuk mendengarkan potongan suara panel ini. Anda bisa mengubah detik secara manual.
                </p>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {panels.map((p, i) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2 bg-[#11131a] border border-[#222733] rounded-lg text-xs"
                    >
                      {p.url ? (
                        <img
                          src={p.url}
                          alt=""
                          className="w-10 h-14 object-cover rounded bg-black shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-14 rounded bg-black shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white flex items-center gap-2">
                          Panel {i + 1}
                          {confidences[i] !== undefined && confidences[i] < 0.6 && (
                            <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-800">
                              ⚠ Cek
                            </span>
                          )}
                        </div>
                        <p className="text-[#8a94a6] truncate text-[11px] mt-0.5">
                          {paragraphs[i] || '(Naskah kosong)'}
                        </p>
                      </div>

                      {/* Listen button */}
                      <button
                        onClick={() => handlePreviewPanelAudio(i)}
                        className="w-8 h-8 rounded-lg bg-[#222733] hover:bg-[#ff6b4a] hover:text-white text-[#94a3b8] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title="Dengarkan bagian audio panel ini"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>

                      {/* Input Duration */}
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          step="0.1"
                          min="0.3"
                          value={durations[i] || 4.0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (val > 0) {
                              const updated = [...durations];
                              updated[i] = val;
                              setDurations(updated);
                            }
                          }}
                          className="w-20 bg-[#171a24] border border-[#2b3347] rounded px-2 py-1.5 text-center font-mono text-white text-xs"
                        />
                        <span className="text-[#64748b] text-[11px]">dtk</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-between">
              <button
                onClick={() => setActiveTab('txt')}
                className="px-4 py-2 rounded-lg bg-[#222733] hover:bg-[#2b3140] text-xs font-semibold text-[#cbd5e1] cursor-pointer"
              >
                Kembali ke Naskah
              </button>
              <button
                onClick={() => setActiveTab('out')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff6b4a] hover:bg-[#ff5530] text-white text-sm font-semibold transition-all shadow-lg shadow-[#ff6b4a]/25 cursor-pointer"
              >
                Lanjut ke Preview & Render <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 4: PREVIEW & RENDER
        ========================================================= */}
        {activeTab === 'out' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Canvas Preview Player */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-[#171922] border border-[#222733] rounded-xl p-4 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-[#ff7a59]" />
                    Live Canvas Player
                  </h3>
                  <span className="text-xs font-mono text-[#a5b4fc]">
                    {formatTime(previewProgress)} / {formatTime(totalVideoDuration)}
                  </span>
                </div>

                {/* Canvas Display Viewport */}
                <div
                  className={`w-full relative bg-black rounded-lg overflow-hidden flex items-center justify-center border border-[#252b3b] shadow-2xl ${
                    videoConfig.aspectRatio === '9:16'
                      ? 'max-w-[320px] aspect-[9/16]'
                      : 'aspect-[16/9]'
                  }`}
                >
                  <canvas
                    ref={previewCanvasRef}
                    width={videoConfig.width}
                    height={videoConfig.height}
                    className="w-full h-full object-contain"
                  />

                  {/* Play Overlay if paused */}
                  {!isPreviewPlaying && (
                    <button
                      onClick={handleTogglePreview}
                      className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-[#ff6b4a]/90 hover:bg-[#ff6b4a] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer"
                    >
                      <Play className="w-7 h-7 ml-1" />
                    </button>
                  )}
                </div>

                {/* Scrubber Timeline */}
                <div className="w-full mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max={totalVideoDuration || 1}
                    step="0.05"
                    value={previewProgress}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setPreviewProgress(val);
                      if (audioRef.current) audioRef.current.currentTime = val;
                      renderCanvasFrameAtTime(val);
                    }}
                    className="flex-1 accent-[#ff6b4a] h-1.5 bg-[#252b3b] rounded cursor-pointer"
                  />
                </div>

                {/* Control bar */}
                <div className="w-full mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTogglePreview}
                      className="px-4 py-2 rounded-lg bg-[#ff6b4a] hover:bg-[#ff5530] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isPreviewPlaying ? (
                        <>
                          <Pause className="w-4 h-4" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" /> Putar Preview
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleResetPreview}
                      className="p-2 rounded-lg bg-[#222733] hover:bg-[#2c3344] text-[#cbd5e1] text-xs font-semibold cursor-pointer"
                      title="Ulangi dari awal"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-xs text-[#8a94a6]">
                    Format: <strong className="text-white">{videoConfig.aspectRatio}</strong>
                  </div>
                </div>
              </div>

              {/* Render Output Player with Auto-Compressed MP4 */}
              {renderedVideoUrl && (
                <div className="bg-[#171922] border border-emerald-500/40 rounded-xl p-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Video {videoFormat.toUpperCase()} Siap Diunduh!
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {videoFormat === 'mp4' ? 'H.264 • MP4' : 'WEBM'}
                        </span>
                      </div>
                      {videoFileSize && (
                        <div className="text-[11px] text-[#94a3b8] mt-0.5 flex items-center gap-2">
                          <span>Ukuran: <strong className="text-white">{(videoFileSize / (1024 * 1024)).toFixed(1)} MB</strong></span>
                          {originalFileSize && originalFileSize > videoFileSize && (
                            <span className="text-emerald-400 font-medium">
                              (Hemat {Math.round((1 - videoFileSize / originalFileSize) * 100)}% dari {(originalFileSize / (1024 * 1024)).toFixed(1)} MB)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <a
                      href={renderedVideoUrl}
                      download={`manga_recap.${videoFormat}`}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      Unduh {videoFormat.toUpperCase()} ({videoFormat === 'mp4' ? '.mp4' : '.webm'})
                    </a>
                  </div>

                  <video
                    src={renderedVideoUrl}
                    controls
                    playsInline
                    className="w-full rounded-lg bg-black aspect-video border border-[#23293a]"
                  />

                  {/* Re-compression Quality Bar */}
                  <div className="mt-3 pt-3 border-t border-[#23293a] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="text-[11px] text-[#94a3b8] flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Kompres Ulang Preset:</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleRecompress('standard')}
                        disabled={isCompressingMp4}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                          compressionQuality === 'standard'
                            ? 'bg-[#ff6b4a]/20 border-[#ff6b4a] text-[#ff7a59]'
                            : 'bg-[#1e2330] border-[#2b3347] text-[#cbd5e1] hover:bg-[#252c3d]'
                        }`}
                        title="CRF 23: Rekomendasi seimbang kualitas & hemat ukuran"
                      >
                        Standar (CRF 23)
                      </button>

                      <button
                        onClick={() => handleRecompress('high')}
                        disabled={isCompressingMp4}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                          compressionQuality === 'high'
                            ? 'bg-[#ff6b4a]/20 border-[#ff6b4a] text-[#ff7a59]'
                            : 'bg-[#1e2330] border-[#2b3347] text-[#cbd5e1] hover:bg-[#252c3d]'
                        }`}
                        title="CRF 20: Kualitas tertinggi & sangat tajam"
                      >
                        Kualitas Tinggi (CRF 20)
                      </button>

                      <button
                        onClick={() => handleRecompress('compact')}
                        disabled={isCompressingMp4}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                          compressionQuality === 'compact'
                            ? 'bg-[#ff6b4a]/20 border-[#ff6b4a] text-[#ff7a59]'
                            : 'bg-[#1e2330] border-[#2b3347] text-[#cbd5e1] hover:bg-[#252c3d]'
                        }`}
                        title="CRF 28: Sangat hemat ukuran & cepat diupload"
                      >
                        Super Hemat (CRF 28)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Settings & Render Triggers */}
            <div className="lg:col-span-5 space-y-4">
              {/* Aspect Ratio & Resolution */}
              <div className="bg-[#171922] border border-[#222733] rounded-xl p-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#8a94a6] mb-3">
                  Format & Ukuran Video
                </h3>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => handleAspectRatioChange('16:9')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      videoConfig.aspectRatio === '16:9'
                        ? 'border-[#ff6b4a] bg-[#ff6b4a]/10 text-white'
                        : 'border-[#252b3b] text-[#8a94a6] hover:bg-[#1f2430]'
                    }`}
                  >
                    <Maximize2 className="w-4 h-4 text-[#ff7a59]" />
                    <span>16:9 Landscape</span>
                    <span className="text-[10px] text-[#64748b]">YouTube (1280x720)</span>
                  </button>

                  <button
                    onClick={() => handleAspectRatioChange('9:16')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      videoConfig.aspectRatio === '9:16'
                        ? 'border-[#ff6b4a] bg-[#ff6b4a]/10 text-white'
                        : 'border-[#252b3b] text-[#8a94a6] hover:bg-[#1f2430]'
                    }`}
                  >
                    <Maximize2 className="w-4 h-4 text-[#ff7a59] rotate-90" />
                    <span>9:16 Portrait</span>
                    <span className="text-[10px] text-[#64748b]">Shorts/TikTok/Reels</span>
                  </button>
                </div>

                {/* Global Motion Style */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-[#8a94a6] mb-1">
                      Gerakan Kamera Utama (Motion Type)
                    </label>
                    <select
                      value={videoConfig.defaultMotion}
                      onChange={(e) => {
                        const m = e.target.value as MotionType;
                        setVideoConfig((prev) => ({ ...prev, defaultMotion: m }));
                        setScenePlans((prev) => prev.map((sc) => ({ ...sc, motion: m })));
                      }}
                      className="w-full bg-[#11131a] border border-[#242938] rounded-lg px-3 py-2 text-xs text-[#e2e8f0] focus:border-[#ff6b4a] outline-none"
                    >
                      <option value="random">Acak / Smart Flow (Campur)</option>
                      <option value="zoom-in">Zoom In (Fokus Mendekat)</option>
                      <option value="zoom-out">Zoom Out (Reveal Luas)</option>
                      <option value="pan-top-to-bottom">Geser Atas ke Bawah</option>
                      <option value="pan-bottom-to-top">Geser Bawah ke Atas</option>
                      <option value="pan-left-to-right">Geser Kiri ke Kanan</option>
                      <option value="pan-right-to-left">Geser Kanan ke Kiri</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#8a94a6] mb-1">
                      Transisi Antar Panel
                    </label>
                    <select
                      value={videoConfig.transitionSec}
                      onChange={(e) => {
                        const tr = parseFloat(e.target.value);
                        setVideoConfig((prev) => ({ ...prev, transitionSec: tr }));
                      }}
                      className="w-full bg-[#11131a] border border-[#242938] rounded-lg px-3 py-2 text-xs text-[#e2e8f0] focus:border-[#ff6b4a] outline-none"
                    >
                      <option value="0.4">Crossfade Mulus (0.4 detik)</option>
                      <option value="0.2">Crossfade Cepat (0.2 detik)</option>
                      <option value="0">Tanpa Transisi (Cut Langsung)</option>
                    </select>
                  </div>

                  {/* Subtitle toggle */}
                  <div className="pt-2 border-t border-[#242938] flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-semibold text-white">Teks Subtitle di Video</span>
                      <span className="text-[10px] text-[#64748b]">Tampilkan naskah narasi di bawah video</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSubtitlesOnVideo(!showSubtitlesOnVideo)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        showSubtitlesOnVideo ? 'bg-[#ff6b4a]' : 'bg-[#252b3b]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showSubtitlesOnVideo ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Render Action Buttons */}
              <div className="bg-[#171922] border border-[#222733] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-[#8a94a6]">
                    Render & Ekspor Video
                  </h3>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Auto-Kompres MP4 Aktif
                  </span>
                </div>

                {/* Compression Options */}
                <div className="bg-[#11131a] rounded-lg p-2.5 border border-[#232938] space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <FileVideo className="w-3.5 h-3.5 text-[#ff7a59]" />
                        Auto Kompres ke MP4 (H.264)
                      </span>
                      <p className="text-[10px] text-[#64748b]">
                        Konversi otomatis ke format MP4 mulus & hemat setelah render
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoCompressMp4(!autoCompressMp4)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                        autoCompressMp4 ? 'bg-[#ff6b4a]' : 'bg-[#252b3b]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          autoCompressMp4 ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {autoCompressMp4 && (
                    <div className="pt-2 border-t border-[#1e2330] flex items-center justify-between">
                      <span className="text-[11px] text-[#8a94a6]">Profil Kompresi:</span>
                      <select
                        value={compressionQuality}
                        onChange={(e) => setCompressionQuality(e.target.value as any)}
                        className="bg-[#171a24] border border-[#2c3447] text-white text-[11px] rounded px-2 py-1 outline-none"
                      >
                        <option value="standard">Standar (CRF 23 - Rekomendasi)</option>
                        <option value="high">Kualitas Tinggi (CRF 20 - Tajam)</option>
                        <option value="compact">Super Hemat (CRF 28 - Ringan)</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Render Button */}
                <button
                  onClick={handleRenderVideoInBrowser}
                  disabled={isRendering || isCompressingMp4 || !panels.length}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#ff4720] to-[#ff7a59] hover:from-[#e63c17] hover:to-[#ff6844] disabled:opacity-40 text-white font-bold text-sm shadow-xl shadow-[#ff4720]/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                >
                  {isRendering ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Tahap 1: Merekam Frame Canvas ({Math.round(renderProgress * 100)}%)...
                    </>
                  ) : isCompressingMp4 ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Tahap 2: Auto Mengompres ke MP4 H.264...
                    </>
                  ) : (
                    <>
                      <Film className="w-4 h-4" />
                      Render & Auto Kompres MP4 (30 FPS)
                    </>
                  )}
                </button>

                {/* Progress bars */}
                {isRendering && (
                  <div className="space-y-1">
                    <div className="w-full bg-[#11131a] h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#ff6b4a] h-full transition-all duration-100"
                        style={{ width: `${renderProgress * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-[#94a3b8]">
                      <span>Merekam animasi gerak panel & sinkronisasi audio...</span>
                      <span>{Math.round(renderProgress * 100)}%</span>
                    </div>
                  </div>
                )}

                {isCompressingMp4 && (
                  <div className="p-3 bg-[#171c26] rounded-lg border border-[#ff6b4a]/30 space-y-2 animate-pulse">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#ff7a59]">
                      <div className="w-3.5 h-3.5 border-2 border-[#ff7a59] border-t-transparent rounded-full animate-spin" />
                      <span>{compressStatusText || 'Sedang mengompres ke MP4...'}</span>
                    </div>
                    <div className="w-full bg-[#11131a] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-[#ff4720] to-emerald-400 h-full w-full animate-pulse" />
                    </div>
                    <p className="text-[10px] text-[#8a94a6]">
                      FFmpeg sedang mengonversi rekaman ke MP4 H.264 mulus 30 FPS dan mengecilkan ukuran file.
                    </p>
                  </div>
                )}
              </div>

              {/* Individual Panel Motion Override Drawer */}
              {panels.length > 0 && (
                <div className="bg-[#171922] border border-[#222733] rounded-xl p-4">
                  <h4 className="font-bold text-xs text-white mb-2 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#ff7a59]" />
                    Atur Gaya Kamera Per Panel
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {panels.map((p, idx) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 p-1.5 bg-[#11131a] rounded border border-[#222733] text-xs"
                      >
                        <span className="font-mono text-[#cbd5e1] truncate max-w-[120px]">
                          #{idx + 1} {p.name}
                        </span>
                        <select
                          value={scenePlans[idx]?.motion || videoConfig.defaultMotion}
                          onChange={(e) => {
                            const val = e.target.value as MotionType;
                            setScenePlans((prev) => {
                              const updated = [...prev];
                              if (updated[idx]) updated[idx].motion = val;
                              return updated;
                            });
                          }}
                          className="bg-[#171a24] border border-[#2b3347] rounded px-2 py-1 text-[11px] text-[#cbd5e1] outline-none"
                        >
                          <option value="random">Acak</option>
                          <option value="zoom-in">Zoom In</option>
                          <option value="zoom-out">Zoom Out</option>
                          <option value="pan-top-to-bottom">Atas → Bawah</option>
                          <option value="pan-bottom-to-top">Bawah → Atas</option>
                          <option value="pan-left-to-right">Kiri → Kanan</option>
                          <option value="pan-right-to-left">Kanan → Kiri</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#171a24]/95 text-white border border-[#ff6b4a]/50 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium z-50 flex items-center gap-2 backdrop-blur-md animate-fade-in">
          <Sparkles className="w-3.5 h-3.5 text-[#ff7a59]" />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
