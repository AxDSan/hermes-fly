import type { LogsReadResult, LogsReaderPort, StreamLogsOptions } from "../ports/logs-reader.port.js";

export class ShowLogsUseCase {
  constructor(private readonly reader: LogsReaderPort) {}

  async execute(appName: string): Promise<LogsReadResult> {
    return this.reader.getLogs(appName);
  }

  async stream(appName: string, options?: StreamLogsOptions): Promise<{ exitCode: number }> {
    return this.reader.streamLogs(appName, options);
  }
}
