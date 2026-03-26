import type { DeployConfig } from "../../application/ports/deploy-wizard.port.js";

const DEFAULT_VM_MEMORY_BY_SIZE: Record<string, string> = {
  "shared-cpu-1x": "256",
  "shared-cpu-2x": "512",
  "shared-cpu-4x": "2048",
  "shared-cpu-6x": "4096",
  "shared-cpu-8x": "8192",
  "performance-1x": "2048",
  "performance-2x": "4096",
  "performance-4x": "8192",
  "performance-8x": "16384"
};

export class TemplateWriter {
  async createBuildContext(config: DeployConfig, buildDir: string, opts?: { update?: boolean }): Promise<void> {
    const { copyFile, mkdir, readFile, writeFile } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    await mkdir(buildDir, { recursive: true });

    const templateDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../../templates");
    const isUpdate = opts?.update ?? false;
    const dockerfileName = isUpdate ? "Dockerfile.update.template" : "Dockerfile.template";
    const dockerfileTemplate = await readFile(join(templateDir, dockerfileName), "utf8");
    const flyTomlTemplate = await readFile(join(templateDir, "fly.toml.template"), "utf8");
    const entrypointTemplate = join(templateDir, "entrypoint.sh");
    const supervisorTemplate = join(templateDir, "gateway-supervisor.sh");
    const sitecustomizeTemplate = join(templateDir, "sitecustomize.py");
    const compatPolicy = await this.readCompatibilityPolicyVersion();
    const vmMemory = this.resolveVmMemory(config.vmSize);

    const preinstalledTools = config.preinstalledTools ?? [];
    const tools = new Set(preinstalledTools);

    // JavaScript/TypeScript Runtimes
    const installBun = tools.has("bun")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends unzip && \\
    curl -fsSL https://bun.sh/install | bash && \\
    ln -sf ~/.bun/bin/bun /usr/local/bin/bun`
      : "# Bun: not selected";
    const installDeno = tools.has("deno")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends unzip && \\
    curl -fsSL https://deno.land/install.sh | sh && \\
    ln -sf ~/.deno/bin/deno /usr/local/bin/deno`
      : "# Deno: not selected";

    // Package Managers
    const installPnpm = tools.has("pnpm")
      ? "RUN npm install -g pnpm"
      : "# pnpm: not selected";
    const installYarn = tools.has("yarn")
      ? "RUN npm install -g yarn"
      : "# Yarn: not selected";

    // Deployment Platforms
    const installVercel = tools.has("vercel")
      ? "RUN npm install -g vercel@latest"
      : "# Vercel CLI: not selected";
    const installRailway = tools.has("railway")
      ? "RUN npm install -g @railway/cli@latest"
      : "# Railway CLI: not selected";
    const installNetlify = tools.has("netlify")
      ? "RUN npm install -g netlify-cli"
      : "# Netlify CLI: not selected";

    // Cloud CLIs
    const installAwsCli = tools.has("awscli")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends unzip && \\
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \\
    unzip awscliv2.zip && ./aws/install && rm -rf awscliv2.zip aws`
      : "# AWS CLI: not selected";
    const installGcloud = tools.has("gcloud")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends apt-transport-https ca-certificates gnupg && \\
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \\
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add - && \\
    apt-get update && apt-get install -y google-cloud-cli`
      : "# Google Cloud SDK: not selected";
    const installAzureCli = tools.has("azurecli")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends apt-transport-https gnupg && \\
    curl -sL https://aka.ms/InstallAzureCLIDeb | bash`
      : "# Azure CLI: not selected";

    // Container & Kubernetes
    const installDocker = tools.has("docker")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates gnupg && \\
    install -m 0755 -d /etc/apt/keyrings && \\
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \\
    chmod a+r /etc/apt/keyrings/docker.gpg && \\
    echo "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \\
    \"$(. /etc/os-release && echo \"$VERSION_CODENAME\")\" stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \\
    apt-get update && apt-get install -y docker-ce-cli`
      : "# Docker CLI: not selected";
    const installKubectl = tools.has("kubectl")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends apt-transport-https ca-certificates curl && \\
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg && \\
    echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | tee /etc/apt/sources.list.d/kubernetes.list && \\
    apt-get update && apt-get install -y kubectl`
      : "# kubectl: not selected";
    const installHelm = tools.has("helm")
      ? `RUN curl https://baltocdn.com/helm/signing.asc | gpg --dearmor -o /usr/share/keyrings/helm.gpg && \\
    apt-get install -y --no-install-recommends apt-transport-https && \\
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" | tee /etc/apt/sources.list.d/helm-stable-debian.list && \\
    apt-get update && apt-get install -y helm`
      : "# Helm: not selected";

    // Infrastructure as Code
    const installTerraform = tools.has("terraform")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends gnupg software-properties-common && \\
    wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \\
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list && \\
    apt-get update && apt-get install -y terraform`
      : "# Terraform: not selected";
    const installPulumi = tools.has("pulumi")
      ? "RUN curl -fsSL https://get.pulumi.com | sh && ln -sf ~/.pulumi/bin/pulumi /usr/local/bin/pulumi"
      : "# Pulumi: not selected";
    const installPacker = tools.has("packer")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends gnupg software-properties-common && \\
    wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \\
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list && \\
    apt-get update && apt-get install -y packer`
      : "# Packer: not selected";
    const installAnsible = tools.has("ansible")
      ? "RUN apt-get update && apt-get install -y --no-install-recommends ansible"
      : "# Ansible: not selected";

    // Version Control
    const installGh = tools.has("gh")
      ? `RUN apt-get update && apt-get install -y --no-install-recommends gh || \\
    (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \\
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \\
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \\
    apt-get update && apt-get install -y gh)`
      : "# GitHub CLI: not selected";
    const installGlab = tools.has("glab")
      ? "RUN curl -sL https://j.mp/glab-cli | sh && mv /usr/local/bin/glab /usr/local/bin/glab 2>/dev/null || true"
      : "# GitLab CLI: not selected";

    // Utilities
    const installFzf = tools.has("fzf")
      ? "RUN apt-get update && apt-get install -y --no-install-recommends fzf"
      : "# fzf: not selected";
    const installHttpie = tools.has("httpie")
      ? "RUN apt-get update && apt-get install -y --no-install-recommends httpie"
      : "# HTTPie: not selected";
    const installJq = tools.has("jq")
      ? "RUN apt-get update && apt-get install -y --no-install-recommends jq"
      : "# jq: not selected";
    const installYq = tools.has("yq")
      ? "RUN wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && chmod +x /usr/local/bin/yq"
      : "# yq: not selected";

    const dockerfile = this.replaceAll(dockerfileTemplate, {
      HERMES_VERSION: config.hermesRef,
      HERMES_CHANNEL: config.channel,
      HERMES_COMPAT_POLICY: compatPolicy,
      INSTALL_BUN_CMD: installBun,
      INSTALL_DENO_CMD: installDeno,
      INSTALL_PNPM_CMD: installPnpm,
      INSTALL_YARN_CMD: installYarn,
      INSTALL_VERCEL_CMD: installVercel,
      INSTALL_RAILWAY_CMD: installRailway,
      INSTALL_NETLIFY_CMD: installNetlify,
      INSTALL_AWSCLI_CMD: installAwsCli,
      INSTALL_GCLOUD_CMD: installGcloud,
      INSTALL_AZURECLI_CMD: installAzureCli,
      INSTALL_DOCKER_CMD: installDocker,
      INSTALL_KUBECTL_CMD: installKubectl,
      INSTALL_HELM_CMD: installHelm,
      INSTALL_TERRAFORM_CMD: installTerraform,
      INSTALL_PULUMI_CMD: installPulumi,
      INSTALL_PACKER_CMD: installPacker,
      INSTALL_ANSIBLE_CMD: installAnsible,
      INSTALL_GH_CMD: installGh,
      INSTALL_GLAB_CMD: installGlab,
      INSTALL_FZF_CMD: installFzf,
      INSTALL_HTTPIE_CMD: installHttpie,
      INSTALL_JQ_CMD: installJq,
      INSTALL_YQ_CMD: installYq,
    });
    await writeFile(join(buildDir, "Dockerfile"), dockerfile, "utf8");

    const flyToml = this.replaceAll(flyTomlTemplate, {
      APP_NAME: config.appName,
      REGION: config.region,
      VM_SIZE: config.vmSize,
      VM_MEMORY: vmMemory,
      VOLUME_NAME: "hermes_data",
      VOLUME_SIZE: String(config.volumeSize)
    });
    await writeFile(join(buildDir, "fly.toml"), flyToml, "utf8");
    await copyFile(entrypointTemplate, join(buildDir, "entrypoint.sh"));
    await copyFile(supervisorTemplate, join(buildDir, "gateway-supervisor.sh"));
    await copyFile(sitecustomizeTemplate, join(buildDir, "sitecustomize.py"));

    // Copy additional files needed for update builds
    if (isUpdate) {
      const patchWhatsappTemplate = join(templateDir, "patch-whatsapp-bridge.py");
      try {
        await copyFile(patchWhatsappTemplate, join(buildDir, "patch-whatsapp-bridge.py"));
      } catch {
        // Patch file is optional for updates
      }
    }
  }

  private replaceAll(template: string, replacements: Record<string, string>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(replacements)) {
      rendered = rendered.replaceAll(`{{${key}}}`, value);
    }
    return rendered;
  }

  private resolveVmMemory(vmSize: string): string {
    return DEFAULT_VM_MEMORY_BY_SIZE[vmSize] ?? "512";
  }

  private async readCompatibilityPolicyVersion(): Promise<string> {
    const { readFile } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const snapshotPath = join(dirname(fileURLToPath(import.meta.url)), "../../../../../data/reasoning-snapshot.json");
    try {
      const raw = await readFile(snapshotPath, "utf8");
      const parsed = JSON.parse(raw) as { policy_version?: unknown };
      const value = String(parsed.policy_version ?? "").trim();
      return value.length > 0 ? value : "unknown";
    } catch {
      return "unknown";
    }
  }
}
