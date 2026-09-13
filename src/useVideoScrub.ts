import { useEffect, useRef, useState, useCallback } from 'react';
import * as MP4BoxModule from 'mp4box';

const MP4Box = (MP4BoxModule as any).default || MP4BoxModule;

interface FrameBankItem {
  ts: number; // in microseconds
  blob: Blob; // webp image
}

const LERP_TAU = 8;
const SNAP = 0.002;
const LRU_MAX = 24;
const LEAD = 24;
const WATCHDOG = 60000;

export function useVideoScrub(videoSrc: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [canvasLive, setCanvasLive] = useState(false);
  const [dur, setDur] = useState(0);

  // Mutable refs for high-frequency rAF loop
  const durRef = useRef(0);
  const currentRef = useRef(0);
  const targetRef = useRef(0);
  const bankRef = useRef<FrameBankItem[]>([]);
  const lruRef = useRef<Map<number, ImageBitmap>>(new Map());
  const loadingIndicesRef = useRef<Set<number>>(new Set());
  const lastRequestedIndexRef = useRef<number>(-1);
  const readyRef = useRef(false);
  const revertedRef = useRef(false);
  const paintedRef = useRef(false);
  const buildingRef = useRef(false);
  const canvasLiveRef = useRef(false);

  // Binary search for nearest frame in bank by microseconds
  const findNearestIndex = useCallback((targetMicroseconds: number): number => {
    const bank = bankRef.current;
    if (bank.length === 0) return -1;
    let low = 0;
    let high = bank.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (bank[mid].ts === targetMicroseconds) {
        return mid;
      } else if (bank[mid].ts < targetMicroseconds) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (low >= bank.length) return bank.length - 1;
    if (high < 0) return 0;

    return Math.abs(bank[low].ts - targetMicroseconds) < Math.abs(bank[high].ts - targetMicroseconds)
      ? low
      : high;
  }, []);

  // Evict oldest entries from LRU
  const evictLRU = useCallback(() => {
    const lru = lruRef.current;
    while (lru.size > LRU_MAX) {
      const oldestKey = lru.keys().next().value;
      if (oldestKey !== undefined) {
        const bmp = lru.get(oldestKey);
        if (bmp) {
          try {
            bmp.close();
          } catch {}
        }
        lru.delete(oldestKey);
      } else {
        break;
      }
    }
  }, []);

  // Request an ImageBitmap for a given frame bank index
  const requestBitmap = useCallback((index: number) => {
    const bank = bankRef.current;
    if (index < 0 || index >= bank.length) return;
    const lru = lruRef.current;
    if (lru.has(index) || loadingIndicesRef.current.has(index)) return;

    loadingIndicesRef.current.add(index);
    createImageBitmap(bank[index].blob)
      .then((bmp) => {
        loadingIndicesRef.current.delete(index);
        lru.set(index, bmp);
        evictLRU();

        // If this index is currently needed for the active paint, paint it now
        if (lastRequestedIndexRef.current === index) {
          const canvas = canvasRef.current;
          if (canvas) {
            if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
              canvas.width = bmp.width;
              canvas.height = bmp.height;
            }
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(bmp, 0, 0);
              paintedRef.current = true;
              if (!canvasLiveRef.current) {
                canvasLiveRef.current = true;
                setCanvasLive(true);
              }
            }
          }
        }
      })
      .catch((err) => {
        loadingIndicesRef.current.delete(index);
        console.warn('createImageBitmap error:', err);
      });
  }, [evictLRU]);

  // Pre-warm neighboring frames in LRU: around i-1 .. i+2
  const warmLRU = useCallback((centerIdx: number) => {
    const bank = bankRef.current;
    for (let offset = -1; offset <= 2; offset++) {
      const targetIdx = centerIdx + offset;
      if (targetIdx >= 0 && targetIdx < bank.length) {
        requestBitmap(targetIdx);
      }
    }
  }, [requestBitmap]);

  // Draw nearest frame from decoded frame bank
  const drawNearestFrame = useCallback((currentTimeSeconds: number) => {
    const bank = bankRef.current;
    if (bank.length === 0) return;

    const targetTs = currentTimeSeconds * 1_000_000;
    const idx = findNearestIndex(targetTs);
    if (idx < 0 || idx >= bank.length) return;

    lastRequestedIndexRef.current = idx;
    const lru = lruRef.current;

    if (lru.has(idx)) {
      const cached = lru.get(idx);
      if (cached) {
        // Move to most-recently-used
        lru.delete(idx);
        lru.set(idx, cached);

        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== cached.width || canvas.height !== cached.height) {
            canvas.width = cached.width;
            canvas.height = cached.height;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(cached, 0, 0);
            paintedRef.current = true;
            if (!canvasLiveRef.current) {
              canvasLiveRef.current = true;
              setCanvasLive(true);
            }
          }
        }
      }
    } else {
      requestBitmap(idx);
    }

    warmLRU(idx);
  }, [findNearestIndex, requestBitmap, warmLRU]);

  // Calculate current scroll progress: p = clamp(0, 1, window.scrollY / (container.offsetHeight - window.innerHeight))
  const getProgress = useCallback((): number => {
    const container = containerRef.current;
    if (!container) return 0;
    const maxScroll = container.offsetHeight - window.innerHeight;
    if (maxScroll <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / maxScroll));
  }, []);

  // Update duration from video element when metadata is ready
  const handleVideoLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video && video.duration && !durRef.current) {
      durRef.current = video.duration;
      setDur(video.duration);
    }
  }, []);

  // Set up video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
      if (video.duration && !durRef.current) {
        durRef.current = video.duration;
        setDur(video.duration);
      }
    }
    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
      }
    };
  }, [handleVideoLoadedMetadata]);

  // rAF scrubbing loop
  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const loop = (now: number) => {
      const deltaSeconds = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.1, deltaSeconds);

      const p = getProgress();
      setScrollProgress(p);

      const duration = durRef.current;
      if (duration > 0) {
        const target = p * duration;
        targetRef.current = target;

        let curr = currentRef.current;
        if (mediaQuery.matches) {
          curr = target;
        } else {
          curr += (target - curr) * (1 - Math.exp(-dt * LERP_TAU));
          if (Math.abs(target - curr) < SNAP) {
            curr = target;
          }
        }
        currentRef.current = curr;

        if (readyRef.current && bankRef.current.length > 0 && !revertedRef.current) {
          drawNearestFrame(curr);
        } else {
          // Fallback: if not seeking and abs(video.currentTime - current) > 0.01, set video.currentTime = current
          const video = videoRef.current;
          if (video && !video.seeking && Math.abs(video.currentTime - curr) > 0.01) {
            video.currentTime = curr;
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [getProgress, drawNearestFrame]);

  // Build frame bank after window load
  useEffect(() => {
    let aborted = false;
    let watchdogTimer: any = null;

    const revertToFallback = () => {
      console.warn('Reverting to video seeking fallback');
      revertedRef.current = true;
      readyRef.current = false;
      canvasLiveRef.current = false;
      setCanvasLive(false);
    };

    // 60s watchdog timer
    watchdogTimer = setTimeout(() => {
      if (!readyRef.current && !revertedRef.current) {
        revertToFallback();
      }
    }, WATCHDOG);

    const startBuildingBank = async () => {
      if (typeof window === 'undefined') return;

      // Skip if reduced motion or no VideoDecoder
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced || typeof window.VideoDecoder === 'undefined') {
        console.info('Skipping WebCodecs frame extraction (reduced-motion or unsupported VideoDecoder)');
        return;
      }

      if (buildingRef.current || readyRef.current || revertedRef.current) return;
      buildingRef.current = true;

      try {
        // 1. Fetch CloudFront MP4 as ArrayBuffer with CORS
        const response = await fetch(videoSrc, { mode: 'cors' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} when fetching video`);
        }
        const buffer = await response.arrayBuffer();
        if (aborted) return;

        // 2. Parse with MP4Box
        const mp4boxFile = MP4Box.createFile();
        let videoTrackInfo: any = null;
        let samplesList: any[] = [];
        let extradataDescription: Uint8Array | undefined = undefined;

        await new Promise<void>((resolve, reject) => {
          mp4boxFile.onReady = (info: any) => {
            if (!info.videoTracks || info.videoTracks.length === 0) {
              reject(new Error('No video track found in MP4'));
              return;
            }
            videoTrackInfo = info.videoTracks[0];

            const trackDuration =
              videoTrackInfo.duration && videoTrackInfo.timescale
                ? videoTrackInfo.duration / videoTrackInfo.timescale
                : info.duration && info.timescale
                ? info.duration / info.timescale
                : 0;

            if (trackDuration > 0) {
              durRef.current = trackDuration;
              setDur(trackDuration);
            }

            // Extract avcC / hvcC / vpcC / av1C box
            try {
              const trak = mp4boxFile.getTrackById(videoTrackInfo.id);
              if (trak?.mdia?.minf?.stbl?.stsd?.entries) {
                for (const entry of trak.mdia.minf.stbl.stsd.entries) {
                  const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
                  if (box) {
                    const stream = new (MP4Box.DataStream || (MP4BoxModule as any).DataStream)(
                      undefined,
                      0,
                      (MP4Box.DataStream || (MP4BoxModule as any).DataStream).BIG_ENDIAN
                    );
                    box.write(stream);
                    // Remove the 8-byte box header
                    extradataDescription = new Uint8Array(stream.buffer, 8);
                    break;
                  }
                }
              }
            } catch (err) {
              console.warn('Could not extract codec extradata:', err);
            }

            // Request extraction of all samples
            mp4boxFile.setExtractionOptions(videoTrackInfo.id, null, { nbSamples: 1000 });
            mp4boxFile.start();
          };

          mp4boxFile.onSamples = (id: number, user: any, samples: any[]) => {
            samplesList.push(...samples);
          };

          mp4boxFile.onError = (err: any) => {
            reject(new Error(String(err)));
          };

          const fileBuffer = buffer as any;
          fileBuffer.fileStart = 0;
          try {
            mp4boxFile.appendBuffer(fileBuffer);
            mp4boxFile.flush();
            resolve();
          } catch (e) {
            reject(e);
          }
        });

        if (aborted || !videoTrackInfo || samplesList.length === 0) return;

        // 3. Configure VideoDecoder with retry logic (hardwareAcceleration: prefer-hardware -> prefer-software)
        const runDecoder = async (hardwareAcceleration: 'prefer-hardware' | 'prefer-software'): Promise<boolean> => {
          return new Promise<boolean>(async (resolveDecode) => {
            let inFlight = 0;
            let decoderFailed = false;
            const decodedBank: FrameBankItem[] = [];

            const handleFrame = async (frame: VideoFrame) => {
              inFlight++;
              try {
                const width = frame.displayWidth || 1920;
                const height = frame.displayHeight || 1080;
                const ts = frame.timestamp;

                let blob: Blob | null = null;
                if (typeof OffscreenCanvas !== 'undefined') {
                  const off = new OffscreenCanvas(width, height);
                  const ctx = off.getContext('2d');
                  ctx?.drawImage(frame, 0, 0, width, height);
                  blob = await off.convertToBlob({ type: 'image/webp', quality: 0.82 });
                } else {
                  const off = document.createElement('canvas');
                  off.width = width;
                  off.height = height;
                  const ctx = off.getContext('2d');
                  ctx?.drawImage(frame, 0, 0, width, height);
                  blob = await new Promise<Blob | null>((res) => {
                    off.toBlob((b) => res(b), 'image/webp', 0.82);
                  });
                }

                if (blob) {
                  decodedBank.push({ ts, blob });
                }
              } catch (e) {
                console.warn('Frame convert error:', e);
              } finally {
                frame.close();
                inFlight--;
              }
            };

            let decoder: VideoDecoder;
            try {
              decoder = new VideoDecoder({
                output: handleFrame,
                error: (e) => {
                  console.warn(`VideoDecoder error (${hardwareAcceleration}):`, e);
                  decoderFailed = true;
                  try {
                    decoder.close();
                  } catch {}
                  resolveDecode(false);
                },
              });

              const config: VideoDecoderConfig = {
                codec: videoTrackInfo.codec,
                hardwareAcceleration,
              };
              if (extradataDescription) {
                config.description = extradataDescription;
              }

              decoder.configure(config);

              // 4. Feed samples with LEAD throttling so decode doesn't outrun blob encoding
              for (let i = 0; i < samplesList.length; i++) {
                if (aborted || decoderFailed) break;

                while (inFlight >= LEAD && !aborted && !decoderFailed) {
                  await new Promise((r) => setTimeout(r, 6));
                }

                if (decoder.state !== 'configured') break;

                const sample = samplesList[i];
                const timestamp = Math.round((sample.pts * 1_000_000) / sample.timescale);
                const duration = Math.round((sample.duration * 1_000_000) / sample.timescale);

                const chunk = new EncodedVideoChunk({
                  type: sample.is_sync ? 'key' : 'delta',
                  timestamp,
                  duration,
                  data: sample.data,
                });

                decoder.decode(chunk);
              }

              if (!decoderFailed && !aborted) {
                await decoder.flush();
                // Wait for all in-flight frame conversions to complete
                while (inFlight > 0 && !aborted) {
                  await new Promise((r) => setTimeout(r, 10));
                }

                if (decodedBank.length > 0) {
                  decodedBank.sort((a, b) => a.ts - b.ts);
                  bankRef.current = decodedBank;
                  readyRef.current = true;
                  buildingRef.current = false;
                  resolveDecode(true);
                  return;
                }
              }
            } catch (err) {
              console.warn('Decoder run threw:', err);
              resolveDecode(false);
              return;
            }

            resolveDecode(false);
          });
        };

        // First try prefer-hardware
        let success = await runDecoder('prefer-hardware');
        // If hardware decode fails, retry once with hardwareAcceleration: 'prefer-software'
        if (!success && !aborted) {
          console.info('Retrying VideoDecoder with prefer-software...');
          success = await runDecoder('prefer-software');
        }

        if (!success && !aborted) {
          revertToFallback();
        }
      } catch (err) {
        console.warn('Failed to build frame bank:', err);
        if (!aborted) {
          revertToFallback();
        }
      } finally {
        buildingRef.current = false;
      }
    };

    if (document.readyState === 'complete') {
      startBuildingBank();
    } else {
      window.addEventListener('load', startBuildingBank, { once: true });
    }

    return () => {
      aborted = true;
      clearTimeout(watchdogTimer);
      // Clean up LRU bitmaps
      lruRef.current.forEach((bmp) => {
        try {
          bmp.close();
        } catch {}
      });
      lruRef.current.clear();
    };
  }, [videoSrc]);

  return {
    videoRef,
    canvasRef,
    containerRef,
    scrollProgress,
    canvasLive,
    dur,
  };
}
