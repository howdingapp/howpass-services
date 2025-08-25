export interface VideoFile {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
}

export interface MergeRequest {
  files: VideoFile[];
  outputFormat: 'mp4' | 'avi' | 'mov' | 'mkv';
  quality?: 'low' | 'medium' | 'high';
  resolution?: string;
  fps?: number;
  audioCodec?: string;
  videoCodec?: string;
}

export interface MergeResponse {
  success: boolean;
  outputFile?: string;
  outputPath?: string;
  duration?: number;
  size?: number;
  error?: string;
  jobId: string;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  outputFile?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FFmpegOptions {
  inputFiles: string[];
  outputFile: string;
  format: string;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  fps?: number;
  quality?: string;
  threads?: number;
  timeout?: number;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  audioCodec?: string;
  videoCodec?: string;
  format: string;
}

// Export des types de conversation
export * from './conversation'; 