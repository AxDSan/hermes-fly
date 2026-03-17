export interface DeploymentListRow {
  appName: string;
  region: string;
  platform: string;
  machine: string;
  telegramBot: string;
  telegramLink: string;
}

export interface DeploymentRegistryPort {
  listDeployments(): Promise<DeploymentListRow[]>;
}
