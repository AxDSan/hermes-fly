export interface LogsReadResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface StreamLogsOptions {
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export interface LogsReaderPort {
  getLogs(appName: string): Promise<LogsReadResult>;
  streamLogs(appName: string, options?: StreamLogsOptions): Promise<{ exitCode: number }>;
}
