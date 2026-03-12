export interface DeploymentListRow {
  appName: string;
  region: string;
  platform: string;
  machine: string;
}

export interface DeploymentRegistryPort {
  listDeployments(): Promise<DeploymentListRow[]>;
}
