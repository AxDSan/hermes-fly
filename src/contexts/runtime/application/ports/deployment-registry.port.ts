export interface DeploymentListRow {
  appName: string;
  region: string;
  aiAccess: string;
  platform: string;
  machine: string;
  telegramBot: string;
  telegramLink: string;
}

export interface DeploymentRegistryPort {
  listDeployments(): Promise<DeploymentListRow[]>;
}
