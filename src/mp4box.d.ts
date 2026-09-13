declare module 'mp4box' {
  export interface MP4MediaTrack {
    id: number;
    created: Date;
    modified: Date;
    volume: number;
    track_width: number;
    track_height: number;
    timescale: number;
    duration: number;
    bitrate: number;
    codec: string;
    video?: {
      width: number;
      height: number;
    };
    audio?: {
      channel_count: number;
      sample_rate: number;
      sample_size: number;
    };
  }

  export interface MP4Info {
    duration: number;
    timescale: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    brands: string[];
    tracks: MP4MediaTrack[];
    videoTracks: MP4MediaTrack[];
    audioTracks: MP4MediaTrack[];
  }

  export interface MP4Sample {
    number: number;
    track_id: number;
    description: any;
    is_rap: boolean;
    is_sync: boolean;
    timescale: number;
    dts: number;
    pts: number;
    duration: number;
    size: number;
    data: Uint8Array;
    cts?: number;
  }

  export interface MP4File {
    onReady?: (info: MP4Info) => void;
    onError?: (e: string) => void;
    onSamples?: (id: number, user: any, samples: MP4Sample[]) => void;
    appendBuffer(data: ArrayBuffer & { fileStart?: number }): number;
    flush(): void;
    start(): void;
    stop(): void;
    setExtractionOptions(id: number, user?: any, options?: { nbSamples?: number; rapAlignment?: boolean }): void;
    getTrackById(id: number): any;
  }

  export class DataStream {
    static BIG_ENDIAN: boolean;
    buffer: ArrayBuffer;
    position: number;
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean);
  }

  export function createFile(): MP4File;

  export class Log {
    static setLogLevel(logLevel: any): void;
  }
}
