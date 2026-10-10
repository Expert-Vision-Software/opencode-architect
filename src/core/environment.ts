export type WarnChannel = (message: string) => void;
export type EnvLookup = (name: string) => string | undefined;

export interface Environment {
  env: EnvLookup;
  warn: WarnChannel;
  fetch: typeof fetch;
}

export const realEnvironment: Environment = {
  env: (name) => process.env[name],
  warn: (message) => console.warn(message),
  fetch,
};
