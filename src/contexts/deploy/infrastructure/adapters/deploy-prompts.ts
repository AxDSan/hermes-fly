import { createInterface } from "node:readline/promises";

const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;

export interface DeploySelectChoiceParams<T> {
  options: Array<{ value: T; disabled?: boolean }>;
  initialIndex: number;
  render: (activeIndex: number) => string;
  renderFallback?: (activeIndex: number) => string;
  fallbackPrompt?: string;
}

export interface DeployMultiSelectChoiceParams<T> {
  options: Array<{ value: T; disabled?: boolean }>;
  initialIndex: number;
  initialSelectedIndices?: number[];
  render: (activeIndex: number, selectedIndices: number[]) => string;
  renderFallback?: (activeIndex: number, selectedIndices: number[]) => string;
  fallbackPrompt?: string;
  normalizeSelectedIndices?: (selectedIndices: number[], activeIndex: number) => number[];
  validateSelectedIndices?: (selectedIndices: number[]) => string | undefined;
}

export interface DeployPromptPort {
  isInteractive(): boolean;
  columns(): number | undefined;
  outputStream?(): NodeJS.WriteStream | undefined;
  write(message: string): void;
  ask(message: string): Promise<string>;
  askSecret(message: string): Promise<string>;
  selectChoice?<T>(params: DeploySelectChoiceParams<T>): Promise<T>;
  selectManyChoices?<T>(params: DeployMultiSelectChoiceParams<T>): Promise<T[]>;
  pause(message: string): Promise<void>;
}

type InputToken =
  | { type: "backspace" }
  | { type: "ctrl-c" }
  | { type: "digit"; value: string }
  | { type: "down" }
  | { type: "enter" }
  | { type: "separator" }
  | { type: "space" }
  | { type: "up" };

export class ReadlineDeployPrompts implements DeployPromptPort {
  constructor(
    private readonly input: NodeJS.ReadStream = process.stdin,
    private readonly output: NodeJS.WriteStream = process.stderr
  ) {}

  isInteractive(): boolean {
    return Boolean(this.input.isTTY && this.output.isTTY);
  }

  columns(): number | undefined {
    return typeof this.output.columns === "number" ? this.output.columns : undefined;
  }

  outputStream(): NodeJS.WriteStream | undefined {
    return this.output;
  }

  write(message: string): void {
    this.output.write(message);
  }

  async ask(message: string): Promise<string> {
    const rl = createInterface({
      input: this.input,
      output: this.output
    });
    try {
      const answer = await rl.question(message);
      return answer.trim();
    } finally {
      rl.close();
    }
  }

  async askSecret(message: string): Promise<string> {
    if (!this.isInteractive() || typeof this.input.setRawMode !== "function") {
      return await this.ask(message);
    }

    this.output.write(message);
    return await new Promise<string>((resolve, reject) => {
      let answer = "";
      const input = this.input;
      const wasRaw = Boolean((input as NodeJS.ReadStream & { isRaw?: boolean }).isRaw);

      const cleanup = () => {
        input.off("data", onData);
        if (!wasRaw) {
          input.setRawMode?.(false);
        }
        input.pause();
      };

      const onData = (chunk: string | Buffer) => {
        const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        for (const char of value) {
          if (char === "\u0003") {
            cleanup();
            this.output.write("^C\n");
            reject(new Error("Aborted with Ctrl+C"));
            return;
          }

          if (char === "\r" || char === "\n") {
            cleanup();
            this.output.write("\n");
            resolve(answer.trim());
            return;
          }

          if (char === "\u007f" || char === "\b" || char === "\x08") {
            answer = answer.slice(0, -1);
            continue;
          }

          answer += char;
        }
      };

      input.setEncoding("utf8");
      if (!wasRaw) {
        input.setRawMode(true);
      }
      input.resume();
      input.on("data", onData);
    });
  }

