// Configuration globale pour les tests
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.SUPABASE_BUCKET_NAME = 'test-bucket';
process.env.TEMP_PATH = './test-temp';
process.env.FFMPEG_TIMEOUT = '10000';
process.env.FFMPEG_THREADS = '1';
process.env.CORS_ORIGIN = 'http://localhost:3000';

// Mock pour fs-extra
jest.mock('fs-extra', () => ({
  ensureDirSync: jest.fn(),
  pathExists: jest.fn().mockResolvedValue(true),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('test')),
  remove: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ mtime: new Date() }),
  ensureDir: jest.fn().mockResolvedValue(undefined),
}));

// Mock pour fluent-ffmpeg
jest.mock('fluent-ffmpeg', () => {
  const mockCommand = {
    input: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    timeout: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    run: jest.fn(),
  };

  return jest.fn(() => mockCommand);
});

// Mock pour @supabase/supabase-js
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        download: jest.fn().mockResolvedValue({
          data: new ArrayBuffer(8),
          error: null,
        }),
        upload: jest.fn().mockResolvedValue({
          data: { path: 'test/path' },
          error: null,
        }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://test.com/video.mp4' },
        }),
        remove: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
  })),
}));

// Mock pour uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
})); 