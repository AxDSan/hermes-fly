import type { FlyctlPort } from "../../../../adapters/flyctl.js";
import type { LogsReadResult, LogsReaderPort, StreamLogsOptions } from "../../application/ports/logs-reader.port.js";

export class FlyLogsReader implements LogsReaderPort {
  constructor(private readonly flyctl: FlyctlPort) {}

  async getLogs(appName: string): Promise<LogsReadResult> {
    return this.flyctl.getAppLogs(appName);
  }

  async streamLogs(appName: string, options?: StreamLogsOptions): Promise<{ exitCode: number }> {
    return this.flyctl.streamAppLogs(appName, {
      onStdoutChunk: options?.onStdoutChunk,
      onStderrChunk: options?.onStderrChunk
    });
  }
}
