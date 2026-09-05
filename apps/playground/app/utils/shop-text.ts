/**
 * Every string a shopper reads in the demo storefront, in English and in
 * French. Same pattern as the admin's vocabulary: one typed record per
 * language, so a key missing from either one is a type error.
 *
 * Named `shop-text` rather than `vocabulary`: the admin layer auto-imports a
 * `vocabulary.ts` of its own, and two layers exporting the same basename
 * shadow each other.
 *
 * Keys are grouped by area (`common*`, `nav*`, `home*`, `product*`, `cart*`,
 * `checkout*`, `account*`, `order*`, `footer*`). A `{name}` placeholder is
 * filled by `tf()`; counts that pluralize carry an `...One` / `...Other` pair.
 */
export type ShopLocale = 'en' | 'fr'
export const shopLocales: readonly ShopLocale[] = ['en', 'fr']
export const defaultShopLocale: ShopLocale = 'en'
export const SHOP_LOCALE_COOKIE = 'pygmalion-shop-locale'

/** 'fr' when a language tag (cookie, Accept-Language, navigator) asks for French, else English. */
export function shopLocaleFrom(tag: string | null | undefined): ShopLocale {
  return tag?.trim().toLowerCase().startsWith('fr') ? 'fr' : defaultShopLocale
}

