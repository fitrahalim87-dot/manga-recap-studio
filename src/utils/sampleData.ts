import { PanelItem } from '../types';

export const SAMPLE_SCRIPT = `Di tengah malam yang mencekam di atas langit kota Seoul, sebuah portal dimensi hitam pekat tiba-tiba terbuka dan memuntahkan ratusan monster berdarah dingin.

Di saat seluruh hunter kelas tinggi mulai putus asa, seorang pemuda dengan tatapan mata menyala biru melangkah maju tanpa sedikit pun rasa takut.

Dengan satu ayunan pedang bayangan berkecepatan kilat, aura mematikan membelah udara dan menghancurkan komandan monster dalam satu serangan telak!

Kini, seluruh medan pertempuran hening seketika. Sang Raja Bayangan telah resmi bangkit untuk merebut kembali takhta dunia.`;

function createMangaSvg(title: string, subtitle: string, theme: string, index: number): string {
  const colors: Record<string, { bg1: string; bg2: string; accent: string; line: string }> = {
    dark: { bg1: '#090a0f', bg2: '#1b1d2a', accent: '#ff4444', line: '#ffffff' },
    aura: { bg1: '#050a19', bg2: '#0d1f47', accent: '#00d2ff', line: '#ffffff' },
    action: { bg1: '#190a05', bg2: '#3d1607', accent: '#ff8800', line: '#ffffaa' },
    epic: { bg1: '#0d0d15', bg2: '#222238', accent: '#a855f7', line: '#ffffff' }
  };
  const c = colors[theme] || colors.dark;

  // Manga comic panel look with screentones, halftones, speedlines, and Kanji/Indo sound effects
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <defs>
      <linearGradient id="grad${index}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.bg1}"/>
        <stop offset="50%" stop-color="${c.bg2}"/>
        <stop offset="100%" stop-color="${c.bg1}"/>
      </linearGradient>
      <pattern id="screentone${index}" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.2" fill="${c.accent}" opacity="0.3"/>
      </pattern>
    </defs>
    
    <!-- Manga panel border & background -->
    <rect width="900" height="1200" fill="#000000"/>
    <rect x="25" y="25" width="850" height="1150" fill="url(#grad${index})" stroke="#ffffff" stroke-width="8"/>
    <rect x="25" y="25" width="850" height="1150" fill="url(#screentone${index})"/>

    <!-- Action Speedlines -->
    <g opacity="0.4" stroke="${c.line}" stroke-width="2">
      <line x1="25" y1="25" x2="450" y2="600"/>
      <line x1="875" y1="25" x2="450" y2="600"/>
      <line x1="25" y1="1175" x2="450" y2="600"/>
      <line x1="875" y1="1175" x2="450" y2="600"/>
      <line x1="450" y1="25" x2="450" y2="600"/>
      <line x1="25" y1="600" x2="450" y2="600"/>
      <line x1="875" y1="600" x2="450" y2="600"/>
    </g>

    <!-- Center Art Elements -->
    ${
      index === 1
        ? `<!-- Red Moon & Portal -->
           <circle cx="450" cy="400" r="180" fill="#ff1a1a" opacity="0.85"/>
           <circle cx="450" cy="400" r="140" fill="#090a0f"/>
           <polygon points="450,220 520,380 450,340 380,380" fill="#ff4444"/>
           <path d="M100 800 Q 450 650 800 800 L 800 1150 L 100 1150 Z" fill="#0b0d14"/>`
        : index === 2
        ? `<!-- Glowing Eyes & Aura -->
           <circle cx="450" cy="500" r="220" fill="none" stroke="${c.accent}" stroke-width="12" opacity="0.7"/>
           <ellipse cx="380" cy="480" rx="45" ry="18" fill="#ffffff"/>
           <ellipse cx="520" cy="480" rx="45" ry="18" fill="#ffffff"/>
           <circle cx="390" cy="480" r="16" fill="${c.accent}"/>
           <circle cx="510" cy="480" r="16" fill="${c.accent}"/>
           <!-- Sharp shadow cape -->
           <polygon points="450,600 250,1150 650,1150" fill="#001833" opacity="0.9"/>`
        : index === 3
        ? `<!-- Slash Attack -->
           <path d="M100 200 Q 500 700 850 400" stroke="${c.accent}" stroke-width="32" fill="none" stroke-linecap="round"/>
           <path d="M120 220 Q 500 690 830 420" stroke="#ffffff" stroke-width="14" fill="none" stroke-linecap="round"/>
           <polygon points="450,550 420,620 480,590" fill="#ffff00"/>
           <text x="320" y="320" fill="#ffffff" font-size="88" font-weight="900" font-family="impact, sans-serif" transform="rotate(-15 320 320)">SHHHKK!!</text>`
        : `<!-- Epic Climax Throne -->
           <polygon points="450,350 350,550 550,550" fill="${c.accent}" opacity="0.8"/>
           <rect x="300" y="600" width="300" height="400" fill="#121324" stroke="#ffffff" stroke-width="4"/>
           <text x="260" y="480" fill="#ffffff" font-size="64" font-weight="900" font-family="impact, sans-serif">THE MONARCH</text>`
    }

    <!-- Panel Badge -->
    <rect x="50" y="50" width="160" height="50" rx="8" fill="${c.accent}"/>
    <text x="130" y="84" fill="#ffffff" font-size="24" font-weight="bold" font-family="sans-serif" text-anchor="middle">PANEL ${index}</text>

    <!-- Manga Dialog Banner -->
    <rect x="50" y="980" width="800" height="160" rx="14" fill="#000000" opacity="0.85" stroke="${c.accent}" stroke-width="3"/>
    <text x="450" y="1040" fill="${c.accent}" font-size="34" font-weight="bold" font-family="sans-serif" text-anchor="middle">${title}</text>
    <text x="450" y="1090" fill="#e2e8f0" font-size="22" font-family="sans-serif" text-anchor="middle">${subtitle}</text>
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function generateSamplePanels(): PanelItem[] {
  return [
    {
      id: 'demo-panel-1',
      name: '01_portal_terbuka.png',
      url: createMangaSvg('PORTAL DIMENSI DINGIN', 'Monster Berdarah Dingin Menginvasi Kota', 'dark', 1)
    },
    {
      id: 'demo-panel-2',
      name: '02_mata_menyala.png',
      url: createMangaSvg('TATAPAN SANG RAJA', 'Pemuda Aura Biru Melangkah Maju', 'aura', 2)
    },
    {
      id: 'demo-panel-3',
      name: '03_tebasan_bayangan.png',
      url: createMangaSvg('TEBASAN DEWA KILAT', 'Satu Serangan Telak Membelah Komandan', 'action', 3)
    },
    {
      id: 'demo-panel-4',
      name: '04_tahta_bayangan.png',
      url: createMangaSvg('KEBANGKITAN TAHTA', 'Seluruh Medan Perang Tunduk Sempurna', 'epic', 4)
    }
  ];
}

/**
 * Generates synthetic speech-like narrative tone for immediate preview demo.
 * Uses Web Audio API AudioBuffer with modulated voice harmonics.
 */
export function createSyntheticNarrationAudio(totalSeconds: number = 14): { blob: Blob; url: string } {
  const sampleRate = 44100; // Standard 44.1 kHz audio
  const numSamples = Math.floor(sampleRate * totalSeconds);
  const buffer = new Float32Array(numSamples);

  // Cadence simulating clear natural Indonesian narration voice
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // speech rhythm: sentence pauses
    const sentencePos = t % 3.6;
    const isSpeech = sentencePos < 3.2 && (sentencePos % 0.45 < 0.32);
    if (isSpeech) {
      // Natural human fundamental frequency (f0 ~ 210-250 Hz)
      const f0 = 225 + Math.sin(t * 4.5) * 22;
      // Vocal harmonics with formant filtering
      const wave =
        Math.sin(2 * Math.PI * f0 * t) * 0.35 +
        Math.sin(2 * Math.PI * f0 * 2 * t) * 0.22 +
        Math.sin(2 * Math.PI * f0 * 3 * t) * 0.14 +
        Math.sin(2 * Math.PI * f0 * 4 * t) * 0.08;
      const noise = (Math.random() - 0.5) * 0.02;
      buffer[i] = (wave + noise) * 0.55;
    } else {
      buffer[i] = (Math.random() - 0.5) * 0.002; // ultra-soft ambient floor
    }
  }

  // Convert float PCM to WAV
  const wavBuffer = encodeWav(buffer, sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return { blob, url: URL.createObjectURL(blob) };
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
