declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    input(path: string): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    output(path: string): FfmpegCommand;
    timeout(seconds: number): FfmpegCommand;
    on(event: 'progress', callback: (progress: any) => void): FfmpegCommand;
    on(event: 'end', callback: () => void): FfmpegCommand;
    on(event: 'error', callback: (error: any) => void): FfmpegCommand;
    on(event: 'stderr', callback: (stderrLine: any) => void): FfmpegCommand;
    run(): void;
  }

  interface FfmpegStatic {
    (): FfmpegCommand;
    ffprobe(path: string, callback: (error: any, metadata: any) => void): void;
  }

  const ffmpeg: FfmpegStatic;
  export = ffmpeg;
} 