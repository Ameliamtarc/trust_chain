declare module 'snarkjs' {
  export const groth16: {
    fullProve(input: Record<string, string | string[]>, wasm: string, provingKey: string): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(verificationKey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
}

declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    (inputs: Array<string | bigint>): unknown;
    F: { toString(value: unknown): string };
  }>;
}
