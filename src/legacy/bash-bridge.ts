export const BASH_FALLBACK_CODE = 90;

export class BashFallbackSignal extends Error {
  readonly code: number;

  constructor(message: string) {
    super(message);
    this.name = "BashFallbackSignal";
    this.code = BASH_FALLBACK_CODE;
  }
}