  async selectChoice<T>(params: DeploySelectChoiceParams<T>): Promise<T> {
    if (params.options.length === 0) {
      throw new Error("selectChoice requires at least one option");
    }

    let activeIndex = this.resolveSelectableIndex(params.options, params.initialIndex - 1, 1);
    if (!this.canUseRawSelectors()) {
      return await this.selectChoiceWithoutRawMode(params, activeIndex);
    }

    return await new Promise<T>((resolve, reject) => {
      const input = this.input;
      const wasRaw = Boolean((input as NodeJS.ReadStream & { isRaw?: boolean }).isRaw);
      let renderedRowCount = 0;
      let numericBuffer = "";
      let pendingInput = "";
      let hasPendingNumericError = false;
      let statusMessage: string | undefined;

      const cleanup = () => {
        input.off("data", onData);
        if (!wasRaw) {
          input.setRawMode?.(false);
        }
        input.pause();
        this.output.write("\u001B[?25h");
      };

      const render = () => {
        const frame = this.appendStatusMessage(params.render(activeIndex + 1), statusMessage);
        if (renderedRowCount > 0) {
          this.output.write(`\u001B[${renderedRowCount}F\u001B[J`);
        }
        this.output.write(frame);
        renderedRowCount = this.countRenderedRows(frame);
      };

      const onData = (chunk: string | Buffer) => {
        const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        const parsed = this.parseInputTokens(`${pendingInput}${value}`);
        pendingInput = parsed.remainder;
        for (const token of parsed.tokens) {
          if (token.type === "digit") {
            hasPendingNumericError = false;
            statusMessage = undefined;
            numericBuffer += token.value;
            continue;
          }

          if (token.type === "separator") {
            hasPendingNumericError = false;
            statusMessage = undefined;
            numericBuffer += ",";
            continue;
          }

          if (token.type === "backspace") {
            hasPendingNumericError = false;
            statusMessage = undefined;
            numericBuffer = numericBuffer.slice(0, -1);
            continue;
          }

          if (token.type === "ctrl-c") {
            cleanup();
            this.output.write("^C\n");
            reject(new Error("Aborted with Ctrl+C"));
            return;
          }

          if (token.type === "enter") {
            const submittedNumericBuffer = numericBuffer;
            const numericSelection = this.resolveNumericChoiceIndex(params.options, submittedNumericBuffer);
            if (typeof numericSelection === "number") {
              hasPendingNumericError = false;
              statusMessage = undefined;
              numericBuffer = "";
              activeIndex = numericSelection;
              render();
              cleanup();
              resolve(params.options[numericSelection].value);
              return;
            }

            if (submittedNumericBuffer.length > 0) {
              hasPendingNumericError = true;
              statusMessage = this.renderSingleSelectNumericError(params.options.length);
              numericBuffer = "";
              render();
              continue;
            }

            if (hasPendingNumericError) {
              render();
              continue;
            }

            const selected = params.options[activeIndex];
            cleanup();
            resolve(selected.value);
            return;
          }

          if (token.type === "space") {
            if (numericBuffer.length > 0) {
              continue;
            }
            hasPendingNumericError = false;
            statusMessage = undefined;
            continue;
          }

          hasPendingNumericError = false;
          statusMessage = undefined;
          numericBuffer = "";

          if (token.type === "up") {
            activeIndex = this.resolveSelectableIndex(params.options, activeIndex - 1, -1);
            render();
            continue;
          }

          if (token.type === "down") {
            activeIndex = this.resolveSelectableIndex(params.options, activeIndex + 1, 1);
            render();
          }
        }
      };

      input.setEncoding("utf8");
      if (!wasRaw) {
        input.setRawMode(true);
      }
      input.resume();
      this.output.write("\u001B[?25l");
      render();
      input.on("data", onData);
    });
  }

