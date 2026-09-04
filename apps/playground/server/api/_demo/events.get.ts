// Domain events captured by the demo Nitro plugin — lets the E2E prove the
// outbox drained a POSTed product's event to a pygmalion:event handler.
export default defineEventHandler(() => ({ events: capturedEvents }))
