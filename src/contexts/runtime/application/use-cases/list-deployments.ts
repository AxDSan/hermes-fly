import type {
  DeploymentListRow,
  DeploymentRegistryPort
} from "../ports/deployment-registry.port.js";

export type ListDeploymentsResult =
  | { kind: "empty" }
  | { kind: "rows"; rows: DeploymentListRow[] };

export class ListDeploymentsUseCase {
  constructor(private readonly deploymentRegistry: DeploymentRegistryPort) {}

  async execute(): Promise<ListDeploymentsResult> {
    const rows = await this.deploymentRegistry.listDeployments();
    if (rows.length === 0) {
      return { kind: "empty" };
    }

    return {
      kind: "rows",
      rows: [...rows]
    };
  }
}
