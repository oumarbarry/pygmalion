// Shared sink for domain events observed during a run (used by the E2E to prove
// outbox delivery). Auto-imported into the Nitro server bundle.
export interface CapturedEvent {
  event: string
  payload: unknown
}

export const capturedEvents: CapturedEvent[] = []
