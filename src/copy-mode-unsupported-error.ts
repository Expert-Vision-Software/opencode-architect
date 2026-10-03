export class CopyModeUnsupportedError extends Error {
  constructor(packageName: string) {
    super(
      `${packageName} is a code-backed package: it ships agents, which only work through ` +
        `plugin registration. Copy install cannot express that. Run without --mode copy.`,
    );
    this.name = "CopyModeUnsupportedError";
  }
}
