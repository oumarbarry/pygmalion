// Composed core schema: the tables `@oumarbarry/pygmalion` feeds to the schema
// registry. Third-party modules add their own via `pygmalion:schema`.
export * from './products'
export * from './outbox'
export * from './staff'
export * from './sales-channels'
export * from './settings'
export * from './customers'
// --- Taxonomy ---------------------------------------------------
export * from './taxonomy'
// --- Tax ---------------------------------------------------------------
export * from './tax'
// --- Inventory ---------------------------------------------------------
export * from './inventory'
// --- Pricing -----------------------------------------------------------
export * from './pricing'
// --- Promotions ---------------------------------------------------------
// Exported before `cart` — `cart.ts` references `promotions.ts` (FK), keeping
// the barrel in dependency order even though `export *` doesn't require it.
export * from './promotions'
// --- Cart ----------------------------------------------------------------
export * from './cart'
// --- Shipping -------------------------------------------------------------
export * from './fulfillment-config'
// --- Payment --------------------------------------------------------
export * from './payment'
// --- Orders ---------------------------------------------------------
export * from './orders'
// --- RMA: returns, exchanges, claims --------------------------------------
export * from './rma'
// --- Webhooks + notifications ----------------------------------------------
export * from './webhooks'
export * from './notifications'