  async selectManyChoices<T>(params: DeployMultiSelectChoiceParams<T>): Promise<T[]> {
    if (params.options.length === 0) {
      return [];
    }

    let activeIndex = this.resolveSelectableIndex(params.options, params.initialIndex - 1, 1);
    let selectedIndices = this.normalizeSelectedIndices(
      params,
      [...new Set((params.initialSelectedIndices ?? []).map((index) => index - 1))]
        .filter((index) => index >= 0 && index < params.options.length),
      activeIndex
    );

    if (!this.canUseRawSelectors()) {
      return await this.selectManyChoicesWithoutRawMode(params, activeIndex, selectedIndices);
    }

    return await new Promise<T[]>((resolve, reject) => {
      const input = this.input;
      const wasRaw = Boolean((input as NodeJS.ReadStream & { isRaw?: boolean }).isRaw);
      let renderedRowCount = 0;
      let numericBuffer = "";
      let pendingInput = "";
      let hasPendingNumericError = false;
      let statusMessage: string | undefined;

      const cleanup = () => {
        input.off("data", onData);
        if (!wasRaw) {
          input.setRawMode?.(false);
        }
        input.pause();
        this.output.write("\u001B[?25h");
      };

      const render = () => {
        const frame = this.appendStatusMessage(
          params.render(activeIndex + 1, selectedIndices.map((index) => index + 1)),
          statusMessage
        );
        if (renderedRowCount > 0) {
          this.output.write(`\u001B[${renderedRowCount}F\u001B[J`);
        }
        this.output.write(frame);
        renderedRowCount = this.countRenderedRows(frame);
      };

      const onData = (chunk: string | Buffer) => {
        const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        const parsed = this.parseInputTokens(`${pendingInput}${value}`);
        pendingInput = parsed.remainder;
        for (const token of parsed.tokens) {
          if (token.type === "digit") {
            hasPendingNumericError = false;
            statusMessage = undefined;
            numericBuffer += token.value;
            continue;
          }

          if (token.type === "separator") {
            hasPendingNumericError = false;
            statusMessage = undefined;
            numericBuffer += ",";
            continue;
          }

          if (token.type === "backspace") {
            hasPendingNumericError = false;
            statusMessage = undefined;
            numericBuffer = numericBuffer.slice(0, -1);
            continue;
          }

          if (token.type === "ctrl-c") {
            cleanup();
            this.output.write("^C\n");
            reject(new Error("Aborted with Ctrl+C"));
            return;
          }

          if (token.type === "enter") {
            const submittedNumericBuffer = numericBuffer;
            const numericSelections = this.parseNumericChoiceIndices(params.options, submittedNumericBuffer);
            if (numericSelections) {
              const validationMessage = this.validateSelectedIndices(params, numericSelections);
              if (validationMessage) {
                hasPendingNumericError = true;
                statusMessage = validationMessage;
                numericBuffer = "";
                render();
                continue;
              }

              hasPendingNumericError = false;
              statusMessage = undefined;
              numericBuffer = "";
              selectedIndices = this.normalizeSelectedIndices(
                params,
                numericSelections,
                numericSelections.at(-1) ?? activeIndex
              );
              activeIndex = selectedIndices.at(-1) ?? activeIndex;
              render();
              cleanup();
              resolve(selectedIndices.map((index) => params.options[index].value));
              return;
            }

            if (submittedNumericBuffer.length > 0) {
              hasPendingNumericError = true;
              statusMessage = this.renderMultiSelectNumericError(params.options.length);
              numericBuffer = "";
              render();
              continue;
            }

            if (hasPendingNumericError) {
              render();
              continue;
            }

            const validationMessage = this.validateSelectedIndices(params, selectedIndices);
            if (validationMessage) {
              statusMessage = validationMessage;
              render();
              continue;
            }

            cleanup();
            resolve(selectedIndices.map((index) => params.options[index].value));
            return;
          }

          if (token.type === "space") {
            if (numericBuffer.length > 0) {
              continue;
            }

            hasPendingNumericError = false;
            statusMessage = undefined;
            if (!params.options[activeIndex]?.disabled) {
              selectedIndices = this.normalizeSelectedIndices(
                params,
                selectedIndices.includes(activeIndex)
                  ? selectedIndices.filter((index) => index !== activeIndex)
                  : [...selectedIndices, activeIndex],
                activeIndex
              );
              render();
            }
            continue;
          }

          hasPendingNumericError = false;
          statusMessage = undefined;
          numericBuffer = "";

          if (token.type === "up") {
            activeIndex = this.resolveSelectableIndex(params.options, activeIndex - 1, -1);
            render();
            continue;
          }

          if (token.type === "down") {
            activeIndex = this.resolveSelectableIndex(params.options, activeIndex + 1, 1);
            render();
          }
        }
      };

      input.setEncoding("utf8");
      if (!wasRaw) {
        input.setRawMode(true);
      }
      input.resume();
      this.output.write("\u001B[?25l");
      render();
      input.on("data", onData);
    });
  }