export type ShopTextKey =
  // Order, payment and shipment status, in a shopper's words
  | 'statusOrderPending'
  | 'statusOrderCompleted'
  | 'statusOrderCanceled'
  | 'statusOrderArchived'
  | 'statusOrderRequiresAction'
  | 'statusPaymentAwaiting'
  | 'statusPaymentAuthorized'
  | 'statusPaymentPartiallyAuthorized'
  | 'statusPaymentCaptured'
  | 'statusPaymentPartiallyCaptured'
  | 'statusPaymentRefunded'
  | 'statusPaymentPartiallyRefunded'
  | 'statusPaymentCanceled'
  | 'statusShipmentPreparing'
  | 'statusShipmentReady'
  | 'statusShipmentPartiallyShipped'
  | 'statusShipmentShipped'
  | 'statusShipmentPartiallyDelivered'
  | 'statusShipmentDelivered'
  | 'statusShipmentCanceled'
  | 'statusUnknown'
  // Language switcher
  | 'languageLabel'
  // Common: buttons, states, form fields
  | 'commonLoading'
  | 'commonErrorTitle'
  | 'commonErrorMessage'
  | 'commonRetry'
  | 'commonEmptyTitle'
  | 'commonSkipToContent'
  | 'commonBrowseShop'
  | 'commonBackToShop'
  | 'commonContinueShopping'
  | 'commonSeeAll'
  | 'commonContinue'
  | 'commonCancel'
  | 'commonSave'
  | 'commonSaved'
  | 'commonEdit'
  | 'commonDelete'
  | 'commonAdd'
  | 'commonRemove'
  | 'commonOptional'
  | 'commonSubtotal'
  | 'commonDiscount'
  | 'commonShipping'
  | 'commonTaxes'
  | 'commonTotal'
  | 'commonQuantity'
  | 'commonQuantityFor'
  | 'commonDecrease'
  | 'commonIncrease'
  | 'commonName'
  | 'commonEmail'
  | 'commonPassword'
  | 'commonFirstName'
  | 'commonLastName'
  | 'commonAddress'
  | 'commonAddressLine2'
  | 'commonPostalCode'
  | 'commonCity'
  | 'commonCountry'
  | 'commonPhone'
  // Header and navigation
  | 'navMenu'
  | 'navShop'
  | 'navShopMobile'
  | 'navAllProducts'
  | 'navRegionLabel'
  | 'navCartOne'
  | 'navCartOther'
  // Home page
  | 'homeTitle'
  | 'homeDescription'
  | 'homeHeroTitle'
  | 'homeHeroText'
  | 'homePerks'
  | 'homeLatestArrival'
  | 'homeCollections'
  | 'homeDiscover'
  | 'homeNew'
  | 'homeEmptyTitle'
  | 'homeEmptyMessage'
  // Listing, product, collection and category pages
  | 'productShopTitle'
  | 'productShopDescription'
  | 'productCountOne'
  | 'productCountOther'
  | 'productSearch'
  | 'productFilterCollection'
  | 'productFilterCategory'
  | 'productAllCollections'
  | 'productAllCategories'
  | 'productClearFilters'
  | 'productNoMatchTitle'
  | 'productNoMatchMessage'
  | 'productListEmptyTitle'
  | 'productListEmptyMessage'
  | 'productGridEmptyTitle'
  | 'productGridEmptyMessage'
  | 'productFrom'
  | 'productNoPriceHere'
  | 'productNoPrice'
  | 'productFallbackTitle'
  | 'productNotFoundTitle'
  | 'productNotFoundMessage'
  | 'productAddToCart'
  | 'productChooseVariant'
  | 'productMaterial'
  | 'productSku'
  | 'productShippingInfo'
  | 'productPhotos'
  | 'productPhotoN'
  | 'productCollectionFallback'
  | 'productCollectionEmptyTitle'
  | 'productCollectionEmptyMessage'
  | 'productCategoryFallback'
  | 'productSubcategories'
  | 'productCategoryEmptyTitle'
  | 'productCategoryEmptyMessage'
  // Cart drawer and cart page
  | 'cartTitle'
  | 'cartClose'
  | 'cartEmptyTitle'
  | 'cartEmptyDrawerMessage'
  | 'cartEmptyPageMessage'
  | 'cartUnitPrice'
  | 'cartPromoCode'
  | 'cartApply'
  | 'cartRemoveCode'
  | 'cartSummary'
  | 'cartCheckout'
  | 'cartOrder'
  | 'cartShippingNote'
  | 'cartShippingHint'
  // Checkout
  | 'checkoutTitle'
  | 'checkoutEmptyTitle'
  | 'checkoutEmptyMessage'
  | 'checkoutSteps'
  | 'checkoutStepEmail'
  | 'checkoutStepAddress'
  | 'checkoutStepShipping'
  | 'checkoutStepPayment'
  | 'checkoutStepDone'
  | 'checkoutStepCurrent'
  | 'checkoutContactTitle'
  | 'checkoutContactText'
  | 'checkoutSignInHint'
  | 'checkoutAddressTitle'
  | 'checkoutOrderFor'
  | 'checkoutSavedAddresses'
  | 'checkoutUseSaved'
  | 'checkoutSavedAddress'
  | 'checkoutPhoneHint'
  | 'checkoutShippingTitle'
  | 'checkoutNoShippingTitle'
  | 'checkoutNoShippingMessage'
  | 'checkoutShipTo'
  | 'checkoutPaymentMethod'
  | 'checkoutProviderManual'
  | 'checkoutProviderStripe'
  | 'checkoutProviderAlwaysFail'
  | 'checkoutStripeNote'
  | 'checkoutPay'
  | 'checkoutConsent'
  | 'checkoutPaymentFailed'
  | 'checkoutDone'
  | 'checkoutSeeConfirmation'
  | 'checkoutYourCart'
  | 'checkoutEditCart'
  // Account: sign in, profile, addresses
  | 'accountTitle'
  | 'accountOrders'
  | 'accountAddresses'
  | 'accountSignIn'
  | 'accountSignOut'
  | 'accountCreate'
  | 'accountCreateMine'
  | 'accountSignInText'
  | 'accountSignUpText'
  | 'accountPasswordHint'
  | 'accountNoAccount'
  | 'accountHaveAccount'
  | 'accountGuestOrder'
  | 'accountTrackByEmail'
  | 'accountBadCredentials'
  | 'accountRecentOrders'
  | 'accountNoOrdersTitle'
  | 'accountNoOrdersMessage'
  | 'accountDetails'
  | 'accountEmailHint'
  | 'accountAddressName'
  | 'accountAddressNameHint'
  | 'accountCountryHint'
  | 'accountNoAddressTitle'
  | 'accountNoAddressMessage'
  | 'accountDeleteAddress'
  // Orders: confirmation, detail, tracking, returns
  | 'orderTitle'
  | 'orderFallbackTitle'
  | 'orderNumberTitle'
  | 'orderNumber'
  | 'orderPlacedOn'
  | 'orderReturnableOne'
  | 'orderReturnableOther'
  | 'orderReturnDone'
  | 'orderReturnPrompt'
  | 'orderRequestReturn'
  | 'orderReturnQuantityFor'
  | 'orderReturnReason'
  | 'orderReturnNoReason'
  | 'orderReturnNote'
  | 'orderSendReturn'
  | 'orderNotFoundTitle'
  | 'orderNotFoundAccountMessage'
  | 'orderNotFoundGuestMessage'
  | 'orderThanks'
  | 'orderConfirmationSent'
  | 'orderFindMine'
  | 'orderAllMine'
  | 'orderTrack'
  | 'orderTrackText'
  | 'orderNumberField'
  | 'orderEmailField'
  | 'orderSeeMine'
  | 'orderHaveAccount'
  | 'orderSignInLink'
  | 'orderSignInHint'
  // Footer
  | 'footerTagline'
  | 'footerCollections'
  | 'footerCategories'
  | 'footerAccount'
  | 'footerDemo'
  | 'footerAdmin'

