import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 MB limit
  }
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Endpoint: Auto-compress to MP4 with FFmpeg using original audio (preserves 100% natural pitch & quality)
  app.post(
    '/api/compress-mp4',
    upload.fields([
      { name: 'video', maxCount: 1 },
      { name: 'audio', maxCount: 1 }
    ]),
    async (req, res) => {
      const crf = Math.min(32, Math.max(18, Number(req.query.crf) || 23));
      const preset = String(req.query.preset || 'veryfast');
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const outputPath = path.join(os.tmpdir(), `compressed_${id}.mp4`);

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      let videoPath: string | null = files?.['video']?.[0]?.path || null;
      let audioPath: string | null = files?.['audio']?.[0]?.path || null;
      const createdTempFiles: string[] = [];

      try {
        // Fallback: If sent as raw binary body instead of multipart FormData
        if (!videoPath) {
          const rawPath = path.join(os.tmpdir(), `raw_input_${id}.webm`);
          createdTempFiles.push(rawPath);
          const writeStream = fs.createWriteStream(rawPath);
          await new Promise<void>((resolve, reject) => {
            req.pipe(writeStream);
            writeStream.on('finish', () => resolve());
            writeStream.on('error', reject);
            req.on('error', reject);
          });
          const rawStat = await fs.promises.stat(rawPath);
          if (rawStat.size === 0) {
            throw new Error('Data rekaman video kosong');
          }
          videoPath = rawPath;
        }

        // Build FFmpeg arguments:
        // Multiplexing the original voiceover file directly preserves 100% natural vocal pitch
        // without any WebAudio sample-rate mismatch, distortion, or bass/pitch-drop.
        const ffmpegArgs: string[] = ['-y', '-i', videoPath];

        if (audioPath) {
          ffmpegArgs.push('-i', audioPath);
          ffmpegArgs.push(
            '-map', '0:v:0',
            '-map', '1:a:0?',
            '-c:v', 'libx264',
            '-preset', preset,
            '-crf', String(crf),
            '-pix_fmt', 'yuv420p',
            '-filter:v', 'fps=30',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-shortest',
            outputPath
          );
        } else {
          ffmpegArgs.push(
            '-c:v', 'libx264',
            '-preset', preset,
            '-crf', String(crf),
            '-pix_fmt', 'yuv420p',
            '-filter:v', 'fps=30',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            outputPath
          );
        }

        await new Promise<void>((resolve, reject) => {
          const proc = spawn('ffmpeg', ffmpegArgs);
          let stderr = '';
          proc.stderr.on('data', (d) => {
            stderr += d.toString();
          });
          proc.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              console.error('FFmpeg compress error code:', code, stderr.slice(-400));
              reject(new Error(`Gagal kompresi FFmpeg (kode ${code})`));
            }
          });
          proc.on('error', reject);
        });

        const outStat = await fs.promises.stat(outputPath);
        const originalTotalSize =
          (videoPath ? (await fs.promises.stat(videoPath).catch(() => ({ size: 0 }))).size : 0) +
          (audioPath ? (await fs.promises.stat(audioPath).catch(() => ({ size: 0 }))).size : 0);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="manga_recap.mp4"');
        res.setHeader('X-Original-Size', String(originalTotalSize));
        res.setHeader('X-Compressed-Size', String(outStat.size));
        res.setHeader('Content-Length', String(outStat.size));

        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);

        const cleanup = () => {
          if (videoPath) fs.promises.unlink(videoPath).catch(() => {});
          if (audioPath) fs.promises.unlink(audioPath).catch(() => {});
          createdTempFiles.forEach((p) => fs.promises.unlink(p).catch(() => {}));
          fs.promises.unlink(outputPath).catch(() => {});
        };
        res.on('finish', cleanup);
        res.on('close', cleanup);
      } catch (err: any) {
        console.error('Compress endpoint failed:', err);
        if (videoPath) fs.promises.unlink(videoPath).catch(() => {});
        if (audioPath) fs.promises.unlink(audioPath).catch(() => {});
        createdTempFiles.forEach((p) => fs.promises.unlink(p).catch(() => {}));
        fs.promises.unlink(outputPath).catch(() => {});
        if (!res.headersSent) {
          res.status(500).json({ error: err.message || 'Gagal mengompres video ke MP4' });
        }
      }
    }
  );

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health endpoint matching user's frontend fetch('/health')
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      gpu: false,
      mp4CompressionAvailable: true,
      aiSyncAvailable: !!process.env.GEMINI_API_KEY,
      message: 'Server Manga Recap Automation & MP4 Compressor Aktif'
    });
  });

  // Auto-sync endpoint
  app.post('/api/autosync', async (req, res) => {
    try {
      const { paragraphs, audioBase64, mimeType, audioDuration } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0) {
        return res.status(400).json({ error: 'Naskah paragraf kosong' });
      }

      // If audioBase64 and API key are available, use Gemini multimodal to align
      if (apiKey && audioBase64) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const prompt = `Anda adalah asisten video editor manga rekap profesional.
Berikut adalah ${paragraphs.length} paragraf naskah narasi yang diucapkan berurutan:
${paragraphs.map((p: string, i: number) => `Panel ${i + 1}: "${p}"`).join('\n')}

Durasi audio adalah sekitar ${audioDuration ? `${Number(audioDuration).toFixed(1)} detik` : 'tidak diketahui'}.
Tugas Anda: Analisis audio ini dan berikan perkiraan timestamp (dalam detik) kapan masing-masing paragraf narasi dimulai dan durasinya.
Respon HANYA dengan JSON valid tanpa tanda backtick, persis format berikut:
{
  "starts": [0.0, 3.2, 7.5],
  "durations": [3.2, 4.3, 5.0],
  "confidence": [0.95, 0.90, 0.88]
}
Pastikan panjang array starts, durations, dan confidence adalah tepat ${paragraphs.length} elemen.`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType || 'audio/mp3',
                      data: audioBase64
                    }
                  },
                  { text: prompt }
                ]
              }
            ],
            config: {
              responseMimeType: 'application/json'
            }
          });

          const rawText = response.text?.trim() || '{}';
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed.durations) && parsed.durations.length === paragraphs.length) {
            return res.json({
              success: true,
              starts: parsed.starts,
              durations: parsed.durations,
              confidence: parsed.confidence || paragraphs.map(() => 0.9),
              source: 'gemini-ai'
            });
          }
        } catch (geminiError: any) {
          console.warn('Gemini auto-sync fallback to heuristic:', geminiError.message);
        }
      }

      // Heuristic fallback alignment based on word counts and audio duration
      const totalAudioLen = Number(audioDuration) > 0 ? Number(audioDuration) : paragraphs.length * 4.0;
      const wordCounts = paragraphs.map(p => Math.max(1, p.trim().split(/\s+/).filter(Boolean).length));
      const totalWords = wordCounts.reduce((a, b) => a + b, 0);

      const starts: number[] = [];
      const durations: number[] = [];
      const confidence: number[] = [];
      let accumTime = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        starts.push(Number(accumTime.toFixed(2)));
        const portion = wordCounts[i] / totalWords;
        const panelDur = Math.max(0.4, Number((portion * totalAudioLen).toFixed(2)));
        durations.push(panelDur);
        confidence.push(0.85);
        accumTime += panelDur;
      }

      // Adjust last panel so total equals totalAudioLen
      if (durations.length > 0) {
        const sumDur = durations.reduce((a, b) => a + b, 0);
        if (Math.abs(sumDur - totalAudioLen) > 0.1) {
          durations[durations.length - 1] = Math.max(
            0.5,
            Number((durations[durations.length - 1] + (totalAudioLen - sumDur)).toFixed(2))
          );
        }
      }

      return res.json({
        success: true,
        starts,
        durations,
        confidence,
        source: 'smart-heuristic'
      });
    } catch (err: any) {
      console.error('Autosync endpoint error:', err);
      res.status(500).json({ error: err.message || 'Gagal autosync' });
    }
  });

  // Mount Vite or static dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Manga Recap Server ready on http://0.0.0.0:${PORT}`);
  });
}

startServer();
