export interface AgentConsolePort {
  openConsole(appName: string, hermesArgs: string[]): Promise<{ ok: boolean; error?: string }>;
}
