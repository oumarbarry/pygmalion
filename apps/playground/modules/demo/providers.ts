import { createManualPaymentProvider, type PaymentProvider } from '@oumarbarry/pygmalion-core'
import type { ProviderDescriptor } from '@oumarbarry/pygmalion'

// A fake provider proving the provider registry path (no real integration).
// `always-fail` is a payment provider whose authorize always errors; the
// checkout e2e uses it to exercise the TX2' compensation path (order canceled +
// reserved stock released) end-to-end over HTTP. Playground-only.
const alwaysFailPayment: PaymentProvider = {
  ...createManualPaymentProvider(),
  async authorize() {
    return { data: {}, status: 'error' }
  },
}

const providers: ProviderDescriptor[] = [
  {
    type: 'notification',
    id: 'console',
    factory: () => ({
      notify: (message: string) => console.log('[demo-notify]', message),
    }),
  },
  {
    type: 'payment',
    id: 'always-fail',
    factory: () => alwaysFailPayment,
  },
]

export default providers