const en: Record<ShopTextKey, string> = {
  // Order, payment and shipment status, in a shopper's words
  statusOrderPending: 'Being processed',
  statusOrderCompleted: 'Completed',
  statusOrderCanceled: 'Canceled',
  statusOrderArchived: 'Archived',
  statusOrderRequiresAction: 'Action required',
  statusPaymentAwaiting: 'Awaiting payment',
  statusPaymentAuthorized: 'Payment authorized',
  statusPaymentPartiallyAuthorized: 'Partial payment',
  statusPaymentCaptured: 'Paid',
  statusPaymentPartiallyCaptured: 'Partly paid',
  statusPaymentRefunded: 'Refunded',
  statusPaymentPartiallyRefunded: 'Partly refunded',
  statusPaymentCanceled: 'Payment canceled',
  statusShipmentPreparing: 'Being prepared',
  statusShipmentReady: 'Ready to ship',
  statusShipmentPartiallyShipped: 'Partly shipped',
  statusShipmentShipped: 'Shipped',
  statusShipmentPartiallyDelivered: 'Partly delivered',
  statusShipmentDelivered: 'Delivered',
  statusShipmentCanceled: 'Shipment canceled',
  statusUnknown: 'Unknown status',
  // Language switcher
  languageLabel: 'Language',
  // Common: buttons, states, form fields
  commonLoading: 'Loading…',
  commonErrorTitle: 'Something went wrong',
  commonErrorMessage: 'An error occurred.',
  commonRetry: 'Try again',
  commonEmptyTitle: 'Nothing to show',
  commonSkipToContent: 'Skip to content',
  commonBrowseShop: 'Browse the shop',
  commonBackToShop: 'Back to the shop',
  commonContinueShopping: 'Continue shopping',
  commonSeeAll: 'See all',
  commonContinue: 'Continue',
  commonCancel: 'Cancel',
  commonSave: 'Save',
  commonSaved: 'Saved.',
  commonEdit: 'Edit',
  commonDelete: 'Delete',
  commonAdd: 'Add',
  commonRemove: 'Remove',
  commonOptional: 'optional',
  commonSubtotal: 'Subtotal',
  commonDiscount: 'Discount',
  commonShipping: 'Shipping',
  commonTaxes: 'Taxes',
  commonTotal: 'Total',
  commonQuantity: 'Quantity {count}',
  commonQuantityFor: 'Quantity for {title}',
  commonDecrease: 'Decrease quantity',
  commonIncrease: 'Increase quantity',
  commonName: 'Name',
  commonEmail: 'Email address',
  commonPassword: 'Password',
  commonFirstName: 'First name',
  commonLastName: 'Last name',
  commonAddress: 'Address',
  commonAddressLine2: 'Address line 2',
  commonPostalCode: 'Postal code',
  commonCity: 'City',
  commonCountry: 'Country',
  commonPhone: 'Phone',
  // Header and navigation
  navMenu: 'Menu',
  navShop: 'Shop',
  navShopMobile: 'Shop (mobile)',
  navAllProducts: 'All products',
  navRegionLabel: 'Region and currency',
  navCartOne: 'Cart, {count} item',
  navCartOther: 'Cart, {count} items',
  // Home page
  homeTitle: 'Objects for the home',
  homeDescription: 'Ceramics, lighting, textiles and stationery chosen to last. Shipped from Nantes within 48 hours.',
  homeHeroTitle: 'Objects you keep.',
  homeHeroText: 'Turned ceramics, woven wool, solid wood. A small selection for the home, chosen to age well, shipped from Nantes within 48 hours.',
  homePerks: 'Free shipping from {amount} · 30-day returns',
  homeLatestArrival: 'Just in:',
  homeCollections: 'Our collections',
  homeDiscover: 'Discover the selection',
  homeNew: 'New arrivals',
  homeEmptyTitle: 'The shop is still empty',
  homeEmptyMessage: 'Add products from the admin and they will appear here.',
  // Listing, product, collection and category pages
  productShopTitle: 'Shop',
  productShopDescription: 'Every Maison Pygmalion object.',
  productCountOne: '{count} product available',
  productCountOther: '{count} products available',
  productSearch: 'Search products',
  productFilterCollection: 'Filter by collection',
  productFilterCategory: 'Filter by category',
  productAllCollections: 'All collections',
  productAllCategories: 'All categories',
  productClearFilters: 'Clear',
  productNoMatchTitle: 'No product matches',
  productNoMatchMessage: 'Widen the search or remove a filter.',
  productListEmptyTitle: 'The shop is empty',
  productListEmptyMessage: 'Published products will appear here.',
  productGridEmptyTitle: 'No products here',
  productGridEmptyMessage: 'Try another category, or remove the filters.',
  productFrom: 'from ',
  productNoPriceHere: 'Price unavailable here',
  productNoPrice: 'Price unavailable',
  productFallbackTitle: 'Product',
  productNotFoundTitle: 'Product not found',
  productNotFoundMessage: 'It may have been removed from the shop.',
  productAddToCart: 'Add to cart',
  productChooseVariant: 'Choose an option',
  productMaterial: 'Material',
  productSku: 'Reference',
  productShippingInfo: 'Within 48 hours from Nantes · free from {amount}',
  productPhotos: 'Product photos',
  productPhotoN: 'Photo {n} of {total}',
  productCollectionFallback: 'Collection',
  productCollectionEmptyTitle: 'This collection is empty',
  productCollectionEmptyMessage: 'No product is attached to it yet.',
  productCategoryFallback: 'Category',
  productSubcategories: 'Subcategories',
  productCategoryEmptyTitle: 'This category is empty',
  productCategoryEmptyMessage: 'No product is filed under it yet.',
  // Cart drawer and cart page
  cartTitle: 'Cart',
  cartClose: 'Close cart',
  cartEmptyTitle: 'Your cart is empty',
  cartEmptyDrawerMessage: 'Add something and it will wait for you here.',
  cartEmptyPageMessage: 'Browse the shop: whatever you add will wait for you here.',
  cartUnitPrice: '{price} each',
  cartPromoCode: 'Promo code',
  cartApply: 'Apply',
  cartRemoveCode: 'Remove code {code}',
  cartSummary: 'Summary',
  cartCheckout: 'Proceed to checkout',
  cartOrder: 'Checkout',
  cartShippingNote: 'Shipping and taxes calculated at the next step.',
  cartShippingHint: 'calculated at the next step',
  // Checkout
  checkoutTitle: 'Checkout',
  checkoutEmptyTitle: 'Nothing to order yet',
  checkoutEmptyMessage: 'Add something to the cart to continue.',
  checkoutSteps: 'Checkout steps',
  checkoutStepEmail: 'Contact',
  checkoutStepAddress: 'Address',
  checkoutStepShipping: 'Shipping',
  checkoutStepPayment: 'Payment',
  checkoutStepDone: '(done)',
  checkoutStepCurrent: '(current step)',
  checkoutContactTitle: 'Your details',
  checkoutContactText: 'We only send the confirmation and tracking.',
  checkoutSignInHint: 'to use your saved addresses.',
  checkoutAddressTitle: 'Shipping address',
  checkoutOrderFor: 'Order for {email}',
  checkoutSavedAddresses: 'My saved addresses',
  checkoutUseSaved: 'Use a saved address',
  checkoutSavedAddress: 'Saved address',
  checkoutPhoneHint: 'for delivery',
  checkoutShippingTitle: 'Shipping method',
  checkoutNoShippingTitle: 'No shipping available here',
  checkoutNoShippingMessage: 'We do not ship to this address yet. Change it to continue.',
  checkoutShipTo: 'Shipping to {city} · {method}',
  checkoutPaymentMethod: 'Payment method',
  checkoutProviderManual: 'Pay on delivery (demo)',
  checkoutProviderStripe: 'Card (Stripe)',
  checkoutProviderAlwaysFail: 'Payment declined (demo, to test the refusal path)',
  checkoutStripeNote: 'Payment goes through Stripe. The amount is only authorized now and charged when the order ships.',
  checkoutPay: 'Pay {amount}',
  checkoutConsent: 'By confirming, you agree that your order is prepared and shipped to the address given.',
  checkoutPaymentFailed: 'The payment did not go through. Choose another payment method and try again.',
  checkoutDone: 'Order placed.',
  checkoutSeeConfirmation: 'See the confirmation',
  checkoutYourCart: 'Your cart',
  checkoutEditCart: 'Edit cart',
  // Account: sign in, profile, addresses
  accountTitle: 'My account',
  accountOrders: 'My orders',
  accountAddresses: 'My addresses',
  accountSignIn: 'Sign in',
  accountSignOut: 'Sign out',
  accountCreate: 'Create an account',
  accountCreateMine: 'Create my account',
  accountSignInText: 'To find your orders and addresses.',
  accountSignUpText: 'Your saved addresses and orders in one place.',
  accountPasswordHint: 'At least 8 characters',
  accountNoAccount: 'No account yet?',
  accountHaveAccount: 'Already have an account?',
  accountGuestOrder: 'Ordered without an account?',
  accountTrackByEmail: 'Track it by email',
  accountBadCredentials: 'Incorrect email or password.',
  accountRecentOrders: 'Recent orders',
  accountNoOrdersTitle: 'No orders yet',
  accountNoOrdersMessage: 'Your purchases will appear here after your first order.',
  accountDetails: 'My details',
  accountEmailHint: 'cannot be changed',
  accountAddressName: 'Address name',
  accountAddressNameHint: 'Home, Office…',
  accountCountryHint: '2-letter code',
  accountNoAddressTitle: 'No saved address',
  accountNoAddressMessage: 'Add one and checkout will offer it automatically.',
  accountDeleteAddress: 'Delete this address?',
  // Orders: confirmation, detail, tracking, returns
  orderTitle: 'Your order',
  orderFallbackTitle: 'Order',
  orderNumberTitle: 'Order #{id}',
  orderNumber: '#{id}',
  orderPlacedOn: 'Ordered on {date}',
  orderReturnableOne: '{count} unit returnable',
  orderReturnableOther: '{count} units returnable',
  orderReturnDone: 'Your return request is registered. We will email you the label.',
  orderReturnPrompt: 'Something not right?',
  orderRequestReturn: 'Request a return',
  orderReturnQuantityFor: 'Quantity to return for {title}',
  orderReturnReason: 'Reason',
  orderReturnNoReason: 'Prefer not to say',
  orderReturnNote: 'Details',
  orderSendReturn: 'Send request',
  orderNotFoundTitle: 'Order not found',
  orderNotFoundAccountMessage: 'It may have been placed with another email address.',
  orderNotFoundGuestMessage: 'Check the number and the email address used for the purchase.',
  orderThanks: 'Thank you, your order is placed.',
  orderConfirmationSent: 'A confirmation email is on its way to {email}. We are preparing your parcel.',
  orderFindMine: 'Find my order',
  orderAllMine: 'All my orders',
  orderTrack: 'Track an order',
  orderTrackText: 'The number is in your confirmation email. No account needed.',
  orderNumberField: 'Order number',
  orderEmailField: 'Email used for the order',
  orderSeeMine: 'See my order',
  orderHaveAccount: 'Have an account?',
  orderSignInLink: 'Sign in',
  orderSignInHint: 'to see your full history.',
  // Footer
  footerTagline: 'Objects for the home, chosen to last. Shipped from Nantes within 48 hours.',
  footerCollections: 'Collections',
  footerCategories: 'Categories',
  footerAccount: 'Your account',
  footerDemo: 'Pygmalion playground, a demo shop',
  footerAdmin: 'Admin',
}