  async pause(message: string): Promise<void> {
    await this.ask(message);
  }

  private canUseRawSelectors(): boolean {
    return this.isInteractive()
      && typeof this.input.setRawMode === "function"
      && (process.env.TERM ?? "").toLowerCase() !== "dumb";
  }

  private parseInputTokens(value: string): { tokens: InputToken[]; remainder: string } {
    const tokens: InputToken[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === "\u0003") {
        tokens.push({ type: "ctrl-c" });
        continue;
      }
      if (char === "\r" || char === "\n") {
        tokens.push({ type: "enter" });
        continue;
      }
      if (char === "\u007f" || char === "\b" || char === "\x08") {
        tokens.push({ type: "backspace" });
        continue;
      }
      if (char === " ") {
        tokens.push({ type: "space" });
        continue;
      }
      if (char === ",") {
        tokens.push({ type: "separator" });
        continue;
      }
      if (/^[0-9]$/.test(char)) {
        tokens.push({ type: "digit", value: char });
        continue;
      }

      if (char === "\u001B") {
        if (index + 1 >= value.length) {
          return { tokens, remainder: value.slice(index) };
        }
        if (value[index + 1] !== "[") {
          continue;
        }
        if (index + 2 >= value.length) {
          return { tokens, remainder: value.slice(index) };
        }

        const direction = value[index + 2];
        if (direction === "A") {
          tokens.push({ type: "up" });
        } else if (direction === "B") {
          tokens.push({ type: "down" });
        }
        index += 2;
        continue;
      }
      if (char === "k" || char === "K") {
        tokens.push({ type: "up" });
        continue;
      }
      if (char === "j" || char === "J") {
        tokens.push({ type: "down" });
      }
    }
    return { tokens, remainder: "" };
  }

  private resolveNumericChoiceIndex<T>(
    options: Array<{ value: T; disabled?: boolean }>,
    value: string
  ): number | undefined {
    if (!/^[1-9][0-9]*$/.test(value)) {
      return undefined;
    }

    const index = Number(value) - 1;
    if (index < 0 || index >= options.length || options[index]?.disabled) {
      return undefined;
    }

    return index;
  }

  private parseNumericChoiceIndices<T>(
    options: Array<{ value: T; disabled?: boolean }>,
    value: string
  ): number[] | undefined {
    const parts = value.split(",").map((part) => part.trim());
    if (parts.length === 0 || parts.some((part) => !/^[1-9][0-9]*$/.test(part))) {
      return undefined;
    }

    const parsed = [...new Set(parts.map((part) => Number(part) - 1))];
    if (parsed.some((index) => index < 0 || index >= options.length || options[index]?.disabled)) {
      return undefined;
    }

    return parsed;
  }

  private resolveSelectableIndex<T>(
    options: Array<{ value: T; disabled?: boolean }>,
    requestedIndex: number,
    direction: -1 | 1
  ): number {
    const boundedIndex = Math.max(0, Math.min(requestedIndex, options.length - 1));
    if (!options[boundedIndex]?.disabled) {
      return boundedIndex;
    }

    let index = boundedIndex;
    while (index >= 0 && index < options.length) {
      index += direction;
      if (index < 0 || index >= options.length) {
        break;
      }
      if (!options[index]?.disabled) {
        return index;
      }
    }

    const fallback = options.findIndex((option) => !option.disabled);
    return fallback >= 0 ? fallback : 0;
  }

  private async selectChoiceWithoutRawMode<T>(
    params: DeploySelectChoiceParams<T>,
    activeIndex: number
  ): Promise<T> {
    this.output.write((params.renderFallback ?? params.render)(activeIndex + 1));

    while (true) {
      const answer = (await this.ask(params.fallbackPrompt ?? `Choose an option [${activeIndex + 1}]: `)).trim();
      if (answer.length === 0) {
        return params.options[activeIndex].value;
      }

      const numericSelection = this.resolveNumericChoiceIndex(params.options, answer);
      if (typeof numericSelection === "number") {
        return params.options[numericSelection].value;
      }

      this.output.write(`${this.renderSingleSelectNumericError(params.options.length)}\n`);
    }
  }

  private async selectManyChoicesWithoutRawMode<T>(
    params: DeployMultiSelectChoiceParams<T>,
    activeIndex: number,
    selectedIndices: number[]
  ): Promise<T[]> {
    this.output.write(
      (params.renderFallback ?? params.render)(activeIndex + 1, selectedIndices.map((index) => index + 1))
    );

    while (true) {
      const answer = (await this.ask(
        params.fallbackPrompt ?? `Choose one or more options [${selectedIndices.map((index) => index + 1).join(",")}]: `
      )).trim();
      if (answer.length === 0) {
        return selectedIndices.map((index) => params.options[index].value);
      }

      const numericSelections = this.parseNumericChoiceIndices(params.options, answer);
      if (!numericSelections) {
        this.output.write(`${this.renderMultiSelectNumericError(params.options.length)}\n`);
        continue;
      }

      const validationMessage = this.validateSelectedIndices(params, numericSelections);
      if (validationMessage) {
        this.output.write(`${validationMessage}\n`);
        continue;
      }

      return this.normalizeSelectedIndices(
        params,
        numericSelections,
        numericSelections.at(-1) ?? activeIndex
      ).map((index) => params.options[index].value);
    }
  }

  private countRenderedRows(frame: string): number {
    if (frame.length === 0) {
      return 0;
    }

    const columns = typeof this.output.columns === "number" && this.output.columns > 0
      ? this.output.columns
      : undefined;
    if (!columns) {
      return frame.split("\n").length - 1;
    }

    const lineSegments = frame.endsWith("\n")
      ? frame.slice(0, -1).split("\n")
      : frame.split("\n");
    const totalRows = lineSegments.reduce((sum, line) => sum + this.countWrappedRows(line, columns), 0);
    return frame.endsWith("\n")
      ? totalRows
      : Math.max(0, totalRows - 1);
  }

  private countWrappedRows(line: string, columns: number): number {
    const visibleLine = line.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "");
    return Math.max(1, Math.ceil(Array.from(visibleLine).length / columns));
  }

  private appendStatusMessage(frame: string, statusMessage: string | undefined): string {
    if (!statusMessage) {
      return frame;
    }

    return `${frame}${frame.endsWith("\n") ? "" : "\n"}${statusMessage}\n`;
  }

  private renderSingleSelectNumericError(optionCount: number): string {
    return `Enter a number between 1 and ${optionCount}.`;
  }

  private renderMultiSelectNumericError(optionCount: number): string {
    return `Enter one or more numbers from 1 to ${optionCount}, separated by commas.`;
  }

  private normalizeSelectedIndices<T>(
    params: DeployMultiSelectChoiceParams<T>,
    selectedIndices: number[],
    activeIndex: number
  ): number[] {
    const bounded = [...new Set(selectedIndices)]
      .filter((index) => index >= 0 && index < params.options.length)
      .sort((left, right) => left - right);
    if (!params.normalizeSelectedIndices) {
      return bounded;
    }

    return [...new Set(params.normalizeSelectedIndices(
      bounded.map((index) => index + 1),
      activeIndex + 1
    ).map((index) => index - 1))]
      .filter((index) => index >= 0 && index < params.options.length)
      .sort((left, right) => left - right);
  }

  private validateSelectedIndices<T>(
    params: DeployMultiSelectChoiceParams<T>,
    selectedIndices: number[]
  ): string | undefined {
    if (!params.validateSelectedIndices) {
      return undefined;
    }

    return params.validateSelectedIndices(selectedIndices.map((index) => index + 1));
  }
}