const fr: Record<ShopTextKey, string> = {
  // Order, payment and shipment status, in a shopper's words
  statusOrderPending: 'En cours de traitement',
  statusOrderCompleted: 'Terminée',
  statusOrderCanceled: 'Annulée',
  statusOrderArchived: 'Archivée',
  statusOrderRequiresAction: 'Action requise',
  statusPaymentAwaiting: 'Paiement en attente',
  statusPaymentAuthorized: 'Paiement autorisé',
  statusPaymentPartiallyAuthorized: 'Paiement partiel',
  statusPaymentCaptured: 'Payée',
  statusPaymentPartiallyCaptured: 'Partiellement payée',
  statusPaymentRefunded: 'Remboursée',
  statusPaymentPartiallyRefunded: 'Partiellement remboursée',
  statusPaymentCanceled: 'Paiement annulé',
  statusShipmentPreparing: 'En préparation',
  statusShipmentReady: 'Prête à partir',
  statusShipmentPartiallyShipped: 'Partiellement expédiée',
  statusShipmentShipped: 'Expédiée',
  statusShipmentPartiallyDelivered: 'Partiellement livrée',
  statusShipmentDelivered: 'Livrée',
  statusShipmentCanceled: 'Expédition annulée',
  statusUnknown: 'Statut inconnu',
  // Language switcher
  languageLabel: 'Langue',
  // Common: buttons, states, form fields
  commonLoading: 'Chargement…',
  commonErrorTitle: 'Ça n\'a pas fonctionné',
  commonErrorMessage: 'Une erreur est survenue.',
  commonRetry: 'Réessayer',
  commonEmptyTitle: 'Rien à afficher',
  commonSkipToContent: 'Aller au contenu',
  commonBrowseShop: 'Voir la boutique',
  commonBackToShop: 'Retour à la boutique',
  commonContinueShopping: 'Continuer mes achats',
  commonSeeAll: 'Tout voir',
  commonContinue: 'Continuer',
  commonCancel: 'Annuler',
  commonSave: 'Enregistrer',
  commonSaved: 'Enregistré.',
  commonEdit: 'Modifier',
  commonDelete: 'Supprimer',
  commonAdd: 'Ajouter',
  commonRemove: 'Retirer',
  commonOptional: 'facultatif',
  commonSubtotal: 'Sous-total',
  commonDiscount: 'Remise',
  commonShipping: 'Livraison',
  commonTaxes: 'Taxes',
  commonTotal: 'Total',
  commonQuantity: 'Quantité {count}',
  commonQuantityFor: 'Quantité pour {title}',
  commonDecrease: 'Diminuer la quantité',
  commonIncrease: 'Augmenter la quantité',
  commonName: 'Nom',
  commonEmail: 'Adresse e-mail',
  commonPassword: 'Mot de passe',
  commonFirstName: 'Prénom',
  commonLastName: 'Nom',
  commonAddress: 'Adresse',
  commonAddressLine2: 'Complément',
  commonPostalCode: 'Code postal',
  commonCity: 'Ville',
  commonCountry: 'Pays',
  commonPhone: 'Téléphone',
  // Header and navigation
  navMenu: 'Menu',
  navShop: 'Boutique',
  navShopMobile: 'Boutique (mobile)',
  navAllProducts: 'Toute la boutique',
  navRegionLabel: 'Région et devise',
  navCartOne: 'Panier, {count} article',
  navCartOther: 'Panier, {count} articles',
  // Home page
  homeTitle: 'Objets pour la maison',
  homeDescription: 'Céramique, lumière, textile et papeterie choisis pour durer. Expédié depuis Nantes sous 48 h.',
  homeHeroTitle: 'Des objets qu\'on garde.',
  homeHeroText: 'Céramique tournée, laine tissée, bois massif. Une petite sélection pour la maison, choisie pour vieillir correctement — et expédiée de Nantes sous 48 heures.',
  homePerks: 'Livraison offerte dès {amount} · Retours acceptés 30 jours',
  homeLatestArrival: 'Dernière arrivée —',
  homeCollections: 'Nos collections',
  homeDiscover: 'Découvrir la sélection',
  homeNew: 'Nouveautés',
  homeEmptyTitle: 'La boutique est encore vide',
  homeEmptyMessage: 'Ajoutez des produits depuis l\'administration, ils apparaîtront ici.',
  // Listing, product, collection and category pages
  productShopTitle: 'La boutique',
  productShopDescription: 'Tous les objets Maison Pygmalion.',
  productCountOne: '{count} objet disponible',
  productCountOther: '{count} objets disponibles',
  productSearch: 'Chercher un objet',
  productFilterCollection: 'Filtrer par collection',
  productFilterCategory: 'Filtrer par rayon',
  productAllCollections: 'Toutes les collections',
  productAllCategories: 'Tous les rayons',
  productClearFilters: 'Effacer',
  productNoMatchTitle: 'Aucun objet ne correspond',
  productNoMatchMessage: 'Élargissez la recherche ou retirez un filtre.',
  productListEmptyTitle: 'La boutique est vide',
  productListEmptyMessage: 'Les produits publiés apparaîtront ici.',
  productGridEmptyTitle: 'Aucun produit ici',
  productGridEmptyMessage: 'Essayez un autre rayon, ou retirez les filtres.',
  productFrom: 'à partir de ',
  productNoPriceHere: 'Prix indisponible ici',
  productNoPrice: 'Prix indisponible',
  productFallbackTitle: 'Produit',
  productNotFoundTitle: 'Produit introuvable',
  productNotFoundMessage: 'Il a peut-être été retiré de la boutique.',
  productAddToCart: 'Ajouter au panier',
  productChooseVariant: 'Choisissez une déclinaison',
  productMaterial: 'Matière',
  productSku: 'Référence',
  productShippingInfo: 'Sous 48 h depuis Nantes · offerte dès {amount}',
  productPhotos: 'Photos du produit',
  productPhotoN: 'Photo {n} sur {total}',
  productCollectionFallback: 'Collection',
  productCollectionEmptyTitle: 'Cette collection est vide',
  productCollectionEmptyMessage: 'Aucun produit n\'y est encore rattaché.',
  productCategoryFallback: 'Rayon',
  productSubcategories: 'Sous-rayons',
  productCategoryEmptyTitle: 'Ce rayon est vide',
  productCategoryEmptyMessage: 'Aucun produit n\'y est encore classé.',
  // Cart drawer and cart page
  cartTitle: 'Panier',
  cartClose: 'Fermer le panier',
  cartEmptyTitle: 'Votre panier est vide',
  cartEmptyDrawerMessage: 'Ajoutez-y un objet et il vous attendra ici.',
  cartEmptyPageMessage: 'Parcourez la boutique : tout ce que vous ajoutez vous attendra ici.',
  cartUnitPrice: '{price} l\'unité',
  cartPromoCode: 'Code promo',
  cartApply: 'Appliquer',
  cartRemoveCode: 'Retirer le code {code}',
  cartSummary: 'Récapitulatif',
  cartCheckout: 'Passer commande',
  cartOrder: 'Commander',
  cartShippingNote: 'Livraison et taxes calculées à l\'étape suivante.',
  cartShippingHint: 'calculée à l\'étape suivante',
  // Checkout
  checkoutTitle: 'Commande',
  checkoutEmptyTitle: 'Il n\'y a rien à commander',
  checkoutEmptyMessage: 'Ajoutez un objet au panier pour continuer.',
  checkoutSteps: 'Étapes de la commande',
  checkoutStepEmail: 'Coordonnées',
  checkoutStepAddress: 'Adresse',
  checkoutStepShipping: 'Livraison',
  checkoutStepPayment: 'Paiement',
  checkoutStepDone: '(terminé)',
  checkoutStepCurrent: '(étape en cours)',
  checkoutContactTitle: 'Vos coordonnées',
  checkoutContactText: 'Nous n\'envoyons que la confirmation et le suivi.',
  checkoutSignInHint: 'pour retrouver ses adresses.',
  checkoutAddressTitle: 'Adresse de livraison',
  checkoutOrderFor: 'Commande pour {email}',
  checkoutSavedAddresses: 'Mes adresses enregistrées',
  checkoutUseSaved: 'Utiliser une adresse enregistrée',
  checkoutSavedAddress: 'Adresse enregistrée',
  checkoutPhoneHint: 'pour la livraison',
  checkoutShippingTitle: 'Mode de livraison',
  checkoutNoShippingTitle: 'Aucune livraison possible ici',
  checkoutNoShippingMessage: 'Nous ne desservons pas encore cette adresse. Modifiez-la pour continuer.',
  checkoutShipTo: 'Livré à {city} · {method}',
  checkoutPaymentMethod: 'Moyen de paiement',
  checkoutProviderManual: 'Paiement à réception (démo)',
  checkoutProviderStripe: 'Carte bancaire (Stripe)',
  checkoutProviderAlwaysFail: 'Paiement refusé (démo — pour tester le refus)',
  checkoutStripeNote: 'Le paiement passe par Stripe. Le montant est seulement autorisé maintenant — il n\'est débité qu\'à l\'expédition.',
  checkoutPay: 'Payer {amount}',
  checkoutConsent: 'En validant, vous acceptez que votre commande soit préparée et expédiée à l\'adresse indiquée.',
  checkoutPaymentFailed: 'Le paiement n\'a pas abouti. Choisissez un autre moyen de paiement et réessayez.',
  checkoutDone: 'Commande enregistrée.',
  checkoutSeeConfirmation: 'Voir la confirmation',
  checkoutYourCart: 'Votre panier',
  checkoutEditCart: 'Modifier le panier',
  // Account: sign in, profile, addresses
  accountTitle: 'Mon compte',
  accountOrders: 'Mes commandes',
  accountAddresses: 'Mes adresses',
  accountSignIn: 'Se connecter',
  accountSignOut: 'Se déconnecter',
  accountCreate: 'Créer un compte',
  accountCreateMine: 'Créer mon compte',
  accountSignInText: 'Pour retrouver vos commandes et vos adresses.',
  accountSignUpText: 'Vos adresses enregistrées, vos commandes au même endroit.',
  accountPasswordHint: '8 caractères minimum',
  accountNoAccount: 'Pas encore de compte ?',
  accountHaveAccount: 'Vous avez déjà un compte ?',
  accountGuestOrder: 'Commande passée sans compte ?',
  accountTrackByEmail: 'Suivez-la par e-mail',
  accountBadCredentials: 'E-mail ou mot de passe incorrect.',
  accountRecentOrders: 'Dernières commandes',
  accountNoOrdersTitle: 'Aucune commande pour l\'instant',
  accountNoOrdersMessage: 'Vos achats apparaîtront ici dès la première commande.',
  accountDetails: 'Mes informations',
  accountEmailHint: 'non modifiable',
  accountAddressName: 'Nom de l\'adresse',
  accountAddressNameHint: 'Maison, Bureau…',
  accountCountryHint: 'code à 2 lettres',
  accountNoAddressTitle: 'Aucune adresse enregistrée',
  accountNoAddressMessage: 'Ajoutez-en une et le checkout la proposera automatiquement.',
  accountDeleteAddress: 'Supprimer cette adresse ?',
  // Orders: confirmation, detail, tracking, returns
  orderTitle: 'Votre commande',
  orderFallbackTitle: 'Commande',
  orderNumberTitle: 'Commande n° {id}',
  orderNumber: 'N° {id}',
  orderPlacedOn: 'Commande du {date}',
  orderReturnableOne: '{count} unité retournable',
  orderReturnableOther: '{count} unités retournables',
  orderReturnDone: 'Votre demande de retour est enregistrée. Nous vous envoyons l\'étiquette par e-mail.',
  orderReturnPrompt: 'Un article ne convient pas ?',
  orderRequestReturn: 'Demander un retour',
  orderReturnQuantityFor: 'Quantité à retourner pour {title}',
  orderReturnReason: 'Motif',
  orderReturnNoReason: 'Ne pas préciser',
  orderReturnNote: 'Précisions',
  orderSendReturn: 'Envoyer la demande',
  orderNotFoundTitle: 'Commande introuvable',
  orderNotFoundAccountMessage: 'Elle a peut-être été passée avec une autre adresse e-mail.',
  orderNotFoundGuestMessage: 'Vérifiez le numéro et l\'adresse e-mail utilisée lors de l\'achat.',
  orderThanks: 'Merci, c\'est commandé.',
  orderConfirmationSent: 'Un e-mail de confirmation part vers {email}. Nous préparons votre colis.',
  orderFindMine: 'Retrouver ma commande',
  orderAllMine: 'Toutes mes commandes',
  orderTrack: 'Suivre une commande',
  orderTrackText: 'Le numéro figure dans votre e-mail de confirmation. Pas besoin de compte.',
  orderNumberField: 'Numéro de commande',
  orderEmailField: 'E-mail utilisé pour la commande',
  orderSeeMine: 'Voir ma commande',
  orderHaveAccount: 'Vous avez un compte ?',
  orderSignInLink: 'Connectez-vous',
  orderSignInHint: 'pour retrouver tout l\'historique.',
  // Footer
  footerTagline: 'Objets pour la maison, choisis pour durer. Expédié depuis Nantes sous 48 h.',
  footerCollections: 'Collections',
  footerCategories: 'Rayons',
  footerAccount: 'Votre compte',
  footerDemo: 'Pygmalion playground — boutique de démonstration',
  footerAdmin: 'Administration',
}

export const shopText: Record<ShopLocale, Record<ShopTextKey, string>> = { en, fr }
