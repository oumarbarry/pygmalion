/**
 * No jargon in user-facing text. Single glossary: every
 * user-facing string that used to be a technical term goes through
 * `t(key)` so there is exactly one place to fix wording or add a language.
 *
 * Deliberately a plain Record + composable instead of @nuxt/i18n: no
 * routing/SEO need for an SSR-less internal admin, and this repo has no
 * other i18n consumer yet.
 */
export type Locale = 'fr' | 'en'

type BaseVocabKey =
  // Jargon -> plain words
  | 'sku' // "SKU" -> "référence"
  | 'variant' // "variant" -> "déclinaison"
  | 'variants'
  | 'fulfillment' // "fulfillment" -> "expédition"
  | 'fulfillOrder'
  | 'publishableApiKey' // "publishable API key" -> "clé boutique"
  | 'secretApiKey'
  | 'inventory'
  | 'reservation'
  // Sections (sidebar: task-based, 6 max)
  | 'sectionToday'
  | 'sectionOrders'
  | 'sectionProducts'
  | 'sectionCustomers'
  | 'sectionPromotions'
  | 'sectionSettings'
  // Common actions / chrome
  | 'save'
  | 'cancel'
  | 'confirm'
  | 'delete'
  | 'edit'
  | 'create'
  | 'back'
  | 'next'
  | 'finish'
  | 'wizardStepLabel'
  | 'wizardSummaryTitle'
  | 'wizNoReasons'
  | 'wizNoLocations'
  | 'wizNoRegions'
  | 'orderSectionAddress'
  | 'orderNoAddress'
  | 'signInBadCredentials'
  | 'search'
  | 'searchPlaceholder'
  | 'searchNoResults'
  | 'signIn'
  | 'signOut'
  | 'signInTitle'
  | 'signInSubtitle'
  | 'email'
  | 'password'
  | 'name'
  | 'firstBootTitle'
  | 'firstBootSubtitle'
  | 'firstBootAction'
  | 'firstBootAlreadyDone'
  | 'acceptInviteTitle'
  | 'acceptInviteSubtitle'
  | 'acceptInviteAction'
  | 'loading'
  | 'errorTitle'
  | 'errorGeneric'
  | 'errorUnauthorized'
  | 'emptyGenericTitle'
  | 'emptyGenericAction'
  | 'comingSoon'
  | 'confirmDeleteTitle'
  | 'confirmDeleteBody'
  | 'todayTitle'
  | 'todaySubtitle'
  | 'todayToShip'
  | 'todayToShipEmptyTitle'
  | 'todayToShipEmptyDescription'
  | 'todayToRefund'
  | 'todayToRefundEmptyTitle'
  | 'todayToRefundEmptyDescription'
  | 'todayLowStock'
  | 'todayLowStockEmptyTitle'
  | 'todayLowStockEmptyDescription'
  | 'todayNoPhoto'
  | 'todayNoPhotoEmptyTitle'
  | 'todayNoPhotoEmptyDescription'
  // --- Produits: shared chrome ----------------------------------------------
  | 'openMenu'
  | 'add'
  | 'remove'
  | 'apply'
  | 'quantity'
  | 'optional'
  | 'yes'
  | 'no'
  | 'all'
  | 'none'
  | 'skip'
  | 'retry'
  | 'navProducts'
  | 'navCollections'
  | 'navCategories'
  | 'navTags'
  | 'navStock'
  | 'navPricing'
  // --- Products list ---------------------------------------------------------
  | 'productsSubtitle'
  | 'newProduct'
  | 'productName'
  | 'productPhoto'
  | 'productDescription'
  | 'productStatus'
  | 'statusPublished'
  | 'statusDraft'
  | 'statusProposed'
  | 'statusRejected'
  | 'publishAction'
  | 'unpublishAction'
  | 'filterStatus'
  | 'filterCollection'
  | 'filterCategory'
  | 'filterAny'
  | 'productsSearchPlaceholder'
  | 'productsEmptyTitle'
  | 'productsEmptyDescription'
  | 'productsEmptyAction'
  | 'noResultsTitle'
  | 'noResultsDescription'
  | 'giftcard'
  | 'giftcardHint'
  | 'deleteProductTitle'
  | 'deleteProductBody'
  | 'productNotFound'
  | 'productNameRequired'
  // --- Product wizard --------------------------------------------------------
  | 'newProductSubtitle'
  | 'wizardModeSwitchToForm'
  | 'wizardModeSwitchToSteps'
  | 'fullFormTitle'
  | 'stepInfos'
  | 'stepInfosDescription'
  | 'stepPhotos'
  | 'stepPhotosDescription'
  | 'stepVariants'
  | 'stepVariantsDescription'
  | 'stepPrices'
  | 'stepPricesDescription'
  | 'stepStock'
  | 'stepStockDescription'
  | 'stepChannels'
  | 'stepChannelsDescription'
  | 'summaryTitle'
  | 'summaryDescription'
  | 'createAndPublish'
  | 'saveAsDraft'
  | 'addPhotos'
  | 'addPhotosHint'
  | 'uploading'
  | 'noPhotosYet'
  | 'photoCount'
  | 'variantsQuestion'
  | 'variantsNoAnswer'
  | 'variantsYesAnswer'
  | 'optionTitleLabel'
  | 'optionTitlePlaceholder'
  | 'optionValuesLabel'
  | 'optionValuesPlaceholder'
  | 'addOption'
  | 'generatedVariants'
  | 'referenceHint'
  | 'priceLabel'
  | 'samePriceForAll'
  | 'noCurrencyTitle'
  | 'noCurrencyDescription'
  | 'stockQuantityLabel'
  | 'stockLocationLabel'
  | 'noStockLocationTitle'
  | 'noStockLocationDescription'
  | 'channelsQuestion'
  | 'noChannelTitle'
  | 'noChannelDescription'
  // --- Product edit ----------------------------------------------------------
  | 'tabInfos'
  | 'tabPhotos'
  | 'tabVariants'
  | 'tabPrices'
  | 'tabStock'
  | 'tabChannels'
  | 'deletePhotoTitle'
  | 'deletePhotoBody'
  | 'pricesNeedPublishTitle'
  | 'pricesNeedPublishDescription'
  | 'stockNeedsReferenceTitle'
  | 'stockNeedsReferenceDescription'
  | 'deleteVariantTitle'
  | 'deleteVariantBody'
  // --- Collections -----------------------------------------------------------
  | 'collections'
  | 'collectionsSubtitle'
  | 'newCollection'
  | 'collectionTitleLabel'
  | 'collectionsEmptyTitle'
  | 'collectionsEmptyDescription'
  | 'deleteCollectionTitle'
  | 'deleteCollectionBody'
  | 'collectionProducts'
  | 'collectionProductsEmptyTitle'
  | 'collectionProductsEmptyDescription'
  | 'addProductsLabel'
  | 'addProductsPlaceholder'
  // --- Categories ------------------------------------------------------------
  | 'categories'
  | 'categoriesSubtitle'
  | 'newCategory'
  | 'newSubcategory'
  | 'categoryNameLabel'
  | 'categoryParentLabel'
  | 'categoryNoParent'
  | 'categoryVisible'
  | 'categoryHidden'
  | 'categoryVisibleHint'
  | 'categoriesEmptyTitle'
  | 'categoriesEmptyDescription'
  | 'deleteCategoryTitle'
  | 'deleteCategoryBody'
  | 'expandCategory'
  | 'collapseCategory'
  | 'categoryProducts'
  // --- Tags ------------------------------------------------------------------
  | 'tags'
  | 'tagsSubtitle'
  | 'newTag'
  | 'tagValueLabel'
  | 'tagsEmptyTitle'
  | 'tagsEmptyDescription'
  | 'deleteTagTitle'
  | 'deleteTagBody'
  | 'renameTag'
  // --- Stock -----------------------------------------------------------------
  | 'stockTitle'
  | 'stockSubtitle'
  | 'stockItem'
  | 'stockOnHand'
  | 'stockIncoming'
  | 'stockReserved'
  | 'stockAvailable'
  | 'stockLowBadge'
  | 'stockOkBadge'
  | 'stockOutBadge'
  | 'stockAdjust'
  | 'stockAdjustTitle'
  | 'stockReasonQuestion'
  | 'stockReasonReceived'
  | 'stockReasonLost'
  | 'stockReasonCorrection'
  | 'stockNewTotal'
  | 'stockEmptyTitle'
  | 'stockEmptyDescription'
  | 'stockNoLevelTitle'
  | 'stockNoLevelDescription'
  | 'reservations'
  | 'reservationsSubtitle'
  | 'reservationsEmptyTitle'
  | 'reservationsEmptyDescription'
  | 'reservationOrderRef'
  | 'reservationLocation'
  // --- Price preferences -----------------------------------------------------
  | 'pricingTitle'
  | 'pricingSubtitle'
  | 'taxIncluded'
  | 'taxExcluded'
  | 'taxIncludedHint'
  | 'appliesTo'
  | 'appliesToRegion'
  | 'appliesToCurrency'
  | 'newPricePreference'
  | 'pricingEmptyTitle'
  | 'pricingEmptyDescription'
  | 'deletePricePreferenceTitle'
  | 'deletePricePreferenceBody'

const fr: Record<BaseVocabKey, string> = {
  sku: 'référence',
  variant: 'déclinaison',
  variants: 'déclinaisons',
  fulfillment: 'expédition',
  fulfillOrder: 'expédier la commande',
  publishableApiKey: 'clé boutique',
  secretApiKey: 'clé serveur',
  inventory: 'stock',
  reservation: 'réservation de stock',
  sectionToday: 'Aujourd’hui',
  sectionOrders: 'Commandes',
  sectionProducts: 'Produits',
  sectionCustomers: 'Clients',
  sectionPromotions: 'Promotions',
  sectionSettings: 'Réglages',
  save: 'Enregistrer',
  cancel: 'Annuler',
  confirm: 'Confirmer',
  delete: 'Supprimer',
  edit: 'Modifier',
  create: 'Créer',
  back: 'Retour',
  next: 'Suivant',
  finish: 'Terminer',
  wizardStepLabel: 'Étape',
  wizardSummaryTitle: 'Vérifiez avant de valider',
  wizNoReasons: 'Vous n’avez pas encore de motifs enregistrés. Ce n’est pas bloquant : continuez, ce sera enregistré sans motif.',
  wizNoLocations: 'Aucun lieu de stockage n’est enregistré. Il en faut un pour savoir où la marchandise revient.',
  wizNoRegions: 'Aucune zone de vente n’est enregistrée. Créez-en une dans Réglages → Zones de vente : c’est elle qui décide de la monnaie.',
  orderSectionAddress: 'Où ça va',
  orderNoAddress: 'Cette commande n’a pas d’adresse de livraison.',
  signInBadCredentials: 'E-mail ou mot de passe incorrect.',
  search: 'Rechercher',
  searchPlaceholder: 'Rechercher un produit, une commande, un client…',
  searchNoResults: 'Aucun résultat',
  signIn: 'Se connecter',
  signOut: 'Se déconnecter',
  signInTitle: 'Connexion',
  signInSubtitle: 'Accédez à votre espace boutique',
  email: 'E-mail',
  password: 'Mot de passe',
  name: 'Nom',
  firstBootTitle: 'Bienvenue',
  firstBootSubtitle: 'Créez le premier compte propriétaire de la boutique',
  firstBootAction: 'Créer mon compte',
  firstBootAlreadyDone: 'La boutique a déjà un compte. Connectez-vous.',
  acceptInviteTitle: 'Rejoindre l’équipe',
  acceptInviteSubtitle: 'Choisissez un mot de passe pour activer votre compte',
  acceptInviteAction: 'Activer mon compte',
  loading: 'Chargement…',
  errorTitle: 'Erreur',
  errorGeneric: 'Une erreur est survenue. Réessayez.',
  errorUnauthorized: 'Session expirée, reconnectez-vous.',
  emptyGenericTitle: 'Rien à afficher pour le moment',
  emptyGenericAction: 'Commencer',
  comingSoon: 'Cet écran arrive bientôt.',
  confirmDeleteTitle: 'Supprimer définitivement ?',
  confirmDeleteBody: 'Cette action est irréversible.',
  todayTitle: 'Aujourd’hui',
  todaySubtitle: 'Ce qui a besoin de vous, en un coup d’œil',
  todayToShip: 'À expédier',
  todayToShipEmptyTitle: 'Rien à expédier',
  todayToShipEmptyDescription: 'Dès qu’une commande sera payée, elle apparaîtra ici pour être préparée puis expédiée.',
  todayToRefund: 'À rembourser',
  todayToRefundEmptyTitle: 'Aucun remboursement en attente',
  todayToRefundEmptyDescription: 'Les demandes de retour ou de remboursement des clients apparaîtront ici.',
  todayLowStock: 'Bientôt en rupture',
  todayLowStockEmptyTitle: 'Vos stocks tiennent bon',
  todayLowStockEmptyDescription: 'Dès qu’un article passera sous 5 unités disponibles, il apparaîtra ici pour être réapprovisionné.',
  todayNoPhoto: 'Produits sans photo',
  todayNoPhotoEmptyTitle: 'Tous vos produits ont une photo',
  todayNoPhotoEmptyDescription: 'Une photo, c’est ce qui fait vendre : les produits qui en manquent apparaîtront ici.',

  openMenu: 'Ouvrir le menu',
  add: 'Ajouter',
  remove: 'Retirer',
  apply: 'Appliquer',
  quantity: 'Quantité',
  optional: 'facultatif',
  yes: 'Oui',
  no: 'Non',
  all: 'Tout',
  none: 'Aucun',
  skip: 'Passer cette étape',
  retry: 'Réessayer',
  navProducts: 'Mes produits',
  navCollections: 'Collections',
  navCategories: 'Catégories',
  navTags: 'Étiquettes',
  navStock: 'Stock',
  navPricing: 'Prix & taxes',

  productsSubtitle: 'Tout ce que vous vendez',
  newProduct: 'Ajouter un produit',
  productName: 'Nom du produit',
  productPhoto: 'Photo',
  productDescription: 'Description',
  productStatus: 'État',
  statusPublished: 'En vente',
  statusDraft: 'Brouillon',
  statusProposed: 'À valider',
  statusRejected: 'Refusé',
  publishAction: 'Mettre en vente',
  unpublishAction: 'Retirer de la vente',
  filterStatus: 'État',
  filterCollection: 'Collection',
  filterCategory: 'Catégorie',
  filterAny: 'Tous',
  productsSearchPlaceholder: 'Chercher un produit par son nom…',
  productsEmptyTitle: 'Aucun produit pour l’instant',
  productsEmptyDescription: 'Un produit, c’est ce que vos clients achètent : un nom, une photo, un prix. Ajoutez le premier, on vous guide pas à pas.',
  productsEmptyAction: 'Ajouter mon premier produit',
  noResultsTitle: 'Aucun produit ne correspond',
  noResultsDescription: 'Essayez un autre mot, ou retirez les filtres pour voir toute votre boutique.',
  giftcard: 'Carte cadeau',
  giftcardHint: 'Une carte cadeau ne peut pas être soldée ni remisée.',
  deleteProductTitle: 'Supprimer ce produit ?',
  deleteProductBody: 'Il disparaîtra de votre boutique et vos clients ne pourront plus l’acheter. Les commandes déjà passées ne changent pas.',
  productNotFound: 'Ce produit n’existe pas ou a été supprimé.',
  productNameRequired: 'Donnez d’abord un nom à votre produit.',

  newProductSubtitle: 'On avance étape par étape, une question à la fois',
  wizardModeSwitchToForm: 'Tout remplir d’un coup',
  wizardModeSwitchToSteps: 'Revenir aux étapes',
  fullFormTitle: 'Formulaire complet',
  stepInfos: 'Le produit',
  stepInfosDescription: 'Comment s’appelle-t-il, et qu’est-ce que c’est ?',
  stepPhotos: 'Les photos',
  stepPhotosDescription: 'Montrez-le. C’est la photo qui fait vendre.',
  stepVariants: 'Les déclinaisons',
  stepVariantsDescription: 'Existe-t-il en plusieurs tailles, couleurs… ?',
  stepPrices: 'Le prix',
  stepPricesDescription: 'Combien le vendez-vous ?',
  stepStock: 'Le stock',
  stepStockDescription: 'Combien en avez-vous en réserve ?',
  stepChannels: 'Où le vendre',
  stepChannelsDescription: 'Sur quelle boutique doit-il apparaître ?',
  summaryTitle: 'On récapitule',
  summaryDescription: 'Vérifiez, puis mettez votre produit en vente.',
  createAndPublish: 'Mettre en vente',
  saveAsDraft: 'Garder en brouillon',
  addPhotos: 'Choisir des photos',
  addPhotosHint: 'Une photo claire, sur fond simple, vaut mieux que dix floues.',
  uploading: 'Envoi en cours…',
  noPhotosYet: 'Aucune photo pour l’instant',
  photoCount: 'photo(s)',
  variantsQuestion: 'Ce produit existe-t-il en plusieurs versions ?',
  variantsNoAnswer: 'Non, un seul modèle',
  variantsYesAnswer: 'Oui : tailles, couleurs…',
  optionTitleLabel: 'Type de choix',
  optionTitlePlaceholder: 'Taille, Couleur, Parfum…',
  optionValuesLabel: 'Les choix possibles, séparés par une virgule',
  optionValuesPlaceholder: 'S, M, L',
  addOption: 'Ajouter un autre type de choix',
  generatedVariants: 'Voici les versions que vous allez vendre',
  referenceHint: 'Votre code interne, si vous en utilisez un.',
  priceLabel: 'Prix de vente',
  samePriceForAll: 'Même prix pour toutes les versions',
  noCurrencyTitle: 'Aucune devise configurée',
  noCurrencyDescription: 'Créez d’abord une zone de vente dans les Réglages : c’est elle qui décide dans quelle monnaie vous vendez.',
  stockQuantityLabel: 'Quantité en réserve',
  stockLocationLabel: 'Lieu de stockage',
  noStockLocationTitle: 'Aucun lieu de stockage',
  noStockLocationDescription: 'Créez d’abord un lieu de stockage dans les Réglages pour compter votre marchandise. Vous pouvez passer cette étape et le faire plus tard.',
  channelsQuestion: 'Cochez les boutiques où ce produit doit apparaître.',
  noChannelTitle: 'Aucune boutique configurée',
  noChannelDescription: 'Votre produit sera visible partout par défaut. Vous pourrez créer des boutiques séparées dans les Réglages.',

  tabInfos: 'Le produit',
  tabPhotos: 'Photos',
  tabVariants: 'Déclinaisons',
  tabPrices: 'Prix',
  tabStock: 'Stock',
  tabChannels: 'Boutiques',
  deletePhotoTitle: 'Supprimer cette photo ?',
  deletePhotoBody: 'Elle ne sera plus visible par vos clients. Vous pourrez toujours en ajouter une autre.',
  pricesNeedPublishTitle: 'Prix visibles une fois en vente',
  pricesNeedPublishDescription: 'Mettez ce produit en vente pour voir et modifier ses prix ici. En attendant, vous pouvez fixer un premier prix.',
  stockNeedsReferenceTitle: 'Donnez une référence à vos déclinaisons',
  stockNeedsReferenceDescription: 'Le stock se compte par référence. Ajoutez une référence à chaque déclinaison dans l’onglet Déclinaisons, puis revenez ici.',
  deleteVariantTitle: 'Supprimer cette déclinaison ?',
  deleteVariantBody: 'Vos clients ne pourront plus la commander. Les commandes déjà passées ne changent pas.',

  collections: 'Collections',
  collectionsSubtitle: 'Des sélections de produits à mettre en avant',
  newCollection: 'Nouvelle collection',
  collectionTitleLabel: 'Nom de la collection',
  collectionsEmptyTitle: 'Aucune collection',
  collectionsEmptyDescription: 'Une collection regroupe des produits qui vont ensemble : « Nouveautés », « Été », « Cadeaux ». Créez la première.',
  deleteCollectionTitle: 'Supprimer cette collection ?',
  deleteCollectionBody: 'Les produits qu’elle contient ne sont pas supprimés : ils restent en vente, simplement plus regroupés ici.',
  collectionProducts: 'Produits de la collection',
  collectionProductsEmptyTitle: 'Collection vide',
  collectionProductsEmptyDescription: 'Ajoutez-y vos produits pour les présenter ensemble à vos clients.',
  addProductsLabel: 'Ajouter un produit',
  addProductsPlaceholder: 'Choisir un produit…',

  categories: 'Catégories',
  categoriesSubtitle: 'Le rangement de votre boutique, rayon par rayon',
  newCategory: 'Nouvelle catégorie',
  newSubcategory: 'Ajouter une sous-catégorie',
  categoryNameLabel: 'Nom de la catégorie',
  categoryParentLabel: 'Ranger dans',
  categoryNoParent: 'Rien (catégorie principale)',
  categoryVisible: 'Visible',
  categoryHidden: 'Masquée',
  categoryVisibleHint: 'Une catégorie masquée n’apparaît pas dans votre boutique.',
  categoriesEmptyTitle: 'Aucune catégorie',
  categoriesEmptyDescription: 'Les catégories aident vos clients à s’y retrouver : « Vêtements », puis « Chemises » dedans. Créez la première.',
  deleteCategoryTitle: 'Supprimer cette catégorie ?',
  deleteCategoryBody: 'Ses sous-catégories seront supprimées avec elle. Vos produits restent en vente, simplement plus rangés ici.',
  expandCategory: 'Afficher les sous-catégories',
  collapseCategory: 'Masquer les sous-catégories',
  categoryProducts: 'Produits de la catégorie',

  tags: 'Étiquettes',
  tagsSubtitle: 'Des mots-clés pour retrouver et filtrer vos produits',
  newTag: 'Nouvelle étiquette',
  tagValueLabel: 'Mot-clé',
  tagsEmptyTitle: 'Aucune étiquette',
  tagsEmptyDescription: 'Une étiquette est un mot-clé : « bio », « soldes », « fait main ». Créez la première.',
  deleteTagTitle: 'Supprimer cette étiquette ?',
  deleteTagBody: 'Elle disparaîtra de tous les produits qui la portent. Les produits eux-mêmes restent en vente.',
  renameTag: 'Renommer',

  stockTitle: 'Stock',
  stockSubtitle: 'Ce qu’il vous reste, et ce qui est déjà promis',
  stockItem: 'Article',
  stockOnHand: 'En réserve',
  stockIncoming: 'En chemin',
  stockReserved: 'Promis à des clients',
  stockAvailable: 'Vendable',
  stockLowBadge: 'Bientôt épuisé',
  stockOkBadge: 'En stock',
  stockOutBadge: 'Épuisé',
  stockAdjust: 'Corriger le stock',
  stockAdjustTitle: 'Corriger le stock',
  stockReasonQuestion: 'Que s’est-il passé ?',
  stockReasonReceived: 'J’ai reçu de la marchandise',
  stockReasonLost: 'J’ai perdu ou cassé de la marchandise',
  stockReasonCorrection: 'Je corrige le compte après vérification',
  stockNewTotal: 'Nouveau total en réserve',
  stockEmptyTitle: 'Rien à compter pour l’instant',
  stockEmptyDescription: 'Le stock apparaît ici dès qu’un produit a une référence et une quantité. Ajoutez un produit pour commencer.',
  stockNoLevelTitle: 'Pas encore compté',
  stockNoLevelDescription: 'Cet article n’a de quantité dans aucun lieu de stockage. Corrigez le stock pour en saisir une.',
  reservations: 'Déjà promis',
  reservationsSubtitle: 'La marchandise réservée par des commandes en cours',
  reservationsEmptyTitle: 'Rien de réservé',
  reservationsEmptyDescription: 'Quand un client commande, sa marchandise est mise de côté ici jusqu’à l’expédition.',
  reservationOrderRef: 'Article commandé',
  reservationLocation: 'Lieu',

  pricingTitle: 'Prix & taxes',
  pricingSubtitle: 'Vos prix affichés contiennent-ils la taxe ?',
  taxIncluded: 'Taxe comprise dans le prix',
  taxExcluded: 'Taxe ajoutée au moment de payer',
  taxIncludedHint: 'En France et en Europe, les prix affichés aux particuliers contiennent la taxe.',
  appliesTo: 'S’applique à',
  appliesToRegion: 'Une zone de vente',
  appliesToCurrency: 'Une monnaie',
  newPricePreference: 'Ajouter une règle',
  pricingEmptyTitle: 'Aucune règle de taxe',
  pricingEmptyDescription: 'Sans règle, vos prix sont considérés hors taxe et la taxe est ajoutée au paiement. Ajoutez une règle pour changer cela.',
  deletePricePreferenceTitle: 'Supprimer cette règle ?',
  deletePricePreferenceBody: 'Les prix concernés redeviendront hors taxe : la taxe sera ajoutée au moment de payer.',
}

const en: Record<BaseVocabKey, string> = {
  sku: 'reference',
  variant: 'variant',
  variants: 'variants',
  fulfillment: 'shipment',
  fulfillOrder: 'ship the order',
  publishableApiKey: 'store key',
  secretApiKey: 'server key',
  inventory: 'stock',
  reservation: 'stock hold',
  sectionToday: 'Today',
  sectionOrders: 'Orders',
  sectionProducts: 'Products',
  sectionCustomers: 'Customers',
  sectionPromotions: 'Promotions',
  sectionSettings: 'Settings',
  save: 'Save',
  cancel: 'Cancel',
  confirm: 'Confirm',
  delete: 'Delete',
  edit: 'Edit',
  create: 'Create',
  back: 'Back',
  next: 'Next',
  finish: 'Finish',
  wizardStepLabel: 'Step',
  wizardSummaryTitle: 'Check before you confirm',
  wizNoReasons: 'You have no reasons saved yet. That is not blocking: carry on, this will be recorded without one.',
  wizNoLocations: 'No storage location is registered. You need one to know where the goods come back to.',
  wizNoRegions: 'No selling area is registered. Create one under Settings → Selling areas: it decides the currency.',
  orderSectionAddress: 'Where it goes',
  orderNoAddress: 'This order has no delivery address.',
  signInBadCredentials: 'Wrong e-mail or password.',
  search: 'Search',
  searchPlaceholder: 'Search a product, order, customer…',
  searchNoResults: 'No results',
  signIn: 'Sign in',
  signOut: 'Sign out',
  signInTitle: 'Sign in',
  signInSubtitle: 'Access your store',
  email: 'Email',
  password: 'Password',
  name: 'Name',
  firstBootTitle: 'Welcome',
  firstBootSubtitle: 'Create the store’s first owner account',
  firstBootAction: 'Create my account',
  firstBootAlreadyDone: 'This store already has an account. Please sign in.',
  acceptInviteTitle: 'Join the team',
  acceptInviteSubtitle: 'Choose a password to activate your account',
  acceptInviteAction: 'Activate my account',
  loading: 'Loading…',
  errorTitle: 'Error',
  errorGeneric: 'Something went wrong. Please try again.',
  errorUnauthorized: 'Your session expired, please sign in again.',
  emptyGenericTitle: 'Nothing to show yet',
  emptyGenericAction: 'Get started',
  comingSoon: 'This screen is coming soon.',
  confirmDeleteTitle: 'Delete for good?',
  confirmDeleteBody: 'This cannot be undone.',
  todayTitle: 'Today',
  todaySubtitle: 'What needs you, at a glance',
  todayToShip: 'To ship',
  todayToShipEmptyTitle: 'Nothing to ship',
  todayToShipEmptyDescription: 'As soon as an order is paid, it will show up here to be prepared and shipped.',
  todayToRefund: 'To refund',
  todayToRefundEmptyTitle: 'No refund pending',
  todayToRefundEmptyDescription: 'Customer return or refund requests will show up here.',
  todayLowStock: 'Running low',
  todayLowStockEmptyTitle: 'Your stock is holding up',
  todayLowStockEmptyDescription: 'As soon as an item drops below 5 sellable units, it shows up here to be restocked.',
  todayNoPhoto: 'Products without a photo',
  todayNoPhotoEmptyTitle: 'Every product has a photo',
  todayNoPhotoEmptyDescription: 'A photo is what sells: products missing one will show up here.',

  openMenu: 'Open menu',
  add: 'Add',
  remove: 'Remove',
  apply: 'Apply',
  quantity: 'Quantity',
  optional: 'optional',
  yes: 'Yes',
  no: 'No',
  all: 'All',
  none: 'None',
  skip: 'Skip this step',
  retry: 'Try again',
  navProducts: 'My products',
  navCollections: 'Collections',
  navCategories: 'Categories',
  navTags: 'Tags',
  navStock: 'Stock',
  navPricing: 'Prices & tax',

  productsSubtitle: 'Everything you sell',
  newProduct: 'Add a product',
  productName: 'Product name',
  productPhoto: 'Photo',
  productDescription: 'Description',
  productStatus: 'Status',
  statusPublished: 'On sale',
  statusDraft: 'Draft',
  statusProposed: 'To review',
  statusRejected: 'Rejected',
  publishAction: 'Put on sale',
  unpublishAction: 'Take off sale',
  filterStatus: 'Status',
  filterCollection: 'Collection',
  filterCategory: 'Category',
  filterAny: 'All',
  productsSearchPlaceholder: 'Search a product by name…',
  productsEmptyTitle: 'No products yet',
  productsEmptyDescription: 'A product is what your customers buy: a name, a photo, a price. Add your first one — we walk you through it.',
  productsEmptyAction: 'Add my first product',
  noResultsTitle: 'No matching product',
  noResultsDescription: 'Try another word, or clear the filters to see your whole store.',
  giftcard: 'Gift card',
  giftcardHint: 'A gift card can never be discounted.',
  deleteProductTitle: 'Delete this product?',
  deleteProductBody: 'It disappears from your store and customers can no longer buy it. Past orders are unaffected.',
  productNotFound: 'This product does not exist or has been deleted.',
  productNameRequired: 'Give your product a name first.',

  newProductSubtitle: 'One step at a time, one question at a time',
  wizardModeSwitchToForm: 'Fill everything at once',
  wizardModeSwitchToSteps: 'Back to steps',
  fullFormTitle: 'Full form',
  stepInfos: 'The product',
  stepInfosDescription: 'What is it called, and what is it?',
  stepPhotos: 'Photos',
  stepPhotosDescription: 'Show it. The photo is what sells.',
  stepVariants: 'Variants',
  stepVariantsDescription: 'Does it come in several sizes, colors…?',
  stepPrices: 'Price',
  stepPricesDescription: 'How much do you sell it for?',
  stepStock: 'Stock',
  stepStockDescription: 'How many do you have on hand?',
  stepChannels: 'Where to sell it',
  stepChannelsDescription: 'Which storefront should show it?',
  summaryTitle: 'Let’s recap',
  summaryDescription: 'Check it over, then put your product on sale.',
  createAndPublish: 'Put on sale',
  saveAsDraft: 'Keep as draft',
  addPhotos: 'Choose photos',
  addPhotosHint: 'One clear photo on a plain background beats ten blurry ones.',
  uploading: 'Uploading…',
  noPhotosYet: 'No photo yet',
  photoCount: 'photo(s)',
  variantsQuestion: 'Does this product come in several versions?',
  variantsNoAnswer: 'No, a single model',
  variantsYesAnswer: 'Yes: sizes, colors…',
  optionTitleLabel: 'Kind of choice',
  optionTitlePlaceholder: 'Size, Color, Scent…',
  optionValuesLabel: 'The possible choices, separated by commas',
  optionValuesPlaceholder: 'S, M, L',
  addOption: 'Add another kind of choice',
  generatedVariants: 'Here are the versions you will sell',
  referenceHint: 'Your internal code, if you use one.',
  priceLabel: 'Selling price',
  samePriceForAll: 'Same price for every version',
  noCurrencyTitle: 'No currency set up',
  noCurrencyDescription: 'Create a selling area in Settings first: it decides which money you sell in.',
  stockQuantityLabel: 'Quantity on hand',
  stockLocationLabel: 'Storage place',
  noStockLocationTitle: 'No storage place',
  noStockLocationDescription: 'Create a storage place in Settings first to count your goods. You can skip this step and do it later.',
  channelsQuestion: 'Tick the storefronts this product should appear on.',
  noChannelTitle: 'No storefront set up',
  noChannelDescription: 'Your product will be visible everywhere by default. You can create separate storefronts in Settings.',

  tabInfos: 'The product',
  tabPhotos: 'Photos',
  tabVariants: 'Variants',
  tabPrices: 'Price',
  tabStock: 'Stock',
  tabChannels: 'Storefronts',
  deletePhotoTitle: 'Delete this photo?',
  deletePhotoBody: 'Customers will no longer see it. You can always add another one.',
  pricesNeedPublishTitle: 'Prices show once on sale',
  pricesNeedPublishDescription: 'Put this product on sale to see and change its prices here. In the meantime you can set a first price.',
  stockNeedsReferenceTitle: 'Give your variants a reference',
  stockNeedsReferenceDescription: 'Stock is counted by reference. Add a reference to each variant in the Variants tab, then come back here.',
  deleteVariantTitle: 'Delete this variant?',
  deleteVariantBody: 'Customers can no longer order it. Past orders are unaffected.',

  collections: 'Collections',
  collectionsSubtitle: 'Hand-picked sets of products to feature',
  newCollection: 'New collection',
  collectionTitleLabel: 'Collection name',
  collectionsEmptyTitle: 'No collections',
  collectionsEmptyDescription: 'A collection groups products that belong together: “New in”, “Summer”, “Gifts”. Create the first one.',
  deleteCollectionTitle: 'Delete this collection?',
  deleteCollectionBody: 'The products inside are not deleted: they stay on sale, just no longer grouped here.',
  collectionProducts: 'Products in this collection',
  collectionProductsEmptyTitle: 'Empty collection',
  collectionProductsEmptyDescription: 'Add your products to present them together to your customers.',
  addProductsLabel: 'Add a product',
  addProductsPlaceholder: 'Pick a product…',

  categories: 'Categories',
  categoriesSubtitle: 'How your store is organised, aisle by aisle',
  newCategory: 'New category',
  newSubcategory: 'Add a sub-category',
  categoryNameLabel: 'Category name',
  categoryParentLabel: 'File under',
  categoryNoParent: 'Nothing (top-level category)',
  categoryVisible: 'Visible',
  categoryHidden: 'Hidden',
  categoryVisibleHint: 'A hidden category does not appear in your store.',
  categoriesEmptyTitle: 'No categories',
  categoriesEmptyDescription: 'Categories help customers find their way: “Clothing”, then “Shirts” inside it. Create the first one.',
  deleteCategoryTitle: 'Delete this category?',
  deleteCategoryBody: 'Its sub-categories are deleted with it. Your products stay on sale, just no longer filed here.',
  expandCategory: 'Show sub-categories',
  collapseCategory: 'Hide sub-categories',
  categoryProducts: 'Products in this category',

  tags: 'Tags',
  tagsSubtitle: 'Keywords to find and filter your products',
  newTag: 'New tag',
  tagValueLabel: 'Keyword',
  tagsEmptyTitle: 'No tags',
  tagsEmptyDescription: 'A tag is a keyword: “organic”, “sale”, “handmade”. Create the first one.',
  deleteTagTitle: 'Delete this tag?',
  deleteTagBody: 'It disappears from every product carrying it. The products themselves stay on sale.',
  renameTag: 'Rename',

  stockTitle: 'Stock',
  stockSubtitle: 'What you have left, and what is already promised',
  stockItem: 'Item',
  stockOnHand: 'On hand',
  stockIncoming: 'On its way',
  stockReserved: 'Promised to customers',
  stockAvailable: 'Sellable',
  stockLowBadge: 'Running low',
  stockOkBadge: 'In stock',
  stockOutBadge: 'Sold out',
  stockAdjust: 'Correct the stock',
  stockAdjustTitle: 'Correct the stock',
  stockReasonQuestion: 'What happened?',
  stockReasonReceived: 'I received goods',
  stockReasonLost: 'I lost or broke goods',
  stockReasonCorrection: 'I am correcting the count after checking',
  stockNewTotal: 'New quantity on hand',
  stockEmptyTitle: 'Nothing to count yet',
  stockEmptyDescription: 'Stock shows up here as soon as a product has a reference and a quantity. Add a product to get started.',
  stockNoLevelTitle: 'Not counted yet',
  stockNoLevelDescription: 'This item has no quantity in any storage place. Correct the stock to enter one.',
  reservations: 'Already promised',
  reservationsSubtitle: 'Goods held by orders in progress',
  reservationsEmptyTitle: 'Nothing held',
  reservationsEmptyDescription: 'When a customer orders, their goods are set aside here until you ship.',
  reservationOrderRef: 'Ordered item',
  reservationLocation: 'Place',

  pricingTitle: 'Prices & tax',
  pricingSubtitle: 'Do your displayed prices already include tax?',
  taxIncluded: 'Tax included in the price',
  taxExcluded: 'Tax added at checkout',
  taxIncludedHint: 'In France and the EU, prices shown to consumers include tax.',
  appliesTo: 'Applies to',
  appliesToRegion: 'A selling area',
  appliesToCurrency: 'A currency',
  newPricePreference: 'Add a rule',
  pricingEmptyTitle: 'No tax rule',
  pricingEmptyDescription: 'Without a rule, your prices count as tax-excluded and tax is added at checkout. Add a rule to change that.',
  deletePricePreferenceTitle: 'Delete this rule?',
  deletePricePreferenceBody: 'The prices concerned go back to tax-excluded: tax will be added at checkout.',
}

export const defaultLocale: Locale = 'en'
export const locales: readonly Locale[] = ['en', 'fr']
export const LOCALE_STORAGE_KEY = 'pygmalion-admin-locale'

/** The stored choice, else the browser language when it is one of ours, else English. */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'en' || stored === 'fr') return stored
  } catch {
    // storage unavailable (private mode, blocked): fall through to the browser language
  }
  return window.navigator?.language?.toLowerCase().startsWith('fr') ? 'fr' : defaultLocale
}

// --- Commandes / RMA / brouillons / encaissements ----------------------------
// Appended as its own block (union + records merged at the bottom of the file)
// so each section extends the glossary without touching the others' lines.
// Same rule as above: no user-facing string lives in a page.

export type OrdersVocabKey =
  | 'ordStatusPending' | 'ordStatusCompleted' | 'ordStatusCanceled' | 'ordStatusArchived'
  | 'ordStatusDraft' | 'ordStatusRequiresAction'
  | 'payStatusNotPaid' | 'payStatusAwaiting' | 'payStatusAuthorized' | 'payStatusPartiallyAuthorized'
  | 'payStatusCaptured' | 'payStatusPartiallyCaptured' | 'payStatusRefunded' | 'payStatusPartiallyRefunded'
  | 'payStatusCanceled'
  | 'shipStatusNotFulfilled' | 'shipStatusPartiallyFulfilled' | 'shipStatusFulfilled'
  | 'shipStatusPartiallyShipped' | 'shipStatusShipped' | 'shipStatusPartiallyDelivered'
  | 'shipStatusDelivered' | 'shipStatusCanceled'
  | 'retStatusRequested' | 'retStatusPartiallyReceived' | 'retStatusReceived' | 'retStatusCanceled'
  | 'rmaStatusRequested' | 'rmaStatusCompleted' | 'rmaStatusCanceled'
  | 'ordersSubtitle' | 'ordersTabToShip' | 'ordersTabToCollect' | 'ordersTabReturns' | 'ordersTabAll'
  | 'ordersSearchPlaceholder' | 'ordersColNumber' | 'ordersColCustomer' | 'ordersColDate'
  | 'ordersColAmount' | 'ordersColPayment' | 'ordersColShipping'
  | 'ordersEmptyAllTitle' | 'ordersEmptyAllDescription' | 'ordersEmptyToShipTitle'
  | 'ordersEmptyToShipDescription' | 'ordersEmptyToCollectTitle' | 'ordersEmptyToCollectDescription'
  | 'ordersEmptyReturnsTitle' | 'ordersEmptyReturnsDescription' | 'ordersEmptySearchTitle'
  | 'ordersEmptySearchDescription' | 'ordersLoadMore' | 'ordersDraftsLink'
  | 'orderNumberPrefix' | 'orderGuest' | 'orderNextStep' | 'orderNothingToDo'
  | 'orderSectionItems' | 'orderSectionPayments' | 'orderSectionShipments' | 'orderSectionReturns'
  | 'orderSectionExchanges' | 'orderSectionClaims' | 'orderSectionHistory' | 'orderSectionCustomer'
  | 'labelSubtotal' | 'labelDiscount' | 'labelShippingCost' | 'labelTax' | 'labelTotal'
  | 'labelPaid' | 'labelRefunded' | 'labelOutstanding' | 'labelRefundable' | 'labelQuantity'
  | 'labelUnitPrice' | 'labelTracking' | 'labelReason' | 'labelNote' | 'labelLocation'
  | 'labelDamaged' | 'labelReceivedQty' | 'labelRequestedQty' | 'labelDate' | 'labelStatus'
  | 'labelAmount' | 'labelNone' | 'labelOptional' | 'labelMax' | 'labelTitle' | 'labelPrice'
  | 'actionShip' | 'actionRefund' | 'actionReturn' | 'actionExchange' | 'actionClaim'
  | 'actionEditOrder' | 'actionCancelOrder' | 'actionArchiveOrder' | 'actionUnarchiveOrder'
  | 'actionCapture' | 'actionMarkDelivered' | 'actionCancelShipment' | 'actionMarkAsPaid'
  | 'actionCreateCollection' | 'actionReceiveReturn' | 'actionCancelReturn'
  | 'actionCompleteExchange' | 'actionCancelExchange' | 'actionCompleteClaim' | 'actionCancelClaim'
  | 'actionOpenReturn' | 'actionMore'
  | 'confirmCancelOrderTitle' | 'confirmCancelOrderBody' | 'confirmArchiveTitle' | 'confirmArchiveBody'
  | 'confirmUnarchiveTitle' | 'confirmUnarchiveBody' | 'confirmCaptureTitle' | 'confirmCaptureBody'
  | 'confirmCancelShipmentTitle' | 'confirmCancelShipmentBody' | 'confirmDeliveredTitle'
  | 'confirmDeliveredBody' | 'confirmMarkAsPaidTitle' | 'confirmMarkAsPaidBody'
  | 'confirmCreateCollectionTitle' | 'confirmCreateCollectionBody' | 'confirmCancelReturnTitle'
  | 'confirmCancelReturnBody' | 'confirmCompleteExchangeTitle' | 'confirmCompleteExchangeBody'
  | 'confirmCancelExchangeTitle' | 'confirmCancelExchangeBody' | 'confirmCompleteClaimTitle'
  | 'confirmCompleteClaimBody' | 'confirmCancelClaimTitle' | 'confirmCancelClaimBody'
  | 'confirmConvertDraftTitle' | 'confirmConvertDraftBody' | 'confirmCancelDraftTitle'
  | 'confirmCancelDraftBody'
  | 'whyNoCancelFulfillments' | 'whyNoCancelCaptured' | 'whyNoCancelCompleted'
  | 'whyNoArchiveCanceled' | 'whyNoReturn' | 'whyNoExchangeComplete' | 'whyNoShip' | 'whyNoRefund'
  | 'shipWizardTitle' | 'wizShipLinesTitle' | 'wizShipLinesDescription' | 'wizTrackingTitle'
  | 'shipmentsEmptyDescription'
  | 'wizTrackingDescription' | 'shipDone'
  | 'refundWizardTitle' | 'wizAmountTitle' | 'wizAmountDescription' | 'wizReasonTitle'
  | 'wizReasonDescription' | 'refundDone'
  | 'returnWizardTitle' | 'wizReturnLinesTitle' | 'wizReturnLinesDescription' | 'wizLocationTitle'
  | 'wizLocationDescription' | 'wizRefundIntentTitle' | 'wizRefundIntentDescription' | 'returnDone'
  | 'exchangeWizardTitle' | 'wizInboundTitle' | 'wizInboundDescription' | 'wizOutboundTitle'
  | 'wizOutboundDescription' | 'wizDifferenceOwed' | 'wizDifferenceRefund' | 'wizDifferenceEven'
  | 'wizDifferenceEstimate' | 'exchangeDone'
  | 'claimWizardTitle' | 'wizClaimTypeTitle' | 'wizClaimTypeDescription' | 'claimTypeReplace'
  | 'claimTypeRefund' | 'wizClaimItemsTitle' | 'wizClaimItemsDescription' | 'wizPhotosTitle'
  | 'wizPhotosDescription' | 'wizReplacementTitle' | 'wizReplacementDescription'
  | 'claimReasonMissing' | 'claimReasonWrong' | 'claimReasonBroken' | 'claimReasonOther'
  | 'claimRefundAmountTitle' | 'claimDone' | 'photoAdd' | 'photoUploading'
  | 'editWizardTitle' | 'wizEditLinesTitle' | 'wizEditLinesDescription' | 'wizEditAddTitle'
  | 'wizEditAddDescription' | 'wizPreviewTitle' | 'wizPreviewDescription' | 'previewBefore'
  | 'previewAfter' | 'previewDifference' | 'editDone' | 'addLine' | 'removeLine'
  | 'draftsTitle' | 'draftsSubtitle' | 'draftsEmptyTitle' | 'draftsEmptyDescription' | 'draftNew'
  | 'draftWizardTitle' | 'wizCustomerTitle' | 'wizCustomerDescription' | 'wizRegionTitle'
  | 'wizRegionDescription' | 'wizDraftLinesTitle' | 'wizDraftLinesDescription' | 'wizAddressTitle'
  | 'wizAddressDescription' | 'wizShippingTitle' | 'wizShippingDescription' | 'draftConvert'
  | 'draftMarkPaid' | 'draftMarkPaidHelp' | 'draftCreated' | 'draftConverted' | 'catalogPick'
  | 'catalogSearchPlaceholder' | 'customLineAdd' | 'addressFirstName' | 'addressLastName'
  | 'addressLine1' | 'addressCity' | 'addressPostalCode' | 'addressCountry' | 'addressPhone'
  | 'shippingMethodName' | 'shippingMethodAmount' | 'noShippingMethod'
  | 'payCollections' | 'payCollectionAmount' | 'payNothingDue' | 'payTransactions'
  | 'payTransactionCapture' | 'payTransactionRefund' | 'payTransactionManual'
  | 'histOrderPlaced' | 'histOrderCanceled' | 'histOrderArchived' | 'histFulfillmentCreated'
  | 'histShipmentCreated' | 'histDelivered' | 'histFulfillmentCanceled' | 'histReturnRequested'
  | 'histReturnReceived' | 'histReturnCanceled' | 'histExchangeCreated' | 'histExchangeCompleted'
  | 'histClaimCreated' | 'histClaimCompleted' | 'histEmptyTitle' | 'histEmptyDescription'
  | 'noItems' | 'pickAtLeastOne' | 'amountTooHigh' | 'retry' | 'returnTitlePrefix'

const ordersFr: Record<OrdersVocabKey, string> = {
  ordStatusPending: 'À traiter',
  ordStatusCompleted: 'Terminée',
  ordStatusCanceled: 'Annulée',
  ordStatusArchived: 'Archivée',
  ordStatusDraft: 'Brouillon',
  ordStatusRequiresAction: 'Action nécessaire',
  payStatusNotPaid: 'Pas encore payée',
  payStatusAwaiting: 'Paiement en attente',
  payStatusAuthorized: 'À encaisser',
  payStatusPartiallyAuthorized: 'Partiellement autorisée',
  payStatusCaptured: 'Payée',
  payStatusPartiallyCaptured: 'Partiellement encaissée',
  payStatusRefunded: 'Remboursée',
  payStatusPartiallyRefunded: 'Partiellement remboursée',
  payStatusCanceled: 'Paiement annulé',
  shipStatusNotFulfilled: 'À préparer',
  shipStatusPartiallyFulfilled: 'Partiellement préparée',
  shipStatusFulfilled: 'Prête à partir',
  shipStatusPartiallyShipped: 'Partiellement expédiée',
  shipStatusShipped: 'Expédiée',
  shipStatusPartiallyDelivered: 'Partiellement livrée',
  shipStatusDelivered: 'Livrée',
  shipStatusCanceled: 'Expédition annulée',
  retStatusRequested: 'Retour demandé',
  retStatusPartiallyReceived: 'Partiellement reçu',
  retStatusReceived: 'Reçu',
  retStatusCanceled: 'Retour annulé',
  rmaStatusRequested: 'En cours',
  rmaStatusCompleted: 'Terminé',
  rmaStatusCanceled: 'Annulé',
  ordersSubtitle: 'Ce qu’il faut préparer, encaisser ou rembourser',
  ordersTabToShip: 'À expédier',
  ordersTabToCollect: 'À encaisser',
  ordersTabReturns: 'Retours en cours',
  ordersTabAll: 'Toutes',
  ordersSearchPlaceholder: 'Numéro, e-mail ou nom du client…',
  ordersColNumber: 'Commande',
  ordersColCustomer: 'Client',
  ordersColDate: 'Date',
  ordersColAmount: 'Montant',
  ordersColPayment: 'Paiement',
  ordersColShipping: 'Livraison',
  ordersEmptyAllTitle: 'Aucune commande pour l’instant',
  ordersEmptyAllDescription: 'Dès qu’un client achètera dans votre boutique, sa commande apparaîtra ici.',
  ordersEmptyToShipTitle: 'Rien à expédier',
  ordersEmptyToShipDescription: 'Aucune commande n’attend d’être préparée. Vous êtes à jour.',
  ordersEmptyToCollectTitle: 'Rien à encaisser',
  ordersEmptyToCollectDescription: 'Toutes les commandes payables ont été encaissées.',
  ordersEmptyReturnsTitle: 'Aucun retour en cours',
  ordersEmptyReturnsDescription: 'Les retours, échanges et réclamations en cours apparaîtront ici.',
  ordersEmptySearchTitle: 'Aucune commande trouvée',
  ordersEmptySearchDescription: 'Vérifiez le numéro ou l’e-mail, ou chargez plus de commandes.',
  ordersLoadMore: 'Voir plus de commandes',
  ordersDraftsLink: 'Brouillons',
  orderNumberPrefix: 'Commande n° ',
  orderGuest: 'Client de passage',
  orderNextStep: 'Prochaine étape',
  orderNothingToDo: 'Rien à faire pour l’instant sur cette commande.',
  orderSectionItems: 'Articles',
  orderSectionPayments: 'Argent',
  orderSectionShipments: 'Expéditions',
  orderSectionReturns: 'Retours',
  orderSectionExchanges: 'Échanges',
  orderSectionClaims: 'Réclamations',
  orderSectionHistory: 'Historique',
  orderSectionCustomer: 'Client et livraison',
  labelSubtotal: 'Sous-total',
  labelDiscount: 'Remises',
  labelShippingCost: 'Livraison',
  labelTax: 'Taxes',
  labelTotal: 'Total',
  labelPaid: 'Encaissé',
  labelRefunded: 'Remboursé',
  labelOutstanding: 'Reste à encaisser',
  labelRefundable: 'Remboursable au maximum',
  labelQuantity: 'Quantité',
  labelUnitPrice: 'Prix unitaire',
  labelTracking: 'Numéro de suivi',
  labelReason: 'Motif',
  labelNote: 'Note',
  labelLocation: 'Lieu de réception',
  labelDamaged: 'Dont abîmés',
  labelReceivedQty: 'Reçu',
  labelRequestedQty: 'Demandé',
  labelDate: 'Date',
  labelStatus: 'Statut',
  labelAmount: 'Montant',
  labelNone: 'Aucun',
  labelOptional: 'Facultatif',
  labelMax: 'Maximum',
  labelTitle: 'Désignation',
  labelPrice: 'Prix',
  actionShip: 'Expédier',
  actionRefund: 'Rembourser',
  actionReturn: 'Enregistrer un retour',
  actionExchange: 'Faire un échange',
  actionClaim: 'Ouvrir une réclamation',
  actionEditOrder: 'Modifier la commande',
  actionCancelOrder: 'Annuler la commande',
  actionArchiveOrder: 'Archiver',
  actionUnarchiveOrder: 'Sortir de l’archive',
  actionCapture: 'Encaisser',
  actionMarkDelivered: 'Marquer comme livrée',
  actionCancelShipment: 'Annuler l’expédition',
  actionMarkAsPaid: 'Marquer comme encaissé',
  actionCreateCollection: 'Créer un encaissement',
  actionReceiveReturn: 'Enregistrer la réception',
  actionCancelReturn: 'Annuler le retour',
  actionCompleteExchange: 'Clôturer l’échange',
  actionCancelExchange: 'Annuler l’échange',
  actionCompleteClaim: 'Clôturer la réclamation',
  actionCancelClaim: 'Annuler la réclamation',
  actionOpenReturn: 'Ouvrir le retour',
  actionMore: 'Autres actions',
  confirmCancelOrderTitle: 'Annuler cette commande ?',
  confirmCancelOrderBody: 'Le client ne sera pas livré, le stock réservé sera relâché et l’autorisation de paiement sera annulée. C’est définitif.',
  confirmArchiveTitle: 'Archiver cette commande ?',
  confirmArchiveBody: 'Elle sortira de vos listes de travail. Vous pourrez la retrouver et la sortir de l’archive plus tard.',
  confirmUnarchiveTitle: 'Sortir cette commande de l’archive ?',
  confirmUnarchiveBody: 'Elle réapparaîtra dans vos listes de travail à traiter.',
  confirmCaptureTitle: 'Encaisser le paiement ?',
  confirmCaptureBody: 'L’argent autorisé sera débité chez le client. Cette opération se voit sur son relevé bancaire.',
  confirmCancelShipmentTitle: 'Annuler cette expédition ?',
  confirmCancelShipmentBody: 'Les articles retournent en stock et redeviennent à préparer. Possible uniquement tant que le colis n’est pas parti.',
  confirmDeliveredTitle: 'Le colis est arrivé chez le client ?',
  confirmDeliveredBody: 'La commande sera marquée comme livrée. Vous ne pourrez plus revenir en arrière.',
  confirmMarkAsPaidTitle: 'Marquer comme encaissé hors ligne ?',
  confirmMarkAsPaidBody: 'À utiliser si le client a payé en espèces, par virement ou au terminal. L’argent sera enregistré comme encaissé sans passer par le paiement en ligne.',
  confirmCreateCollectionTitle: 'Créer un encaissement complémentaire ?',
  confirmCreateCollectionBody: 'Un nouvel encaissement du reste dû sera ouvert sur cette commande. Vous pourrez ensuite le marquer comme encaissé.',
  confirmCancelReturnTitle: 'Annuler ce retour ?',
  confirmCancelReturnBody: 'La demande de retour sera abandonnée. Les articles resteront considérés comme vendus.',
  confirmCompleteExchangeTitle: 'Clôturer cet échange ?',
  confirmCompleteExchangeBody: 'La différence de prix sera réglée : remboursée au client, ou ajoutée à ce qu’il reste à encaisser.',
  confirmCancelExchangeTitle: 'Annuler cet échange ?',
  confirmCancelExchangeBody: 'Les articles de remplacement seront retirés de la commande et le retour associé annulé.',
  confirmCompleteClaimTitle: 'Clôturer cette réclamation ?',
  confirmCompleteClaimBody: 'Si un remboursement était prévu, il sera versé au client maintenant.',
  confirmCancelClaimTitle: 'Annuler cette réclamation ?',
  confirmCancelClaimBody: 'Les articles de remplacement seront retirés de la commande et le retour associé annulé.',
  confirmConvertDraftTitle: 'Transformer ce brouillon en commande ?',
  confirmConvertDraftBody: 'Le stock sera réservé et la commande entrera dans vos listes de travail.',
  confirmCancelDraftTitle: 'Supprimer ce brouillon ?',
  confirmCancelDraftBody: 'Ce brouillon sera annulé. Vous ne pourrez plus le transformer en commande.',
  whyNoCancelFulfillments: 'Impossible : des expéditions sont encore actives sur cette commande. Annulez-les d’abord.',
  whyNoCancelCaptured: 'Impossible : de l’argent a été encaissé et pas encore remboursé. Remboursez d’abord.',
  whyNoCancelCompleted: 'Impossible : cette commande est terminée.',
  whyNoArchiveCanceled: 'Impossible : une commande annulée ne peut pas être archivée.',
  whyNoReturn: 'Un retour ne peut porter que sur des articles déjà expédiés.',
  whyNoExchangeComplete: 'Le retour du client doit être entièrement reçu avant de clôturer.',
  whyNoShip: 'Tous les articles de cette commande sont déjà préparés.',
  whyNoRefund: 'Rien à rembourser : aucun argent encaissé sur cette commande.',
  shipWizardTitle: 'Expédier la commande',
  wizShipLinesTitle: 'Que mettez-vous dans le colis ?',
  wizShipLinesDescription: 'Indiquez la quantité expédiée pour chaque article. Laissez à 0 ce qui part plus tard.',
  shipmentsEmptyDescription: 'Rien n’est encore parti. Préparez le colis quand vous êtes prêt : vous pourrez ensuite noter son numéro de suivi.',
  wizTrackingTitle: 'Numéro de suivi',
  wizTrackingDescription: 'Si le transporteur vous en a donné un, notez-le : le client pourra suivre son colis.',
  shipDone: 'Colis enregistré et marqué comme expédié.',
  refundWizardTitle: 'Rembourser le client',
  wizAmountTitle: 'Combien rembourser ?',
  wizAmountDescription: 'Vous pouvez rembourser tout ou partie de ce qui a été encaissé.',
  wizReasonTitle: 'Pourquoi ce remboursement ?',
  wizReasonDescription: 'Le motif vous aidera à vous y retrouver plus tard.',
  refundDone: 'Remboursement enregistré.',
  returnWizardTitle: 'Enregistrer un retour',
  wizReturnLinesTitle: 'Quels articles le client renvoie-t-il ?',
  wizReturnLinesDescription: 'Seuls les articles déjà expédiés peuvent revenir.',
  wizLocationTitle: 'Où arrive la marchandise ?',
  wizLocationDescription: 'Le stock sera remis à cet endroit quand vous recevrez le colis.',
  wizRefundIntentTitle: 'Remboursement prévu',
  wizRefundIntentDescription: 'Ce montant sera remboursé automatiquement dès que le retour sera entièrement reçu. Laissez à 0 pour décider plus tard.',
  returnDone: 'Retour enregistré.',
  exchangeWizardTitle: 'Faire un échange',
  wizInboundTitle: 'Ce que le client renvoie',
  wizInboundDescription: 'Seuls les articles déjà expédiés peuvent revenir.',
  wizOutboundTitle: 'Ce que vous envoyez à la place',
  wizOutboundDescription: 'Ajoutez les articles de remplacement avec leur prix.',
  wizDifferenceOwed: 'Le client doit encore',
  wizDifferenceRefund: 'Vous devez rembourser',
  wizDifferenceEven: 'Échange sans supplément ni remboursement.',
  wizDifferenceEstimate: 'Estimation hors taxes. Le montant exact s’affiche une fois l’échange créé.',
  exchangeDone: 'Échange créé.',
  claimWizardTitle: 'Ouvrir une réclamation',
  wizClaimTypeTitle: 'Que faites-vous pour le client ?',
  wizClaimTypeDescription: 'Vous renvoyez le produit, ou vous remboursez.',
  claimTypeReplace: 'Je renvoie le produit',
  claimTypeRefund: 'Je rembourse',
  wizClaimItemsTitle: 'Quels articles posent problème ?',
  wizClaimItemsDescription: 'Choisissez la quantité concernée et ce qui ne va pas.',
  wizPhotosTitle: 'Photos du problème',
  wizPhotosDescription: 'Ajoutez des photos si vous en avez. C’est facultatif.',
  wizReplacementTitle: 'Articles de remplacement',
  wizReplacementDescription: 'Ce que vous renvoyez au client, avec le prix.',
  claimReasonMissing: 'Article manquant',
  claimReasonWrong: 'Mauvais article',
  claimReasonBroken: 'Article abîmé ou défectueux',
  claimReasonOther: 'Autre',
  claimRefundAmountTitle: 'Montant à rembourser',
  claimDone: 'Réclamation ouverte.',
  photoAdd: 'Ajouter des photos',
  photoUploading: 'Envoi des photos…',
  editWizardTitle: 'Modifier la commande',
  wizEditLinesTitle: 'Que changez-vous ?',
  wizEditLinesDescription: 'Ajustez les quantités, ou retirez un article en le mettant à 0.',
  wizEditAddTitle: 'Ajouter un article',
  wizEditAddDescription: 'Ajoutez un article libre avec son prix. Laissez vide si vous n’ajoutez rien.',
  wizPreviewTitle: 'Avant / après',
  wizPreviewDescription: 'Vérifiez le nouveau total avant de valider. Rien n’est appliqué tant que vous n’avez pas validé.',
  previewBefore: 'Avant',
  previewAfter: 'Après',
  previewDifference: 'Différence',
  editDone: 'Commande modifiée.',
  addLine: 'Ajouter une ligne',
  removeLine: 'Retirer',
  draftsTitle: 'Brouillons de commande',
  draftsSubtitle: 'Préparez une commande pour un client qui achète par téléphone ou en boutique.',
  draftsEmptyTitle: 'Aucun brouillon',
  draftsEmptyDescription: 'Créez une commande à la main pour un client qui commande par téléphone ou en boutique.',
  draftNew: 'Nouveau brouillon',
  draftWizardTitle: 'Nouvelle commande à la main',
  wizCustomerTitle: 'Pour quel client ?',
  wizCustomerDescription: 'Saisissez son e-mail, ou choisissez un client déjà connu.',
  wizRegionTitle: 'Zone de vente',
  wizRegionDescription: 'Elle détermine la devise et les taxes appliquées.',
  wizDraftLinesTitle: 'Que commande-t-il ?',
  wizDraftLinesDescription: 'Prenez des articles de votre catalogue, ou saisissez un article libre.',
  wizAddressTitle: 'Adresse de livraison',
  wizAddressDescription: 'Où faut-il livrer ? Facultatif si le client vient chercher sa commande.',
  wizShippingTitle: 'Livraison',
  wizShippingDescription: 'Ajoutez des frais de livraison si vous en facturez.',
  draftConvert: 'Transformer en commande',
  draftMarkPaid: 'Le client a déjà payé',
  draftMarkPaidHelp: 'Cochez si vous avez déjà reçu l’argent (espèces, virement, terminal). La commande sera enregistrée comme payée. Sinon, elle restera à encaisser.',
  draftCreated: 'Brouillon créé.',
  draftConverted: 'Brouillon transformé en commande.',
  catalogPick: 'Prendre dans le catalogue',
  catalogSearchPlaceholder: 'Chercher un produit…',
  customLineAdd: 'Article libre',
  addressFirstName: 'Prénom',
  addressLastName: 'Nom',
  addressLine1: 'Adresse',
  addressCity: 'Ville',
  addressPostalCode: 'Code postal',
  addressCountry: 'Pays (code, ex. FR)',
  addressPhone: 'Téléphone',
  shippingMethodName: 'Nom de la livraison',
  shippingMethodAmount: 'Frais de livraison',
  noShippingMethod: 'Sans livraison facturée',
  payCollections: 'Encaissements',
  payCollectionAmount: 'Montant à encaisser',
  payNothingDue: 'Tout est encaissé sur cette commande.',
  payTransactions: 'Mouvements d’argent',
  payTransactionCapture: 'Encaissement',
  payTransactionRefund: 'Remboursement',
  payTransactionManual: 'Paiement hors ligne',
  histOrderPlaced: 'Commande passée',
  histOrderCanceled: 'Commande annulée',
  histOrderArchived: 'Commande archivée',
  histFulfillmentCreated: 'Colis préparé',
  histShipmentCreated: 'Colis expédié',
  histDelivered: 'Colis livré',
  histFulfillmentCanceled: 'Expédition annulée',
  histReturnRequested: 'Retour demandé',
  histReturnReceived: 'Retour reçu',
  histReturnCanceled: 'Retour annulé',
  histExchangeCreated: 'Échange créé',
  histExchangeCompleted: 'Échange clôturé',
  histClaimCreated: 'Réclamation ouverte',
  histClaimCompleted: 'Réclamation clôturée',
  histEmptyTitle: 'Rien ne s’est encore passé',
  histEmptyDescription: 'Les expéditions, paiements et retours de cette commande s’afficheront ici.',
  noItems: 'Aucun article',
  pickAtLeastOne: 'Choisissez au moins un article.',
  amountTooHigh: 'Ce montant dépasse le maximum autorisé.',
  retry: 'Réessayer',
  returnTitlePrefix: 'Retour du ',
}

const ordersEn: Record<OrdersVocabKey, string> = {
  ordStatusPending: 'To process',
  ordStatusCompleted: 'Completed',
  ordStatusCanceled: 'Canceled',
  ordStatusArchived: 'Archived',
  ordStatusDraft: 'Draft',
  ordStatusRequiresAction: 'Needs attention',
  payStatusNotPaid: 'Not paid yet',
  payStatusAwaiting: 'Awaiting payment',
  payStatusAuthorized: 'To collect',
  payStatusPartiallyAuthorized: 'Partly authorized',
  payStatusCaptured: 'Paid',
  payStatusPartiallyCaptured: 'Partly collected',
  payStatusRefunded: 'Refunded',
  payStatusPartiallyRefunded: 'Partly refunded',
  payStatusCanceled: 'Payment canceled',
  shipStatusNotFulfilled: 'To prepare',
  shipStatusPartiallyFulfilled: 'Partly prepared',
  shipStatusFulfilled: 'Ready to go',
  shipStatusPartiallyShipped: 'Partly shipped',
  shipStatusShipped: 'Shipped',
  shipStatusPartiallyDelivered: 'Partly delivered',
  shipStatusDelivered: 'Delivered',
  shipStatusCanceled: 'Shipment canceled',
  retStatusRequested: 'Return requested',
  retStatusPartiallyReceived: 'Partly received',
  retStatusReceived: 'Received',
  retStatusCanceled: 'Return canceled',
  rmaStatusRequested: 'In progress',
  rmaStatusCompleted: 'Completed',
  rmaStatusCanceled: 'Canceled',
  ordersSubtitle: 'What needs to be prepared, collected or refunded',
  ordersTabToShip: 'To ship',
  ordersTabToCollect: 'To collect',
  ordersTabReturns: 'Returns in progress',
  ordersTabAll: 'All',
  ordersSearchPlaceholder: 'Number, email or customer name…',
  ordersColNumber: 'Order',
  ordersColCustomer: 'Customer',
  ordersColDate: 'Date',
  ordersColAmount: 'Amount',
  ordersColPayment: 'Payment',
  ordersColShipping: 'Delivery',
  ordersEmptyAllTitle: 'No orders yet',
  ordersEmptyAllDescription: 'As soon as a customer buys from your store, their order will show up here.',
  ordersEmptyToShipTitle: 'Nothing to ship',
  ordersEmptyToShipDescription: 'No order is waiting to be prepared. You are all caught up.',
  ordersEmptyToCollectTitle: 'Nothing to collect',
  ordersEmptyToCollectDescription: 'Every payable order has been collected.',
  ordersEmptyReturnsTitle: 'No return in progress',
  ordersEmptyReturnsDescription: 'Returns, exchanges and claims in progress will show up here.',
  ordersEmptySearchTitle: 'No order found',
  ordersEmptySearchDescription: 'Check the number or email, or load more orders.',
  ordersLoadMore: 'Load more orders',
  ordersDraftsLink: 'Drafts',
  orderNumberPrefix: 'Order no. ',
  orderGuest: 'Guest customer',
  orderNextStep: 'Next step',
  orderNothingToDo: 'Nothing to do on this order right now.',
  orderSectionItems: 'Items',
  orderSectionPayments: 'Money',
  orderSectionShipments: 'Shipments',
  orderSectionReturns: 'Returns',
  orderSectionExchanges: 'Exchanges',
  orderSectionClaims: 'Claims',
  orderSectionHistory: 'History',
  orderSectionCustomer: 'Customer and delivery',
  labelSubtotal: 'Subtotal',
  labelDiscount: 'Discounts',
  labelShippingCost: 'Delivery',
  labelTax: 'Tax',
  labelTotal: 'Total',
  labelPaid: 'Collected',
  labelRefunded: 'Refunded',
  labelOutstanding: 'Left to collect',
  labelRefundable: 'Refundable at most',
  labelQuantity: 'Quantity',
  labelUnitPrice: 'Unit price',
  labelTracking: 'Tracking number',
  labelReason: 'Reason',
  labelNote: 'Note',
  labelLocation: 'Receiving place',
  labelDamaged: 'Of which damaged',
  labelReceivedQty: 'Received',
  labelRequestedQty: 'Requested',
  labelDate: 'Date',
  labelStatus: 'Status',
  labelAmount: 'Amount',
  labelNone: 'None',
  labelOptional: 'Optional',
  labelMax: 'Maximum',
  labelTitle: 'Description',
  labelPrice: 'Price',
  actionShip: 'Ship',
  actionRefund: 'Refund',
  actionReturn: 'Record a return',
  actionExchange: 'Make an exchange',
  actionClaim: 'Open a claim',
  actionEditOrder: 'Edit the order',
  actionCancelOrder: 'Cancel the order',
  actionArchiveOrder: 'Archive',
  actionUnarchiveOrder: 'Unarchive',
  actionCapture: 'Collect',
  actionMarkDelivered: 'Mark as delivered',
  actionCancelShipment: 'Cancel the shipment',
  actionMarkAsPaid: 'Mark as collected',
  actionCreateCollection: 'Open a collection',
  actionReceiveReturn: 'Record the receipt',
  actionCancelReturn: 'Cancel the return',
  actionCompleteExchange: 'Close the exchange',
  actionCancelExchange: 'Cancel the exchange',
  actionCompleteClaim: 'Close the claim',
  actionCancelClaim: 'Cancel the claim',
  actionOpenReturn: 'Open the return',
  actionMore: 'More actions',
  confirmCancelOrderTitle: 'Cancel this order?',
  confirmCancelOrderBody: 'The customer will not be delivered, reserved stock is released and the payment hold is voided. This cannot be undone.',
  confirmArchiveTitle: 'Archive this order?',
  confirmArchiveBody: 'It leaves your work lists. You can find it again and unarchive it later.',
  confirmUnarchiveTitle: 'Unarchive this order?',
  confirmUnarchiveBody: 'It will show up again in your work lists.',
  confirmCaptureTitle: 'Collect the payment?',
  confirmCaptureBody: 'The authorized money will be charged to the customer. It shows on their bank statement.',
  confirmCancelShipmentTitle: 'Cancel this shipment?',
  confirmCancelShipmentBody: 'Items go back to stock and become to-prepare again. Only possible while the parcel has not left.',
  confirmDeliveredTitle: 'Has the parcel arrived?',
  confirmDeliveredBody: 'The order will be marked as delivered. This cannot be undone.',
  confirmMarkAsPaidTitle: 'Mark as collected offline?',
  confirmMarkAsPaidBody: 'Use this when the customer paid in cash, by transfer or on a terminal. The money is recorded as collected without going through online payment.',
  confirmCreateCollectionTitle: 'Open an extra collection?',
  confirmCreateCollectionBody: 'A new collection for the outstanding amount will be opened on this order. You can then mark it as collected.',
  confirmCancelReturnTitle: 'Cancel this return?',
  confirmCancelReturnBody: 'The return request is dropped. The items stay counted as sold.',
  confirmCompleteExchangeTitle: 'Close this exchange?',
  confirmCompleteExchangeBody: 'The price difference will be settled: refunded to the customer, or added to what is left to collect.',
  confirmCancelExchangeTitle: 'Cancel this exchange?',
  confirmCancelExchangeBody: 'Replacement items are removed from the order and the linked return is canceled.',
  confirmCompleteClaimTitle: 'Close this claim?',
  confirmCompleteClaimBody: 'If a refund was planned, it is paid to the customer now.',
  confirmCancelClaimTitle: 'Cancel this claim?',
  confirmCancelClaimBody: 'Replacement items are removed from the order and the linked return is canceled.',
  confirmConvertDraftTitle: 'Turn this draft into an order?',
  confirmConvertDraftBody: 'Stock will be reserved and the order enters your work lists.',
  confirmCancelDraftTitle: 'Delete this draft?',
  confirmCancelDraftBody: 'This draft will be canceled. You will not be able to turn it into an order.',
  whyNoCancelFulfillments: 'Not possible: shipments are still active on this order. Cancel them first.',
  whyNoCancelCaptured: 'Not possible: money was collected and not fully refunded. Refund first.',
  whyNoCancelCompleted: 'Not possible: this order is completed.',
  whyNoArchiveCanceled: 'Not possible: a canceled order cannot be archived.',
  whyNoReturn: 'A return can only cover items that have already shipped.',
  whyNoExchangeComplete: 'The customer return must be fully received before closing.',
  whyNoShip: 'Every item on this order is already prepared.',
  whyNoRefund: 'Nothing to refund: no money collected on this order.',
  shipWizardTitle: 'Ship the order',
  wizShipLinesTitle: 'What goes in the parcel?',
  wizShipLinesDescription: 'Set the shipped quantity for each item. Leave at 0 what ships later.',
  shipmentsEmptyDescription: 'Nothing has shipped yet. Pack the parcel when you are ready — you can add its tracking number afterwards.',
  wizTrackingTitle: 'Tracking number',
  wizTrackingDescription: 'If the carrier gave you one, add it: the customer can follow the parcel.',
  shipDone: 'Parcel recorded and marked as shipped.',
  refundWizardTitle: 'Refund the customer',
  wizAmountTitle: 'How much to refund?',
  wizAmountDescription: 'You can refund all or part of what was collected.',
  wizReasonTitle: 'Why this refund?',
  wizReasonDescription: 'The reason helps you find your way back later.',
  refundDone: 'Refund recorded.',
  returnWizardTitle: 'Record a return',
  wizReturnLinesTitle: 'Which items is the customer sending back?',
  wizReturnLinesDescription: 'Only shipped items can come back.',
  wizLocationTitle: 'Where does the merchandise arrive?',
  wizLocationDescription: 'Stock goes back to this place when you receive the parcel.',
  wizRefundIntentTitle: 'Planned refund',
  wizRefundIntentDescription: 'This amount is refunded automatically once the return is fully received. Leave at 0 to decide later.',
  returnDone: 'Return recorded.',
  exchangeWizardTitle: 'Make an exchange',
  wizInboundTitle: 'What the customer sends back',
  wizInboundDescription: 'Only shipped items can come back.',
  wizOutboundTitle: 'What you send instead',
  wizOutboundDescription: 'Add the replacement items with their price.',
  wizDifferenceOwed: 'The customer still owes',
  wizDifferenceRefund: 'You owe a refund of',
  wizDifferenceEven: 'Even swap, nothing to pay or refund.',
  wizDifferenceEstimate: 'Estimate before tax. The exact amount shows once the exchange is created.',
  exchangeDone: 'Exchange created.',
  claimWizardTitle: 'Open a claim',
  wizClaimTypeTitle: 'What are you doing for the customer?',
  wizClaimTypeDescription: 'You send the product again, or you refund.',
  claimTypeReplace: 'I send the product again',
  claimTypeRefund: 'I refund',
  wizClaimItemsTitle: 'Which items are a problem?',
  wizClaimItemsDescription: 'Pick the quantity involved and what went wrong.',
  wizPhotosTitle: 'Photos of the problem',
  wizPhotosDescription: 'Add photos if you have any. This is optional.',
  wizReplacementTitle: 'Replacement items',
  wizReplacementDescription: 'What you send back to the customer, with the price.',
  claimReasonMissing: 'Missing item',
  claimReasonWrong: 'Wrong item',
  claimReasonBroken: 'Damaged or faulty item',
  claimReasonOther: 'Other',
  claimRefundAmountTitle: 'Amount to refund',
  claimDone: 'Claim opened.',
  photoAdd: 'Add photos',
  photoUploading: 'Uploading photos…',
  editWizardTitle: 'Edit the order',
  wizEditLinesTitle: 'What are you changing?',
  wizEditLinesDescription: 'Adjust quantities, or remove an item by setting it to 0.',
  wizEditAddTitle: 'Add an item',
  wizEditAddDescription: 'Add a free item with its price. Leave empty if you add nothing.',
  wizPreviewTitle: 'Before / after',
  wizPreviewDescription: 'Check the new total before applying. Nothing changes until you apply.',
  previewBefore: 'Before',
  previewAfter: 'After',
  previewDifference: 'Difference',
  editDone: 'Order updated.',
  addLine: 'Add a line',
  removeLine: 'Remove',
  draftsTitle: 'Order drafts',
  draftsSubtitle: 'Prepare an order for a customer buying by phone or in store.',
  draftsEmptyTitle: 'No draft',
  draftsEmptyDescription: 'Create an order by hand for a customer ordering by phone or in store.',
  draftNew: 'New draft',
  draftWizardTitle: 'New order by hand',
  wizCustomerTitle: 'For which customer?',
  wizCustomerDescription: 'Enter their email, or pick a known customer.',
  wizRegionTitle: 'Selling area',
  wizRegionDescription: 'It sets the currency and the tax applied.',
  wizDraftLinesTitle: 'What are they ordering?',
  wizDraftLinesDescription: 'Pick items from your catalogue, or type a free item.',
  wizAddressTitle: 'Delivery address',
  wizAddressDescription: 'Where to deliver? Optional if the customer picks the order up.',
  wizShippingTitle: 'Delivery',
  wizShippingDescription: 'Add delivery charges if you bill any.',
  draftConvert: 'Turn into an order',
  draftMarkPaid: 'The customer already paid',
  draftMarkPaidHelp: 'Tick this if you already got the money (cash, transfer, terminal). The order is recorded as paid. Otherwise it stays to be collected.',
  draftCreated: 'Draft created.',
  draftConverted: 'Draft turned into an order.',
  catalogPick: 'Pick from the catalogue',
  catalogSearchPlaceholder: 'Search a product…',
  customLineAdd: 'Free item',
  addressFirstName: 'First name',
  addressLastName: 'Last name',
  addressLine1: 'Address',
  addressCity: 'City',
  addressPostalCode: 'Postcode',
  addressCountry: 'Country (code, e.g. FR)',
  addressPhone: 'Phone',
  shippingMethodName: 'Delivery name',
  shippingMethodAmount: 'Delivery charge',
  noShippingMethod: 'No delivery charged',
  payCollections: 'Collections',
  payCollectionAmount: 'Amount to collect',
  payNothingDue: 'Everything is collected on this order.',
  payTransactions: 'Money movements',
  payTransactionCapture: 'Collection',
  payTransactionRefund: 'Refund',
  payTransactionManual: 'Offline payment',
  histOrderPlaced: 'Order placed',
  histOrderCanceled: 'Order canceled',
  histOrderArchived: 'Order archived',
  histFulfillmentCreated: 'Parcel prepared',
  histShipmentCreated: 'Parcel shipped',
  histDelivered: 'Parcel delivered',
  histFulfillmentCanceled: 'Shipment canceled',
  histReturnRequested: 'Return requested',
  histReturnReceived: 'Return received',
  histReturnCanceled: 'Return canceled',
  histExchangeCreated: 'Exchange created',
  histExchangeCompleted: 'Exchange closed',
  histClaimCreated: 'Claim opened',
  histClaimCompleted: 'Claim closed',
  histEmptyTitle: 'Nothing has happened yet',
  histEmptyDescription: 'Shipments, payments and returns for this order will show up here.',
  noItems: 'No item',
  pickAtLeastOne: 'Pick at least one item.',
  amountTooHigh: 'This amount is over the allowed maximum.',
  retry: 'Try again',
  returnTitlePrefix: 'Return of ',
}

// --- « Réglages » (settings, regions, taxes, shipping, channels, keys,
// team, webhooks, notifications) ------------------------------------------------
// Prefixed `set*` so a key never collides with the base/orders blocks.

export type SettingsVocabKey =
  // Sub-navigation
  | 'setNavStore' | 'setNavRegions' | 'setNavTaxes' | 'setNavShipping' | 'setNavChannels'
  | 'setNavKeys' | 'setNavTeam' | 'setNavWebhooks' | 'setNavMessages'
  // Shared
  | 'setCopy' | 'setCopied' | 'setActive' | 'setInactive' | 'setNever' | 'setUnknown'
  | 'setLoadMore' | 'setClose' | 'setNotFound' | 'setShowMore' | 'setShowLess'
  // Boutique
  | 'setStoreTitle' | 'setStoreSubtitle' | 'setStoreNameLabel' | 'setStoreNameHint'
  | 'setStoreDefaultRegion' | 'setStoreDefaultRegionHint' | 'setStoreDefaultChannel'
  | 'setStoreDefaultChannelHint' | 'setStoreCurrencyTitle' | 'setStoreCurrencyHint'
  | 'setStoreNoRegionTitle' | 'setStoreNoRegionDescription' | 'setStoreCurrenciesInUse'
  | 'setStoreCurrenciesEmpty'
  // Zones de vente
  | 'setRegionsTitle' | 'setRegionsSubtitle' | 'setRegionNew' | 'setRegionName'
  | 'setRegionCurrency' | 'setRegionCurrencyHint' | 'setRegionCountries'
  | 'setRegionCountriesHint' | 'setRegionAutoTaxes' | 'setRegionAutoTaxesHint'
  | 'setRegionsEmptyTitle' | 'setRegionsEmptyDescription' | 'setRegionCountriesWriteOnly'
  | 'setRegionCountriesReplace' | 'setDeleteRegionTitle' | 'setDeleteRegionBody'
  | 'setRegionCountriesSaved'
  // Taxes
  | 'setTaxesTitle' | 'setTaxesSubtitle' | 'setTaxRegionNew' | 'setTaxRegionCountry'
  | 'setTaxRegionProvince' | 'setTaxRegionProvinceHint' | 'setTaxRegionsEmptyTitle'
  | 'setTaxRegionsEmptyDescription' | 'setDeleteTaxRegionTitle' | 'setDeleteTaxRegionBody'
  | 'setTaxRatesTitle' | 'setTaxRateNew' | 'setTaxRateName' | 'setTaxRateNameHint'
  | 'setTaxRateCode' | 'setTaxRateCodeHint' | 'setTaxRatePercent' | 'setTaxRatePercentHint'
  | 'setTaxRateDefault' | 'setTaxRateDefaultHint' | 'setTaxRateCombinable'
  | 'setTaxRateCombinableHint' | 'setTaxRatesEmptyTitle' | 'setTaxRatesEmptyDescription'
  | 'setDeleteTaxRateTitle' | 'setDeleteTaxRateBody' | 'setTaxOverridesTitle'
  | 'setTaxOverridesHint' | 'setTaxOverrideAdd' | 'setTaxOverrideProduct'
  | 'setTaxOverrideShipping' | 'setTaxOverridesEmpty' | 'setTaxProvider'
  | 'setTaxColCountry' | 'setTaxColRates' | 'setTaxRateSubtitle'
  // Livraison
  | 'setShippingTitle' | 'setShippingSubtitle' | 'setFsetNew' | 'setFsetName'
  | 'setFsetsEmptyTitle' | 'setFsetsEmptyDescription' | 'setDeleteFsetTitle'
  | 'setDeleteFsetBody' | 'setZonesTitle' | 'setZoneNew' | 'setZoneName'
  | 'setZoneCountries' | 'setZoneCountriesHint' | 'setZonesEmptyTitle'
  | 'setZonesEmptyDescription' | 'setDeleteZoneTitle' | 'setDeleteZoneBody'
  | 'setOptionsTitle' | 'setOptionNew' | 'setOptionName' | 'setOptionProfile'
  | 'setOptionPriceType' | 'setOptionPriceFlat' | 'setOptionPriceCalculated'
  | 'setOptionPriceTypeHint' | 'setOptionPrice' | 'setOptionPriceHint' | 'setOptionCarrier'
  | 'setOptionsEmptyTitle' | 'setOptionsEmptyDescription' | 'setDeleteOptionTitle'
  | 'setDeleteOptionBody' | 'setOptionPriceWriteOnly' | 'setProfilesTitle'
  | 'setProfilesHint' | 'setProfileNew' | 'setProfileName' | 'setProfileDefault'
  | 'setProfilesEmptyTitle' | 'setProfilesEmptyDescription' | 'setDeleteProfileTitle'
  | 'setDeleteProfileBody' | 'setZoneCountriesLabel' | 'setNoCurrencyForOption'
  // Canaux de vente
  | 'setChannelsTitle' | 'setChannelsSubtitle' | 'setChannelNew' | 'setChannelName'
  | 'setChannelDescription' | 'setChannelOpen' | 'setChannelClosed' | 'setChannelOpenHint'
  | 'setChannelsEmptyTitle' | 'setChannelsEmptyDescription' | 'setDeleteChannelTitle'
  | 'setDeleteChannelBody' | 'setChannelProducts' | 'setChannelProductsEmptyTitle'
  | 'setChannelProductsEmptyDescription' | 'setChannelProductsReadOnly'
  // Clés boutique
  | 'setKeysTitle' | 'setKeysSubtitle' | 'setKeyNew' | 'setKeyKindQuestion'
  | 'setKeyKindStore' | 'setKeyKindStoreHint' | 'setKeyKindServer' | 'setKeyKindServerHint'
  | 'setKeyName' | 'setKeyNameHint' | 'setKeyChannels' | 'setKeyChannelsHint'
  | 'setKeysEmptyTitle' | 'setKeysEmptyDescription' | 'setKeyOnceTitle'
  | 'setKeyOnceDescription' | 'setKeyRevoke' | 'setRevokeKeyTitle' | 'setRevokeKeyBody'
  | 'setKeyColName' | 'setKeyColKind' | 'setKeyColStatus' | 'setKeyStatusActive'
  | 'setKeyStatusRevoked' | 'setKeyUnnamed'
  // Équipe
  | 'setTeamTitle' | 'setTeamSubtitle' | 'setRoleOwner' | 'setRoleManager'
  | 'setRoleFulfiller' | 'setRoleUnknown' | 'setRoleOwnerHint' | 'setRoleManagerHint'
  | 'setRoleFulfillerHint' | 'setTeamMembers' | 'setTeamMembersEmptyTitle'
  | 'setTeamMembersEmptyDescription' | 'setInvitesTitle' | 'setInviteNew'
  | 'setInviteEmail' | 'setInviteRole' | 'setInvitesEmptyTitle'
  | 'setInvitesEmptyDescription' | 'setInvitePending' | 'setInviteAccepted'
  | 'setInviteRevoked' | 'setInviteExpired' | 'setInviteLinkTitle'
  | 'setInviteLinkDescription' | 'setInviteCopyLink' | 'setRevokeInviteTitle'
  | 'setRevokeInviteBody' | 'setInviteRevokeAction' | 'setTeamColName' | 'setTeamColEmail'
  | 'setTeamColRole' | 'setTeamColAccess' | 'setTeamAccessOpen' | 'setTeamAccessBlocked'
  | 'setTeamBlock' | 'setTeamUnblock' | 'setBlockStaffTitle' | 'setBlockStaffBody'
  | 'setUnblockStaffTitle' | 'setUnblockStaffBody' | 'setTeamYou'
  // Notifications techniques (webhooks)
  | 'setWebhooksTitle' | 'setWebhooksSubtitle' | 'setWebhookNew' | 'setWebhookUrl'
  | 'setWebhookUrlHint' | 'setWebhookDescription' | 'setWebhookEvents'
  | 'setWebhookAllEvents' | 'setWebhookAllEventsHint' | 'setWebhookPickEvents'
  | 'setWebhookEventsRequired' | 'setWebhooksEmptyTitle' | 'setWebhooksEmptyDescription'
  | 'setSecretOnceTitle' | 'setSecretOnceDescription' | 'setRotateSecret'
  | 'setRotateSecretTitle' | 'setRotateSecretBody' | 'setDeleteWebhookTitle'
  | 'setDeleteWebhookBody' | 'setDeliveriesTitle' | 'setDeliveriesHint'
  | 'setDeliveryEvent' | 'setDeliveryAttempts' | 'setDeliveryError' | 'setDeliveryWhen'
  | 'setDeliveryRedeliver' | 'setDeliveriesEmptyTitle' | 'setDeliveriesEmptyDescription'
  | 'setDeliveryDelivered' | 'setDeliveryFailed' | 'setDeliveryPending'
  | 'setDeliveryPayload' | 'setDeliveryResponse' | 'setWebhookColUrl'
  | 'setWebhookColEvents' | 'setWebhookSigningHint' | 'setWebhookTechTitle'
  | 'setEventGroupOrders' | 'setEventGroupPayments' | 'setEventGroupCarts'
  | 'setEventGroupProducts' | 'setEventGroupCatalog' | 'setEventGroupCustomers'
  | 'setEventGroupPromotions' | 'setEventGroupStock' | 'setEventGroupPrices'
  | 'setEventGroupShipping' | 'setEventGroupTaxes' | 'setEventGroupSettings'
  // Messages envoyés (notifications feed)
  | 'setMessagesTitle' | 'setMessagesSubtitle' | 'setMessagesFilterTo'
  | 'setMessagesFilterPlaceholder' | 'setMessagesClearFilter' | 'setMessageSent'
  | 'setMessageFailed' | 'setMessagePending' | 'setMessageColTo' | 'setMessageColTemplate'
  | 'setMessageColChannel' | 'setMessageColDate' | 'setMessagesEmptyTitle'
  | 'setMessagesEmptyDescription' | 'setMessagesNoResultTitle'
  | 'setMessagesNoResultDescription' | 'setMessageChannelEmail' | 'setMessageChannelFeed'

const settingsFr: Record<SettingsVocabKey, string> = {
  setNavStore: 'Boutique',
  setNavRegions: 'Zones de vente',
  setNavTaxes: 'Taxes',
  setNavShipping: 'Livraison',
  setNavChannels: 'Canaux de vente',
  setNavKeys: 'Clés boutique',
  setNavTeam: 'Équipe',
  setNavWebhooks: 'Notifications techniques',
  setNavMessages: 'Messages envoyés',

  setCopy: 'Copier',
  setCopied: 'Copié !',
  setActive: 'Actif',
  setInactive: 'En pause',
  setNever: 'Jamais',
  setUnknown: 'Inconnu',
  setLoadMore: 'Voir plus',
  setClose: 'Fermer',
  setNotFound: 'Introuvable',
  setShowMore: 'Voir le détail',
  setShowLess: 'Masquer le détail',

  setStoreTitle: 'Ma boutique',
  setStoreSubtitle: 'Le nom que vos clients voient et les réglages de base de la vente.',
  setStoreNameLabel: 'Nom de la boutique',
  setStoreNameHint: 'Il apparaît sur vos e-mails et vos factures.',
  setStoreDefaultRegion: 'Zone de vente principale',
  setStoreDefaultRegionHint: 'Elle décide de la monnaie affichée par défaut à un nouveau client.',
  setStoreDefaultChannel: 'Canal de vente principal',
  setStoreDefaultChannelHint: 'Les nouveaux produits y sont rattachés par défaut.',
  setStoreCurrencyTitle: 'Monnaie par défaut',
  setStoreCurrencyHint: 'Elle vient de la zone de vente principale. Pour la changer, changez la monnaie de cette zone.',
  setStoreNoRegionTitle: 'Aucune zone de vente',
  setStoreNoRegionDescription: 'Créez d’abord une zone de vente : c’est elle qui porte la monnaie et les pays que vous servez.',
  setStoreCurrenciesInUse: 'Monnaies utilisées',
  setStoreCurrenciesEmpty: 'Aucune monnaie tant qu’aucune zone de vente n’existe.',

  setRegionsTitle: 'Zones de vente',
  setRegionsSubtitle: 'Une zone = un groupe de pays qui paient dans la même monnaie.',
  setRegionNew: 'Nouvelle zone',
  setRegionName: 'Nom de la zone',
  setRegionCurrency: 'Monnaie',
  setRegionCurrencyHint: 'Tous les prix de cette zone sont affichés dans cette monnaie.',
  setRegionCountries: 'Pays servis',
  setRegionCountriesHint: 'Un pays ne peut appartenir qu’à une seule zone.',
  setRegionAutoTaxes: 'Calculer la taxe automatiquement',
  setRegionAutoTaxesHint: 'La taxe est ajoutée au panier selon l’adresse du client.',
  setRegionsEmptyTitle: 'Aucune zone de vente',
  setRegionsEmptyDescription: 'Créez votre première zone : elle définit la monnaie et les pays où vous vendez.',
  setRegionCountriesWriteOnly: 'La liste des pays déjà rattachés à cette zone ne peut pas être affichée aujourd’hui. Ce que vous cochez ici REMPLACE entièrement la liste précédente.',
  setRegionCountriesReplace: 'Remplacer les pays servis',
  setDeleteRegionTitle: 'Supprimer cette zone de vente ?',
  setDeleteRegionBody: 'Les clients de cette zone ne pourront plus commander. Retirez d’abord tous ses pays, sinon la suppression sera refusée.',
  setRegionCountriesSaved: 'Pays enregistrés.',

  setTaxesTitle: 'Taxes',
  setTaxesSubtitle: 'Ce que vous ajoutez au prix (TVA, taux réduit…) selon le pays du client.',
  setTaxRegionNew: 'Nouveau pays taxé',
  setTaxRegionCountry: 'Pays',
  setTaxRegionProvince: 'Région / province',
  setTaxRegionProvinceHint: 'À remplir seulement si une partie du pays a ses propres taux.',
  setTaxRegionsEmptyTitle: 'Aucune taxe configurée',
  setTaxRegionsEmptyDescription: 'Ajoutez le pays où vous devez facturer une taxe, puis ses taux (TVA, taux réduit…).',
  setDeleteTaxRegionTitle: 'Supprimer ce pays taxé ?',
  setDeleteTaxRegionBody: 'Tous ses taux disparaissent. Les nouvelles commandes de ce pays ne porteront plus aucune taxe.',
  setTaxRatesTitle: 'Taux',
  setTaxRateNew: 'Nouveau taux',
  setTaxRateName: 'Nom du taux',
  setTaxRateNameHint: 'Le nom que le client verra : « TVA », « Taux réduit »…',
  setTaxRateCode: 'Code',
  setTaxRateCodeHint: 'Un repère court pour votre comptabilité : « TVA20 ».',
  setTaxRatePercent: 'Pourcentage',
  setTaxRatePercentHint: 'Écrivez 20 pour 20 %.',
  setTaxRateDefault: 'Taux par défaut du pays',
  setTaxRateDefaultHint: 'Appliqué à tous les produits qui n’ont pas de taux à eux.',
  setTaxRateCombinable: 'Cumulable avec le taux par défaut',
  setTaxRateCombinableHint: 'À cocher seulement si ce taux s’ajoute à un autre (taxe locale).',
  setTaxRatesEmptyTitle: 'Aucun taux',
  setTaxRatesEmptyDescription: 'Ajoutez au moins le taux normal du pays (par exemple « TVA », 20 %).',
  setDeleteTaxRateTitle: 'Supprimer ce taux ?',
  setDeleteTaxRateBody: 'Les nouvelles commandes ne le factureront plus. Les commandes déjà passées ne changent pas.',
  setTaxOverridesTitle: 'Produits au taux réduit',
  setTaxOverridesHint: 'Par défaut ce taux ne s’applique à rien de précis. Ajoutez ici les produits (ou les tarifs de livraison) qui doivent l’utiliser à la place du taux par défaut.',
  setTaxOverrideAdd: 'Ajouter',
  setTaxOverrideProduct: 'Un produit',
  setTaxOverrideShipping: 'Un tarif de livraison',
  setTaxOverridesEmpty: 'Aucun produit ni tarif : ce taux ne s’applique qu’en tant que taux par défaut.',
  setTaxProvider: 'Calculé par',
  setTaxColCountry: 'Pays',
  setTaxColRates: 'Taux',
  setTaxRateSubtitle: 'Taux appliqués dans ce pays.',

  setShippingTitle: 'Livraison',
  setShippingSubtitle: 'Où vous livrez, et combien vous facturez pour le faire.',
  setFsetNew: 'Nouveau mode de livraison',
  setFsetName: 'Nom du mode de livraison',
  setFsetsEmptyTitle: 'Aucun mode de livraison',
  setFsetsEmptyDescription: 'Commencez par un mode (« Livraison à domicile », « Retrait en boutique »), puis ajoutez-y des zones et des tarifs.',
  setDeleteFsetTitle: 'Supprimer ce mode de livraison ?',
  setDeleteFsetBody: 'Ses zones et ses tarifs disparaissent : plus aucun client ne pourra choisir cette livraison.',
  setZonesTitle: 'Zones livrées',
  setZoneNew: 'Nouvelle zone',
  setZoneName: 'Nom de la zone',
  setZoneCountries: 'Pays livrés',
  setZoneCountriesHint: 'Cochez chaque pays où cette zone s’applique.',
  setZonesEmptyTitle: 'Aucune zone livrée',
  setZonesEmptyDescription: 'Ajoutez une zone (« France », « Europe ») et cochez les pays qu’elle couvre.',
  setDeleteZoneTitle: 'Supprimer cette zone ?',
  setDeleteZoneBody: 'Ses tarifs de livraison disparaissent : les clients de ces pays ne verront plus aucune option.',
  setZoneCountriesLabel: 'Pays',
  setOptionsTitle: 'Tarifs de livraison',
  setOptionNew: 'Nouveau tarif',
  setOptionName: 'Nom vu par le client',
  setOptionProfile: 'Groupe de produits',
  setOptionPriceType: 'Type de tarif',
  setOptionPriceFlat: 'Prix fixe',
  setOptionPriceCalculated: 'Calculé par le transporteur',
  setOptionPriceTypeHint: 'Prix fixe : vous décidez du montant. Calculé : le transporteur donne le prix au moment du paiement.',
  setOptionPrice: 'Prix',
  setOptionPriceHint: 'Ce que le client paie pour cette livraison.',
  setOptionCarrier: 'Transporteur',
  setOptionsEmptyTitle: 'Aucun tarif',
  setOptionsEmptyDescription: 'Ajoutez au moins un tarif, sinon les clients de cette zone ne pourront pas finaliser leur commande.',
  setDeleteOptionTitle: 'Supprimer ce tarif ?',
  setDeleteOptionBody: 'Les clients ne pourront plus choisir cette livraison. Les commandes déjà passées ne changent pas.',
  setOptionPriceWriteOnly: 'Le prix se fixe à la création et n’est pas relisible ici. Pour le changer, créez un nouveau tarif et supprimez l’ancien.',
  setNoCurrencyForOption: 'Créez d’abord une zone de vente : c’est elle qui donne la monnaie du prix.',
  setProfilesTitle: 'Groupes de produits',
  setProfilesHint: 'Un groupe rassemble les produits qui voyagent de la même façon (encombrants, frais…). Sans groupe précis, tout part avec le groupe par défaut.',
  setProfileNew: 'Nouveau groupe',
  setProfileName: 'Nom du groupe',
  setProfileDefault: 'Groupe par défaut',
  setProfilesEmptyTitle: 'Aucun groupe de produits',
  setProfilesEmptyDescription: 'Créez un groupe par défaut : tous vos produits l’utiliseront tant que vous n’en créez pas d’autre.',
  setDeleteProfileTitle: 'Supprimer ce groupe ?',
  setDeleteProfileBody: 'Les tarifs de livraison rattachés à ce groupe deviennent inutilisables.',

  setChannelsTitle: 'Canaux de vente',
  setChannelsSubtitle: 'Les endroits où vous vendez : la boutique en ligne, une place de marché, la vente au comptoir…',
  setChannelNew: 'Nouveau canal',
  setChannelName: 'Nom du canal',
  setChannelDescription: 'Description',
  setChannelOpen: 'Ouvert',
  setChannelClosed: 'Fermé',
  setChannelOpenHint: 'Un canal fermé ne vend plus rien, mais garde ses produits.',
  setChannelsEmptyTitle: 'Aucun canal de vente',
  setChannelsEmptyDescription: 'Créez au moins un canal (« Boutique en ligne ») pour pouvoir y rattacher vos produits.',
  setDeleteChannelTitle: 'Supprimer ce canal ?',
  setDeleteChannelBody: 'Les produits rattachés ne seront plus vendus sur ce canal. Le canal principal de la boutique ne peut pas être supprimé.',
  setChannelProducts: 'Produits vendus ici',
  setChannelProductsEmptyTitle: 'Aucun produit sur ce canal',
  setChannelProductsEmptyDescription: 'Ouvrez une fiche produit, onglet « Canaux », pour l’ajouter ici.',
  setChannelProductsReadOnly: 'Le rattachement se fait depuis la fiche produit.',

  setKeysTitle: 'Clés boutique',
  setKeysSubtitle: 'Les codes qui permettent à un site ou à un logiciel de parler à votre boutique.',
  setKeyNew: 'Nouvelle clé',
  setKeyKindQuestion: 'À quoi sert cette clé ?',
  setKeyKindStore: 'Clé boutique (site web)',
  setKeyKindStoreHint: 'À poser dans un site vitrine ou une application mobile. Elle ne peut que lire le catalogue et créer des paniers.',
  setKeyKindServer: 'Clé serveur (logiciel)',
  setKeyKindServerHint: 'Elle donne un accès complet, comme vous. À ne jamais mettre dans un site public.',
  setKeyName: 'À quoi sert-elle ?',
  setKeyNameHint: 'Par exemple « Site vitrine » ou « Export comptable ».',
  setKeyChannels: 'Canaux autorisés',
  setKeyChannelsHint: 'La clé ne verra que les produits de ces canaux.',
  setKeysEmptyTitle: 'Aucune clé',
  setKeysEmptyDescription: 'Créez une clé pour brancher votre site vitrine ou un logiciel externe sur la boutique.',
  setKeyOnceTitle: 'Copiez cette clé maintenant',
  setKeyOnceDescription: 'Elle ne sera plus jamais affichée. Si vous la perdez, il faudra en créer une autre.',
  setKeyRevoke: 'Désactiver',
  setRevokeKeyTitle: 'Désactiver cette clé ?',
  setRevokeKeyBody: 'Le site ou le logiciel qui l’utilise cessera de fonctionner immédiatement. La clé reste visible ici pour votre historique, mais ne pourra plus être réactivée.',
  setKeyColName: 'Clé',
  setKeyColKind: 'Type',
  setKeyColStatus: 'État',
  setKeyStatusActive: 'Active',
  setKeyStatusRevoked: 'Désactivée',
  setKeyUnnamed: 'Sans nom',

  setTeamTitle: 'Équipe',
  setTeamSubtitle: 'Qui peut entrer dans l’administration, et ce que chacun a le droit de faire.',
  setRoleOwner: 'Patron',
  setRoleManager: 'Gérant',
  setRoleFulfiller: 'Préparateur',
  setRoleUnknown: 'Rôle inconnu',
  setRoleOwnerHint: 'Tout, y compris les réglages et l’équipe.',
  setRoleManagerHint: 'Produits, commandes et clients. Lecture seule sur les réglages.',
  setRoleFulfillerHint: 'Prépare et expédie les commandes. Ne voit pas les réglages.',
  setTeamMembers: 'Membres',
  setTeamMembersEmptyTitle: 'Aucun membre',
  setTeamMembersEmptyDescription: 'Invitez quelqu’un par e-mail : il choisira son mot de passe lui-même.',
  setInvitesTitle: 'Invitations',
  setInviteNew: 'Inviter quelqu’un',
  setInviteEmail: 'Adresse e-mail',
  setInviteRole: 'Rôle',
  setInvitesEmptyTitle: 'Aucune invitation',
  setInvitesEmptyDescription: 'Invitez un collègue : vous obtiendrez un lien à lui transmettre.',
  setInvitePending: 'En attente',
  setInviteAccepted: 'Acceptée',
  setInviteRevoked: 'Annulée',
  setInviteExpired: 'Expirée',
  setInviteLinkTitle: 'Transmettez ce lien',
  setInviteLinkDescription: 'Il ne sera plus jamais affiché et expire dans 7 jours. Envoyez-le à la personne invitée.',
  setInviteCopyLink: 'Copier le lien',
  setRevokeInviteTitle: 'Annuler cette invitation ?',
  setRevokeInviteBody: 'Le lien déjà transmis cessera de fonctionner. Vous pourrez réinviter la même adresse ensuite.',
  setInviteRevokeAction: 'Annuler l’invitation',
  setTeamColName: 'Nom',
  setTeamColEmail: 'E-mail',
  setTeamColRole: 'Rôle',
  setTeamColAccess: 'Accès',
  setTeamAccessOpen: 'Autorisé',
  setTeamAccessBlocked: 'Bloqué',
  setTeamBlock: 'Bloquer l’accès',
  setTeamUnblock: 'Rétablir l’accès',
  setBlockStaffTitle: 'Bloquer cette personne ?',
  setBlockStaffBody: 'Elle sera déconnectée et ne pourra plus entrer dans l’administration. Son travail passé est conservé.',
  setUnblockStaffTitle: 'Rétablir l’accès ?',
  setUnblockStaffBody: 'Cette personne pourra de nouveau se connecter avec son mot de passe habituel.',
  setTeamYou: 'Vous',

  setWebhooksTitle: 'Notifications techniques',
  setWebhooksSubtitle: 'Prévenir automatiquement un autre logiciel quand quelque chose se passe dans la boutique.',
  setWebhookNew: 'Nouvelle notification',
  setWebhookUrl: 'Adresse à prévenir',
  setWebhookUrlHint: 'L’adresse web que votre logiciel vous a donnée (elle commence par https://).',
  setWebhookDescription: 'À quoi ça sert ?',
  setWebhookEvents: 'Quand prévenir ?',
  setWebhookAllEvents: 'À chaque fois qu’il se passe quelque chose',
  setWebhookAllEventsHint: 'Le choix le plus simple : votre logiciel reçoit tout et trie lui-même.',
  setWebhookPickEvents: 'Choisir les événements',
  setWebhookEventsRequired: 'Choisissez au moins un événement.',
  setWebhooksEmptyTitle: 'Aucune notification technique',
  setWebhooksEmptyDescription: 'Ajoutez une adresse si un autre logiciel (comptabilité, préparation…) doit être prévenu automatiquement.',
  setSecretOnceTitle: 'Copiez ce code de signature',
  setSecretOnceDescription: 'Il sert à votre logiciel pour vérifier que le message vient bien de vous. Il ne sera plus jamais affiché.',
  setRotateSecret: 'Changer le code de signature',
  setRotateSecretTitle: 'Changer le code de signature ?',
  setRotateSecretBody: 'L’ancien code cesse de fonctionner tout de suite. Tant que le nouveau n’est pas installé dans votre logiciel, il refusera les messages.',
  setDeleteWebhookTitle: 'Supprimer cette notification ?',
  setDeleteWebhookBody: 'Le logiciel branché sur cette adresse ne sera plus prévenu de rien. L’historique des envois est conservé.',
  setDeliveriesTitle: 'Envois',
  setDeliveriesHint: 'Chaque tentative d’envoi, avec son résultat.',
  setDeliveryEvent: 'Événement',
  setDeliveryAttempts: 'Tentatives',
  setDeliveryError: 'Dernière erreur',
  setDeliveryWhen: 'Quand',
  setDeliveryRedeliver: 'Renvoyer',
  setDeliveriesEmptyTitle: 'Aucun envoi',
  setDeliveriesEmptyDescription: 'Rien n’a encore été envoyé à cette adresse. Le premier envoi partira au prochain événement.',
  setDeliveryDelivered: 'Reçu',
  setDeliveryFailed: 'Échec',
  setDeliveryPending: 'En cours',
  setDeliveryPayload: 'Contenu envoyé',
  setDeliveryResponse: 'Réponse',
  setWebhookColUrl: 'Adresse',
  setWebhookColEvents: 'Événements',
  setWebhookSigningHint: 'Chaque envoi porte un en-tête `X-Pygmalion-Signature: t=<horodatage>,v1=<HMAC-SHA256>` calculé sur `<horodatage>.<corps brut>` avec le code de signature.',
  setWebhookTechTitle: 'Détails techniques',
  setEventGroupOrders: 'Commandes',
  setEventGroupPayments: 'Paiements',
  setEventGroupCarts: 'Paniers',
  setEventGroupProducts: 'Produits',
  setEventGroupCatalog: 'Catalogue',
  setEventGroupCustomers: 'Clients',
  setEventGroupPromotions: 'Promotions',
  setEventGroupStock: 'Stock',
  setEventGroupPrices: 'Prix',
  setEventGroupShipping: 'Livraison',
  setEventGroupTaxes: 'Taxes',
  setEventGroupSettings: 'Réglages',

  setMessagesTitle: 'Messages envoyés',
  setMessagesSubtitle: 'Les e-mails et messages que la boutique a préparés pour vos clients et votre équipe.',
  setMessagesFilterTo: 'Destinataire',
  setMessagesFilterPlaceholder: 'client@exemple.fr',
  setMessagesClearFilter: 'Voir tout le monde',
  setMessageSent: 'Envoyé',
  setMessageFailed: 'Échec',
  setMessagePending: 'En attente',
  setMessageColTo: 'Destinataire',
  setMessageColTemplate: 'Message',
  setMessageColChannel: 'Voie',
  setMessageColDate: 'Date',
  setMessagesEmptyTitle: 'Aucun message',
  setMessagesEmptyDescription: 'Dès qu’une commande sera passée ou qu’une invitation sera envoyée, le message apparaîtra ici.',
  setMessagesNoResultTitle: 'Aucun message pour ce destinataire',
  setMessagesNoResultDescription: 'Vérifiez l’adresse, ou affichez tout le monde.',
  setMessageChannelEmail: 'E-mail',
  setMessageChannelFeed: 'Dans l’administration',
}

const settingsEn: Record<SettingsVocabKey, string> = {
  setNavStore: 'Store',
  setNavRegions: 'Selling areas',
  setNavTaxes: 'Taxes',
  setNavShipping: 'Delivery',
  setNavChannels: 'Sales channels',
  setNavKeys: 'Store keys',
  setNavTeam: 'Team',
  setNavWebhooks: 'Technical notifications',
  setNavMessages: 'Sent messages',

  setCopy: 'Copy',
  setCopied: 'Copied!',
  setActive: 'Active',
  setInactive: 'Paused',
  setNever: 'Never',
  setUnknown: 'Unknown',
  setLoadMore: 'Show more',
  setClose: 'Close',
  setNotFound: 'Not found',
  setShowMore: 'Show details',
  setShowLess: 'Hide details',

  setStoreTitle: 'My store',
  setStoreSubtitle: 'The name your customers see, and the basics of how you sell.',
  setStoreNameLabel: 'Store name',
  setStoreNameHint: 'It shows up on your emails and invoices.',
  setStoreDefaultRegion: 'Main selling area',
  setStoreDefaultRegionHint: 'It decides which currency a new customer sees first.',
  setStoreDefaultChannel: 'Main sales channel',
  setStoreDefaultChannelHint: 'New products are attached to it by default.',
  setStoreCurrencyTitle: 'Default currency',
  setStoreCurrencyHint: 'It comes from the main selling area. To change it, change that area’s currency.',
  setStoreNoRegionTitle: 'No selling area yet',
  setStoreNoRegionDescription: 'Create a selling area first — it carries the currency and the countries you serve.',
  setStoreCurrenciesInUse: 'Currencies in use',
  setStoreCurrenciesEmpty: 'No currency until a selling area exists.',

  setRegionsTitle: 'Selling areas',
  setRegionsSubtitle: 'An area = a group of countries paying in the same currency.',
  setRegionNew: 'New area',
  setRegionName: 'Area name',
  setRegionCurrency: 'Currency',
  setRegionCurrencyHint: 'Every price in this area is shown in this currency.',
  setRegionCountries: 'Countries served',
  setRegionCountriesHint: 'A country can only belong to one area.',
  setRegionAutoTaxes: 'Work out tax automatically',
  setRegionAutoTaxesHint: 'Tax is added to the cart based on the customer’s address.',
  setRegionsEmptyTitle: 'No selling area',
  setRegionsEmptyDescription: 'Create your first area — it sets the currency and the countries you sell to.',
  setRegionCountriesWriteOnly: 'The countries already attached to this area can’t be displayed today. What you tick here REPLACES the whole previous list.',
  setRegionCountriesReplace: 'Replace the countries served',
  setDeleteRegionTitle: 'Delete this selling area?',
  setDeleteRegionBody: 'Customers in this area will no longer be able to order. Remove all of its countries first, or the deletion is refused.',
  setRegionCountriesSaved: 'Countries saved.',

  setTaxesTitle: 'Taxes',
  setTaxesSubtitle: 'What you add on top of the price (VAT, reduced rate…) depending on the customer’s country.',
  setTaxRegionNew: 'New taxed country',
  setTaxRegionCountry: 'Country',
  setTaxRegionProvince: 'State / province',
  setTaxRegionProvinceHint: 'Only fill this in if part of the country has its own rates.',
  setTaxRegionsEmptyTitle: 'No tax set up',
  setTaxRegionsEmptyDescription: 'Add the country where you must charge tax, then its rates (VAT, reduced rate…).',
  setDeleteTaxRegionTitle: 'Delete this taxed country?',
  setDeleteTaxRegionBody: 'All of its rates disappear. New orders from this country will carry no tax at all.',
  setTaxRatesTitle: 'Rates',
  setTaxRateNew: 'New rate',
  setTaxRateName: 'Rate name',
  setTaxRateNameHint: 'The name your customer sees: “VAT”, “Reduced rate”…',
  setTaxRateCode: 'Code',
  setTaxRateCodeHint: 'A short marker for your bookkeeping: “VAT20”.',
  setTaxRatePercent: 'Percentage',
  setTaxRatePercentHint: 'Write 20 for 20%.',
  setTaxRateDefault: 'Country’s default rate',
  setTaxRateDefaultHint: 'Applied to every product that has no rate of its own.',
  setTaxRateCombinable: 'Adds up with the default rate',
  setTaxRateCombinableHint: 'Only tick this if the rate stacks on another one (local tax).',
  setTaxRatesEmptyTitle: 'No rate',
  setTaxRatesEmptyDescription: 'Add at least the country’s standard rate (for example “VAT”, 20%).',
  setDeleteTaxRateTitle: 'Delete this rate?',
  setDeleteTaxRateBody: 'New orders won’t charge it any more. Orders already placed don’t change.',
  setTaxOverridesTitle: 'Products on this rate',
  setTaxOverridesHint: 'By default this rate applies to nothing in particular. Add the products (or delivery prices) that must use it instead of the default rate.',
  setTaxOverrideAdd: 'Add',
  setTaxOverrideProduct: 'A product',
  setTaxOverrideShipping: 'A delivery price',
  setTaxOverridesEmpty: 'No product or delivery price: this rate only applies as a default rate.',
  setTaxProvider: 'Worked out by',
  setTaxColCountry: 'Country',
  setTaxColRates: 'Rates',
  setTaxRateSubtitle: 'Rates applied in this country.',

  setShippingTitle: 'Delivery',
  setShippingSubtitle: 'Where you deliver, and how much you charge to do it.',
  setFsetNew: 'New delivery method',
  setFsetName: 'Delivery method name',
  setFsetsEmptyTitle: 'No delivery method',
  setFsetsEmptyDescription: 'Start with a method (“Home delivery”, “Store pickup”), then add areas and prices to it.',
  setDeleteFsetTitle: 'Delete this delivery method?',
  setDeleteFsetBody: 'Its areas and prices disappear: no customer will be able to pick this delivery any more.',
  setZonesTitle: 'Delivered areas',
  setZoneNew: 'New area',
  setZoneName: 'Area name',
  setZoneCountries: 'Countries delivered',
  setZoneCountriesHint: 'Tick every country this area covers.',
  setZonesEmptyTitle: 'No delivered area',
  setZonesEmptyDescription: 'Add an area (“France”, “Europe”) and tick the countries it covers.',
  setDeleteZoneTitle: 'Delete this area?',
  setDeleteZoneBody: 'Its delivery prices disappear: customers in those countries will see no option at all.',
  setZoneCountriesLabel: 'Countries',
  setOptionsTitle: 'Delivery prices',
  setOptionNew: 'New price',
  setOptionName: 'Name the customer sees',
  setOptionProfile: 'Product group',
  setOptionPriceType: 'Price type',
  setOptionPriceFlat: 'Fixed price',
  setOptionPriceCalculated: 'Worked out by the carrier',
  setOptionPriceTypeHint: 'Fixed: you decide the amount. Worked out: the carrier gives the price at checkout.',
  setOptionPrice: 'Price',
  setOptionPriceHint: 'What the customer pays for this delivery.',
  setOptionCarrier: 'Carrier',
  setOptionsEmptyTitle: 'No price',
  setOptionsEmptyDescription: 'Add at least one price, otherwise customers in this area can’t complete their order.',
  setDeleteOptionTitle: 'Delete this price?',
  setDeleteOptionBody: 'Customers won’t be able to pick this delivery any more. Orders already placed don’t change.',
  setOptionPriceWriteOnly: 'The price is set at creation and can’t be read back here. To change it, create a new price and delete the old one.',
  setNoCurrencyForOption: 'Create a selling area first — it’s what gives the price its currency.',
  setProfilesTitle: 'Product groups',
  setProfilesHint: 'A group gathers products that travel the same way (bulky, chilled…). With no group of their own, everything ships with the default group.',
  setProfileNew: 'New group',
  setProfileName: 'Group name',
  setProfileDefault: 'Default group',
  setProfilesEmptyTitle: 'No product group',
  setProfilesEmptyDescription: 'Create a default group: every product uses it until you create another one.',
  setDeleteProfileTitle: 'Delete this group?',
  setDeleteProfileBody: 'Delivery prices attached to this group become unusable.',

  setChannelsTitle: 'Sales channels',
  setChannelsSubtitle: 'The places where you sell: the online store, a marketplace, over the counter…',
  setChannelNew: 'New channel',
  setChannelName: 'Channel name',
  setChannelDescription: 'Description',
  setChannelOpen: 'Open',
  setChannelClosed: 'Closed',
  setChannelOpenHint: 'A closed channel sells nothing, but keeps its products.',
  setChannelsEmptyTitle: 'No sales channel',
  setChannelsEmptyDescription: 'Create at least one channel (“Online store”) so you can attach products to it.',
  setDeleteChannelTitle: 'Delete this channel?',
  setDeleteChannelBody: 'Attached products will no longer sell on this channel. The store’s main channel can’t be deleted.',
  setChannelProducts: 'Products sold here',
  setChannelProductsEmptyTitle: 'No product on this channel',
  setChannelProductsEmptyDescription: 'Open a product page, “Channels” tab, to add it here.',
  setChannelProductsReadOnly: 'Attaching is done from the product page.',

  setKeysTitle: 'Store keys',
  setKeysSubtitle: 'The codes that let a website or a piece of software talk to your store.',
  setKeyNew: 'New key',
  setKeyKindQuestion: 'What is this key for?',
  setKeyKindStore: 'Store key (website)',
  setKeyKindStoreHint: 'Goes into a website or a mobile app. It can only read the catalogue and create carts.',
  setKeyKindServer: 'Server key (software)',
  setKeyKindServerHint: 'It grants full access, like you. Never put it in a public website.',
  setKeyName: 'What is it for?',
  setKeyNameHint: 'For example “Website” or “Accounting export”.',
  setKeyChannels: 'Allowed channels',
  setKeyChannelsHint: 'The key will only see products from these channels.',
  setKeysEmptyTitle: 'No key',
  setKeysEmptyDescription: 'Create a key to plug your website or an external tool into the store.',
  setKeyOnceTitle: 'Copy this key now',
  setKeyOnceDescription: 'It will never be shown again. If you lose it, you’ll have to create another one.',
  setKeyRevoke: 'Turn off',
  setRevokeKeyTitle: 'Turn off this key?',
  setRevokeKeyBody: 'The website or tool using it stops working immediately. The key stays listed here for your records but can never be turned back on.',
  setKeyColName: 'Key',
  setKeyColKind: 'Type',
  setKeyColStatus: 'State',
  setKeyStatusActive: 'Active',
  setKeyStatusRevoked: 'Turned off',
  setKeyUnnamed: 'Unnamed',

  setTeamTitle: 'Team',
  setTeamSubtitle: 'Who can get into the admin, and what each person is allowed to do.',
  setRoleOwner: 'Owner',
  setRoleManager: 'Manager',
  setRoleFulfiller: 'Packer',
  setRoleUnknown: 'Unknown role',
  setRoleOwnerHint: 'Everything, including settings and the team.',
  setRoleManagerHint: 'Products, orders and customers. Read-only on settings.',
  setRoleFulfillerHint: 'Prepares and ships orders. Doesn’t see settings.',
  setTeamMembers: 'Members',
  setTeamMembersEmptyTitle: 'No member',
  setTeamMembersEmptyDescription: 'Invite someone by email — they pick their own password.',
  setInvitesTitle: 'Invitations',
  setInviteNew: 'Invite someone',
  setInviteEmail: 'Email address',
  setInviteRole: 'Role',
  setInvitesEmptyTitle: 'No invitation',
  setInvitesEmptyDescription: 'Invite a colleague: you’ll get a link to pass on to them.',
  setInvitePending: 'Waiting',
  setInviteAccepted: 'Accepted',
  setInviteRevoked: 'Cancelled',
  setInviteExpired: 'Expired',
  setInviteLinkTitle: 'Pass this link on',
  setInviteLinkDescription: 'It will never be shown again and expires in 7 days. Send it to the person you invited.',
  setInviteCopyLink: 'Copy the link',
  setRevokeInviteTitle: 'Cancel this invitation?',
  setRevokeInviteBody: 'The link you already sent stops working. You can invite the same address again afterwards.',
  setInviteRevokeAction: 'Cancel the invitation',
  setTeamColName: 'Name',
  setTeamColEmail: 'Email',
  setTeamColRole: 'Role',
  setTeamColAccess: 'Access',
  setTeamAccessOpen: 'Allowed',
  setTeamAccessBlocked: 'Blocked',
  setTeamBlock: 'Block access',
  setTeamUnblock: 'Restore access',
  setBlockStaffTitle: 'Block this person?',
  setBlockStaffBody: 'They’ll be signed out and won’t be able to get into the admin. Their past work is kept.',
  setUnblockStaffTitle: 'Restore access?',
  setUnblockStaffBody: 'This person will be able to sign in again with their usual password.',
  setTeamYou: 'You',

  setWebhooksTitle: 'Technical notifications',
  setWebhooksSubtitle: 'Automatically tell another piece of software when something happens in the store.',
  setWebhookNew: 'New notification',
  setWebhookUrl: 'Address to notify',
  setWebhookUrlHint: 'The web address your software gave you (it starts with https://).',
  setWebhookDescription: 'What is it for?',
  setWebhookEvents: 'When to notify?',
  setWebhookAllEvents: 'Every time something happens',
  setWebhookAllEventsHint: 'The simplest choice: your software receives everything and sorts it out itself.',
  setWebhookPickEvents: 'Pick the events',
  setWebhookEventsRequired: 'Pick at least one event.',
  setWebhooksEmptyTitle: 'No technical notification',
  setWebhooksEmptyDescription: 'Add an address if another tool (accounting, packing…) must be told automatically.',
  setSecretOnceTitle: 'Copy this signing code',
  setSecretOnceDescription: 'Your software uses it to check the message really comes from you. It will never be shown again.',
  setRotateSecret: 'Change the signing code',
  setRotateSecretTitle: 'Change the signing code?',
  setRotateSecretBody: 'The old code stops working right away. Until the new one is installed in your software, it will refuse the messages.',
  setDeleteWebhookTitle: 'Delete this notification?',
  setDeleteWebhookBody: 'The software plugged into this address will no longer be told anything. The send history is kept.',
  setDeliveriesTitle: 'Sends',
  setDeliveriesHint: 'Every send attempt, with its outcome.',
  setDeliveryEvent: 'Event',
  setDeliveryAttempts: 'Attempts',
  setDeliveryError: 'Last error',
  setDeliveryWhen: 'When',
  setDeliveryRedeliver: 'Send again',
  setDeliveriesEmptyTitle: 'No send',
  setDeliveriesEmptyDescription: 'Nothing has been sent to this address yet. The first send goes out at the next event.',
  setDeliveryDelivered: 'Received',
  setDeliveryFailed: 'Failed',
  setDeliveryPending: 'In progress',
  setDeliveryPayload: 'Content sent',
  setDeliveryResponse: 'Response',
  setWebhookColUrl: 'Address',
  setWebhookColEvents: 'Events',
  setWebhookSigningHint: 'Every send carries an `X-Pygmalion-Signature: t=<timestamp>,v1=<HMAC-SHA256>` header computed over `<timestamp>.<raw body>` with the signing code.',
  setWebhookTechTitle: 'Technical details',
  setEventGroupOrders: 'Orders',
  setEventGroupPayments: 'Payments',
  setEventGroupCarts: 'Carts',
  setEventGroupProducts: 'Products',
  setEventGroupCatalog: 'Catalogue',
  setEventGroupCustomers: 'Customers',
  setEventGroupPromotions: 'Promotions',
  setEventGroupStock: 'Stock',
  setEventGroupPrices: 'Prices',
  setEventGroupShipping: 'Delivery',
  setEventGroupTaxes: 'Taxes',
  setEventGroupSettings: 'Settings',

  setMessagesTitle: 'Sent messages',
  setMessagesSubtitle: 'The emails and messages the store prepared for your customers and your team.',
  setMessagesFilterTo: 'Recipient',
  setMessagesFilterPlaceholder: 'customer@example.com',
  setMessagesClearFilter: 'Show everyone',
  setMessageSent: 'Sent',
  setMessageFailed: 'Failed',
  setMessagePending: 'Waiting',
  setMessageColTo: 'Recipient',
  setMessageColTemplate: 'Message',
  setMessageColChannel: 'Via',
  setMessageColDate: 'Date',
  setMessagesEmptyTitle: 'No message',
  setMessagesEmptyDescription: 'As soon as an order is placed or an invitation is sent, the message shows up here.',
  setMessagesNoResultTitle: 'No message for that recipient',
  setMessagesNoResultDescription: 'Check the address, or show everyone.',
  setMessageChannelEmail: 'Email',
  setMessageChannelFeed: 'In the admin',
}

// --- Clients ------------------------------------------------------------------
// Own block, merged at the bottom, same rule as the orders block above. Address
// field labels are NOT redefined here: `addressFirstName`/`addressLine1`/…
// already exist in the orders block and mean exactly the same thing.

export type CustomersVocabKey =
  | 'customersSubtitle' | 'navCustomersList' | 'navCustomerGroups'
  | 'cusSearchPlaceholder' | 'cusColName' | 'cusColEmail' | 'cusColPhone' | 'cusColKind' | 'cusColSince'
  | 'cusKindAccount' | 'cusKindGuest' | 'cusFilterAll' | 'cusFilterAccount' | 'cusFilterGuest'
  | 'cusEmptyTitle' | 'cusEmptyDescription' | 'cusNoResultsTitle' | 'cusNoResultsDescription' | 'cusLoadMore'
  | 'cusNew' | 'cusNewHint' | 'cusEmailLabel' | 'cusEmailHint' | 'cusNameLabel' | 'cusPhoneLabel'
  | 'cusEmailTaken' | 'cusNoName' | 'cusNotFound'
  | 'cusSectionProfile' | 'cusSectionAddresses' | 'cusSectionGroups' | 'cusSectionOrders'
  | 'cusAccountHint' | 'cusGuestHint' | 'cusEmailReadOnly'
  | 'addrNew' | 'addrLabelName' | 'addrLabelNameHint' | 'addrCompany' | 'addrLine2' | 'addrProvince'
  | 'addrDefaultShipping' | 'addrDefaultBilling' | 'addrIsDefaultShipping' | 'addrIsDefaultBilling'
  | 'addrEmptyTitle' | 'addrEmptyDescription' | 'addrDeleteTitle' | 'addrDeleteBody'
  | 'cusGroupsEmptyTitle' | 'cusGroupsEmptyDescription' | 'cusGroupAdd' | 'cusGroupAddPlaceholder'
  | 'cusGroupRemoveTitle' | 'cusGroupRemoveBody'
  | 'cusOrdersEmptyTitle' | 'cusOrdersEmptyDescription'
  | 'groupsTitle' | 'groupsSubtitle' | 'groupNew' | 'groupNameLabel'
  | 'groupsEmptyTitle' | 'groupsEmptyDescription' | 'groupDeleteTitle' | 'groupDeleteBody' | 'groupNotFound'
  | 'groupMembers' | 'groupMembersEmptyTitle' | 'groupMembersEmptyDescription'
  | 'groupMemberAdd' | 'groupMemberAddPlaceholder' | 'groupMemberRemoveTitle' | 'groupMemberRemoveBody'

const customersFr: Record<CustomersVocabKey, string> = {
  customersSubtitle: 'Les gens qui achètent chez vous',
  navCustomersList: 'Clients',
  navCustomerGroups: 'Groupes',
  cusSearchPlaceholder: 'Chercher par nom ou par e-mail…',
  cusColName: 'Nom',
  cusColEmail: 'E-mail',
  cusColPhone: 'Téléphone',
  cusColKind: 'Type',
  cusColSince: 'Client depuis',
  cusKindAccount: 'A un compte',
  cusKindGuest: 'Sans compte',
  cusFilterAll: 'Tous',
  cusFilterAccount: 'Avec un compte',
  cusFilterGuest: 'Sans compte',
  cusEmptyTitle: 'Aucun client pour l’instant',
  cusEmptyDescription: 'Vos clients apparaissent ici dès leur première commande. Vous pouvez aussi en ajouter un vous-même : une vente au téléphone, une vente en boutique.',
  cusNoResultsTitle: 'Aucun client trouvé',
  cusNoResultsDescription: 'Essayez un autre nom ou une autre adresse e-mail.',
  cusLoadMore: 'Voir plus de clients',
  cusNew: 'Nouveau client',
  cusNewHint: 'Ajoutez la personne pour lui rattacher une commande. Elle n’aura pas de mot de passe : c’est elle qui choisira d’en créer un.',
  cusEmailLabel: 'Adresse e-mail',
  cusEmailHint: 'C’est ce qui identifie la personne. Elle ne pourra plus être changée ensuite.',
  cusNameLabel: 'Nom complet',
  cusPhoneLabel: 'Téléphone',
  cusEmailTaken: 'Un client existe déjà avec cette adresse e-mail.',
  cusNoName: 'Sans nom',
  cusNotFound: 'Ce client n’existe pas ou a été supprimé.',
  cusSectionProfile: 'Ses informations',
  cusSectionAddresses: 'Ses adresses',
  cusSectionGroups: 'Ses groupes',
  cusSectionOrders: 'Ses commandes',
  cusAccountHint: 'Cette personne a créé un compte sur votre boutique : elle peut se connecter et suivre ses commandes.',
  cusGuestHint: 'Cette personne n’a pas de compte. Elle commande en indiquant son e-mail à chaque fois.',
  cusEmailReadOnly: 'L’adresse e-mail ne se change pas : elle identifie le client et ses commandes passées.',
  addrNew: 'Ajouter une adresse',
  addrLabelName: 'Nom de l’adresse',
  addrLabelNameHint: 'Pour vous y retrouver : « Maison », « Bureau »…',
  addrCompany: 'Société',
  addrLine2: 'Complément d’adresse',
  addrProvince: 'Région / département',
  addrDefaultShipping: 'Adresse de livraison habituelle',
  addrDefaultBilling: 'Adresse de facturation habituelle',
  addrIsDefaultShipping: 'Utiliser pour les livraisons',
  addrIsDefaultBilling: 'Utiliser pour les factures',
  addrEmptyTitle: 'Aucune adresse enregistrée',
  addrEmptyDescription: 'Enregistrez l’adresse de ce client pour préparer ses prochaines commandes plus vite.',
  addrDeleteTitle: 'Supprimer cette adresse ?',
  addrDeleteBody: 'Elle disparaît de la fiche du client. Les commandes déjà passées gardent l’adresse utilisée à l’époque.',
  cusGroupsEmptyTitle: 'Dans aucun groupe',
  cusGroupsEmptyDescription: 'Les groupes servent à réserver une promotion à certains clients : « fidèles », « professionnels »…',
  cusGroupAdd: 'Ajouter à un groupe',
  cusGroupAddPlaceholder: 'Choisir un groupe…',
  cusGroupRemoveTitle: 'Retirer de ce groupe ?',
  cusGroupRemoveBody: 'Le client ne bénéficiera plus des promotions réservées à ce groupe. Il reste client.',
  cusOrdersEmptyTitle: 'Aucune commande',
  cusOrdersEmptyDescription: 'Ce client n’a encore rien commandé.',
  groupsTitle: 'Groupes de clients',
  groupsSubtitle: 'Réunissez des clients pour leur réserver des promotions',
  groupNew: 'Nouveau groupe',
  groupNameLabel: 'Nom du groupe',
  groupsEmptyTitle: 'Aucun groupe',
  groupsEmptyDescription: 'Un groupe réunit des clients qui se ressemblent : « fidèles », « professionnels », « employés ». Vous pourrez ensuite leur réserver une promotion.',
  groupDeleteTitle: 'Supprimer ce groupe ?',
  groupDeleteBody: 'Les clients qui en font partie ne sont pas supprimés. Les promotions réservées à ce groupe ne s’appliqueront plus.',
  groupNotFound: 'Ce groupe n’existe pas ou a été supprimé.',
  groupMembers: 'Clients de ce groupe',
  groupMembersEmptyTitle: 'Groupe vide',
  groupMembersEmptyDescription: 'Ajoutez-y des clients pour pouvoir leur réserver une promotion.',
  groupMemberAdd: 'Ajouter un client',
  groupMemberAddPlaceholder: 'Choisir un client…',
  groupMemberRemoveTitle: 'Retirer ce client du groupe ?',
  groupMemberRemoveBody: 'Il ne bénéficiera plus des promotions réservées à ce groupe. Il reste client.',
}

const customersEn: Record<CustomersVocabKey, string> = {
  customersSubtitle: 'The people who buy from you',
  navCustomersList: 'Customers',
  navCustomerGroups: 'Groups',
  cusSearchPlaceholder: 'Search by name or email…',
  cusColName: 'Name',
  cusColEmail: 'Email',
  cusColPhone: 'Phone',
  cusColKind: 'Kind',
  cusColSince: 'Customer since',
  cusKindAccount: 'Has an account',
  cusKindGuest: 'No account',
  cusFilterAll: 'Everyone',
  cusFilterAccount: 'With an account',
  cusFilterGuest: 'Without an account',
  cusEmptyTitle: 'No customers yet',
  cusEmptyDescription: 'Customers show up here on their first order. You can also add one yourself: a phone sale, an in-store sale.',
  cusNoResultsTitle: 'No customer found',
  cusNoResultsDescription: 'Try another name or another email address.',
  cusLoadMore: 'Show more customers',
  cusNew: 'New customer',
  cusNewHint: 'Add the person so you can attach an order to them. They get no password: creating one is their choice.',
  cusEmailLabel: 'Email address',
  cusEmailHint: 'This is what identifies the person. It cannot be changed afterwards.',
  cusNameLabel: 'Full name',
  cusPhoneLabel: 'Phone',
  cusEmailTaken: 'A customer already exists with this email address.',
  cusNoName: 'No name',
  cusNotFound: 'This customer does not exist or has been deleted.',
  cusSectionProfile: 'Their details',
  cusSectionAddresses: 'Their addresses',
  cusSectionGroups: 'Their groups',
  cusSectionOrders: 'Their orders',
  cusAccountHint: 'This person created an account on your store: they can sign in and follow their orders.',
  cusGuestHint: 'This person has no account. They order by giving their email every time.',
  cusEmailReadOnly: 'The email address cannot be changed: it identifies the customer and their past orders.',
  addrNew: 'Add an address',
  addrLabelName: 'Address name',
  addrLabelNameHint: 'So you can tell them apart: “Home”, “Office”…',
  addrCompany: 'Company',
  addrLine2: 'Address line 2',
  addrProvince: 'State / province',
  addrDefaultShipping: 'Usual delivery address',
  addrDefaultBilling: 'Usual billing address',
  addrIsDefaultShipping: 'Use for deliveries',
  addrIsDefaultBilling: 'Use for invoices',
  addrEmptyTitle: 'No address saved',
  addrEmptyDescription: 'Save this customer’s address to prepare their next orders faster.',
  addrDeleteTitle: 'Delete this address?',
  addrDeleteBody: 'It disappears from the customer’s file. Past orders keep the address used at the time.',
  cusGroupsEmptyTitle: 'In no group',
  cusGroupsEmptyDescription: 'Groups let you reserve a promotion for certain customers: “regulars”, “trade”…',
  cusGroupAdd: 'Add to a group',
  cusGroupAddPlaceholder: 'Pick a group…',
  cusGroupRemoveTitle: 'Remove from this group?',
  cusGroupRemoveBody: 'The customer no longer gets the promotions reserved for this group. They stay a customer.',
  cusOrdersEmptyTitle: 'No orders',
  cusOrdersEmptyDescription: 'This customer has not ordered anything yet.',
  groupsTitle: 'Customer groups',
  groupsSubtitle: 'Gather customers to reserve promotions for them',
  groupNew: 'New group',
  groupNameLabel: 'Group name',
  groupsEmptyTitle: 'No groups',
  groupsEmptyDescription: 'A group gathers customers who are alike: “regulars”, “trade”, “staff”. You can then reserve a promotion for them.',
  groupDeleteTitle: 'Delete this group?',
  groupDeleteBody: 'The customers in it are not deleted. Promotions reserved for this group stop applying.',
  groupNotFound: 'This group does not exist or has been deleted.',
  groupMembers: 'Customers in this group',
  groupMembersEmptyTitle: 'Empty group',
  groupMembersEmptyDescription: 'Add customers to it so you can reserve a promotion for them.',
  groupMemberAdd: 'Add a customer',
  groupMemberAddPlaceholder: 'Pick a customer…',
  groupMemberRemoveTitle: 'Remove this customer from the group?',
  groupMemberRemoveBody: 'They no longer get the promotions reserved for this group. They stay a customer.',
}

// --- Promotions & campagnes ---------------------------------------------------

export type PromotionsVocabKey =
  | 'promosSubtitle' | 'navPromotionsList' | 'navCampaigns'
  | 'promoNew' | 'promosEmptyTitle' | 'promosEmptyDescription'
  | 'promoColCode' | 'promoColDiscount' | 'promoColTarget' | 'promoColUsage'
  | 'promoStatusActive' | 'promoStatusInactive' | 'promoStatusDraft'
  | 'promoAutomaticBadge' | 'promoActivate' | 'promoDeactivate'
  | 'promoActivateTitle' | 'promoActivateBody' | 'promoDeactivateTitle' | 'promoDeactivateBody'
  | 'promoDeleteTitle' | 'promoDeleteBody' | 'promoNotFound'
  | 'promoStepType' | 'promoStepTypeDescription' | 'promoStepTarget' | 'promoStepTargetDescription'
  | 'promoStepConditions' | 'promoStepConditionsDescription' | 'promoStepBudget' | 'promoStepBudgetDescription'
  | 'promoStepCode' | 'promoStepCodeDescription' | 'promoSummaryDescription' | 'promoCreateAction'
  | 'promoKindPercent' | 'promoKindPercentHint' | 'promoKindAmount' | 'promoKindAmountHint'
  | 'promoKindBuyget' | 'promoKindBuygetHint' | 'promoKindLocked'
  | 'promoPercentLabel' | 'promoAmountLabel' | 'promoCurrencyLabel'
  | 'promoBuyQtyLabel' | 'promoGetQtyLabel' | 'promoBuygetFor' | 'promoBuygetBought' | 'promoBuygetFree'
  | 'promoTargetOrder' | 'promoTargetOrderHint' | 'promoTargetProducts' | 'promoTargetProductsHint'
  | 'promoTargetCategories' | 'promoTargetCategoriesHint' | 'promoTargetShipping' | 'promoTargetShippingHint'
  | 'promoPickProducts' | 'promoPickCategories' | 'promoPickPlaceholder' | 'promoPickedCount'
  | 'promoSplitAcross' | 'promoSplitAcrossHint' | 'promoSplitEachHint'
  | 'promoMinSubtotalLabel' | 'promoMinSubtotalHint' | 'promoGroupsLabel' | 'promoGroupsHint'
  | 'promoNoGroupsTitle' | 'promoNoGroupsDescription' | 'promoConditionsNone'
  | 'promoBudgetNone' | 'promoBudgetNoneHint' | 'promoBudgetSpend' | 'promoBudgetSpendHint'
  | 'promoBudgetUsage' | 'promoBudgetUsageHint' | 'promoBudgetLimitLabel' | 'promoBudgetCountLabel'
  | 'promoUsedOf' | 'promoUsedTimes' | 'promoNoBudget' | 'promoBudgetSpent'
  | 'promoCodeLabel' | 'promoCodeHint' | 'promoAutomaticLabel' | 'promoAutomaticHint'
  | 'promoStartsAt' | 'promoEndsAt' | 'promoDatesHint' | 'promoNoDates' | 'promoFrom' | 'promoUntil'
  | 'promoValueRequired' | 'promoCodeRequired' | 'promoPickTargets'
  | 'promoSummaryWhat' | 'promoSummaryWhere' | 'promoSummaryWho' | 'promoSummaryWhen'
  | 'promoEditSubtitle' | 'promoSaveChanges'
  | 'campaignsTitle' | 'campaignsSubtitle' | 'campaignNew' | 'campaignNameLabel' | 'campaignDescriptionLabel'
  | 'campaignsEmptyTitle' | 'campaignsEmptyDescription'
  | 'campaignColName' | 'campaignColPeriod' | 'campaignColBudget' | 'campaignColPromotions'
  | 'campaignDeleteTitle' | 'campaignDeleteBody' | 'campaignNotFound' | 'campaignAutoHint'
  | 'campaignPromotions' | 'campaignPromotionsEmptyTitle' | 'campaignPromotionsEmptyDescription'
  | 'campaignAddPromotion' | 'campaignAddPromotionPlaceholder' | 'campaignDetachTitle' | 'campaignDetachBody'

const promotionsFr: Record<PromotionsVocabKey, string> = {
  promosSubtitle: 'Les réductions que vous offrez à vos clients',
  navPromotionsList: 'Promotions',
  navCampaigns: 'Campagnes',
  promoNew: 'Nouvelle promotion',
  promosEmptyTitle: 'Aucune promotion',
  promosEmptyDescription: 'Une promotion, c’est une réduction : « −10 % », « 5 € de moins », « pour 2 achetés, 1 offert ». On vous guide étape par étape.',
  promoColCode: 'Code',
  promoColDiscount: 'Réduction',
  promoColTarget: 'S’applique à',
  promoColUsage: 'Consommation',
  promoStatusActive: 'Active',
  promoStatusInactive: 'Arrêtée',
  promoStatusDraft: 'Brouillon',
  promoAutomaticBadge: 'Sans code',
  promoActivate: 'Activer',
  promoDeactivate: 'Arrêter',
  promoActivateTitle: 'Activer cette promotion ?',
  promoActivateBody: 'Vos clients pourront en profiter dès maintenant.',
  promoDeactivateTitle: 'Arrêter cette promotion ?',
  promoDeactivateBody: 'Elle cesse immédiatement de s’appliquer. Les commandes déjà passées ne changent pas. Vous pourrez la réactiver plus tard.',
  promoDeleteTitle: 'Supprimer cette promotion ?',
  promoDeleteBody: 'Elle disparaît de la liste et ne s’appliquera plus jamais. Les commandes déjà passées ne changent pas.',
  promoNotFound: 'Cette promotion n’existe pas ou a été supprimée.',
  promoStepType: 'La réduction',
  promoStepTypeDescription: 'Quel cadeau faites-vous à votre client ?',
  promoStepTarget: 'Sur quoi',
  promoStepTargetDescription: 'À quoi la réduction s’applique-t-elle ?',
  promoStepConditions: 'Les conditions',
  promoStepConditionsDescription: 'Faut-il remplir une condition pour en profiter ?',
  promoStepBudget: 'Le budget',
  promoStepBudgetDescription: 'Jusqu’où êtes-vous prêt à aller ?',
  promoStepCode: 'Le code et la durée',
  promoStepCodeDescription: 'Que doit taper le client, et jusqu’à quand ?',
  promoSummaryDescription: 'Relisez, puis mettez votre promotion en route.',
  promoCreateAction: 'Activer la promotion',
  promoKindPercent: 'Une réduction en pourcentage',
  promoKindPercentHint: 'Par exemple −10 % sur le prix.',
  promoKindAmount: 'Un montant fixe en moins',
  promoKindAmountHint: 'Par exemple 5 € de moins, quel que soit le prix.',
  promoKindBuyget: 'X achetés, Y offert',
  promoKindBuygetHint: 'Le client en prend plusieurs, vous lui en offrez.',
  promoKindLocked: 'Le genre de réduction ne se change plus une fois la promotion créée : créez-en une nouvelle si besoin.',
  promoPercentLabel: 'Pourcentage de réduction',
  promoAmountLabel: 'Montant de la réduction',
  promoCurrencyLabel: 'Monnaie',
  promoBuyQtyLabel: 'Articles achetés',
  promoGetQtyLabel: 'Articles offerts',
  promoBuygetFor: 'Pour',
  promoBuygetBought: 'achetés,',
  promoBuygetFree: 'offert(s).',
  promoTargetOrder: 'Toute la commande',
  promoTargetOrderHint: 'La réduction porte sur l’ensemble du panier.',
  promoTargetProducts: 'Certains produits',
  promoTargetProductsHint: 'Vous choisissez les produits concernés.',
  promoTargetCategories: 'Une catégorie de produits',
  promoTargetCategoriesHint: 'Tous les produits rangés dans les catégories choisies.',
  promoTargetShipping: 'Les frais de livraison',
  promoTargetShippingHint: 'Choisissez 100 % pour offrir la livraison.',
  promoPickProducts: 'Produits concernés',
  promoPickCategories: 'Catégories concernées',
  promoPickPlaceholder: 'Cochez ce qui est concerné',
  promoPickedCount: 'sélectionné(s)',
  promoSplitAcross: 'Une seule réduction, répartie sur les articles concernés',
  promoSplitAcrossHint: 'Décoché : la réduction s’applique à chaque article concerné, séparément.',
  promoSplitEachHint: 'La réduction s’applique à chaque article concerné.',
  promoMinSubtotalLabel: 'Montant minimum de commande',
  promoMinSubtotalHint: 'Laissez vide s’il n’y a pas de minimum.',
  promoGroupsLabel: 'Réservée à ces groupes de clients',
  promoGroupsHint: 'Ne cochez rien pour l’offrir à tout le monde.',
  promoNoGroupsTitle: 'Aucun groupe de clients',
  promoNoGroupsDescription: 'Créez un groupe dans la section Clients pour réserver une promotion à certaines personnes.',
  promoConditionsNone: 'Aucune condition : tout le monde en profite.',
  promoBudgetNone: 'Sans limite',
  promoBudgetNoneHint: 'La promotion tourne tant que vous ne l’arrêtez pas.',
  promoBudgetSpend: 'Limiter ce que ça me coûte',
  promoBudgetSpendHint: 'La promotion s’arrête d’elle-même une fois ce montant de réductions atteint.',
  promoBudgetUsage: 'Limiter le nombre d’utilisations',
  promoBudgetUsageHint: 'La promotion s’arrête d’elle-même après ce nombre de commandes.',
  promoBudgetLimitLabel: 'Je ne veux pas dépasser',
  promoBudgetCountLabel: 'Nombre d’utilisations maximum',
  promoUsedOf: 'sur',
  promoUsedTimes: 'utilisations',
  promoNoBudget: 'Sans limite',
  promoBudgetSpent: 'Déjà offert',
  promoCodeLabel: 'Code à taper par le client',
  promoCodeHint: 'Court et facile à dire au téléphone : ETE, BIENVENUE10…',
  promoAutomaticLabel: 'Sans code : appliquée toute seule',
  promoAutomaticHint: 'La réduction est déduite dès que le panier remplit les conditions.',
  promoStartsAt: 'À partir du',
  promoEndsAt: 'Jusqu’au',
  promoDatesHint: 'Laissez vide pour une promotion sans date de fin.',
  promoNoDates: 'Sans date de fin',
  promoFrom: 'du',
  promoUntil: 'au',
  promoValueRequired: 'Indiquez d’abord le montant de la réduction.',
  promoCodeRequired: 'Donnez un code, ou choisissez « sans code ».',
  promoPickTargets: 'Choisissez au moins un élément concerné.',
  promoSummaryWhat: 'La réduction',
  promoSummaryWhere: 'S’applique à',
  promoSummaryWho: 'Pour qui',
  promoSummaryWhen: 'Quand',
  promoEditSubtitle: 'Modifier cette promotion',
  promoSaveChanges: 'Enregistrer les modifications',
  campaignsTitle: 'Campagnes',
  campaignsSubtitle: 'Un budget et une période partagés par plusieurs promotions',
  campaignNew: 'Nouvelle campagne',
  campaignNameLabel: 'Nom de la campagne',
  campaignDescriptionLabel: 'À quoi sert-elle ?',
  campaignsEmptyTitle: 'Aucune campagne',
  campaignsEmptyDescription: 'Une campagne réunit plusieurs promotions sous un même budget et une même période : « Soldes d’été », « Black Friday ».',
  campaignColName: 'Campagne',
  campaignColPeriod: 'Période',
  campaignColBudget: 'Budget',
  campaignColPromotions: 'Promotions',
  campaignDeleteTitle: 'Supprimer cette campagne ?',
  campaignDeleteBody: 'Les promotions qu’elle contient ne sont pas supprimées, mais elles perdent leur budget et leur période : elles tourneront sans limite.',
  campaignNotFound: 'Cette campagne n’existe pas ou a été supprimée.',
  campaignAutoHint: 'Les campagnes créées automatiquement portent le budget et les dates d’une seule promotion. Vous pouvez les modifier ici.',
  campaignPromotions: 'Promotions de cette campagne',
  campaignPromotionsEmptyTitle: 'Aucune promotion dans cette campagne',
  campaignPromotionsEmptyDescription: 'Ajoutez-y des promotions pour qu’elles partagent ce budget et cette période.',
  campaignAddPromotion: 'Ajouter une promotion',
  campaignAddPromotionPlaceholder: 'Choisir une promotion…',
  campaignDetachTitle: 'Retirer cette promotion de la campagne ?',
  campaignDetachBody: 'La promotion continue de fonctionner, mais sans budget ni date de fin.',
}

const promotionsEn: Record<PromotionsVocabKey, string> = {
  promosSubtitle: 'The discounts you give your customers',
  navPromotionsList: 'Promotions',
  navCampaigns: 'Campaigns',
  promoNew: 'New promotion',
  promosEmptyTitle: 'No promotions',
  promosEmptyDescription: 'A promotion is a discount: “−10%”, “5€ off”, “buy 2, get 1 free”. We walk you through it.',
  promoColCode: 'Code',
  promoColDiscount: 'Discount',
  promoColTarget: 'Applies to',
  promoColUsage: 'Consumption',
  promoStatusActive: 'Running',
  promoStatusInactive: 'Stopped',
  promoStatusDraft: 'Draft',
  promoAutomaticBadge: 'No code',
  promoActivate: 'Start',
  promoDeactivate: 'Stop',
  promoActivateTitle: 'Start this promotion?',
  promoActivateBody: 'Your customers can use it right away.',
  promoDeactivateTitle: 'Stop this promotion?',
  promoDeactivateBody: 'It stops applying immediately. Past orders are unaffected. You can start it again later.',
  promoDeleteTitle: 'Delete this promotion?',
  promoDeleteBody: 'It disappears from the list and will never apply again. Past orders are unaffected.',
  promoNotFound: 'This promotion does not exist or has been deleted.',
  promoStepType: 'The discount',
  promoStepTypeDescription: 'What are you giving your customer?',
  promoStepTarget: 'On what',
  promoStepTargetDescription: 'What does the discount apply to?',
  promoStepConditions: 'The conditions',
  promoStepConditionsDescription: 'Is there anything to meet before it applies?',
  promoStepBudget: 'The budget',
  promoStepBudgetDescription: 'How far are you willing to go?',
  promoStepCode: 'Code and duration',
  promoStepCodeDescription: 'What does the customer type, and until when?',
  promoSummaryDescription: 'Check it over, then start your promotion.',
  promoCreateAction: 'Start the promotion',
  promoKindPercent: 'A percentage off',
  promoKindPercentHint: 'For example −10% off the price.',
  promoKindAmount: 'A fixed amount off',
  promoKindAmountHint: 'For example 5€ off, whatever the price.',
  promoKindBuyget: 'Buy X, get Y free',
  promoKindBuygetHint: 'The customer takes several, you give some away.',
  promoKindLocked: 'The kind of discount cannot be changed once the promotion exists: create a new one instead.',
  promoPercentLabel: 'Percentage off',
  promoAmountLabel: 'Amount off',
  promoCurrencyLabel: 'Currency',
  promoBuyQtyLabel: 'Items bought',
  promoGetQtyLabel: 'Items free',
  promoBuygetFor: 'For',
  promoBuygetBought: 'bought,',
  promoBuygetFree: 'free.',
  promoTargetOrder: 'The whole order',
  promoTargetOrderHint: 'The discount applies to the entire basket.',
  promoTargetProducts: 'Some products',
  promoTargetProductsHint: 'You pick which products are concerned.',
  promoTargetCategories: 'A product category',
  promoTargetCategoriesHint: 'Every product filed under the chosen categories.',
  promoTargetShipping: 'Delivery charges',
  promoTargetShippingHint: 'Pick 100% to make delivery free.',
  promoPickProducts: 'Products concerned',
  promoPickCategories: 'Categories concerned',
  promoPickPlaceholder: 'Tick what is concerned',
  promoPickedCount: 'selected',
  promoSplitAcross: 'One single discount, spread over the concerned items',
  promoSplitAcrossHint: 'Unticked: the discount applies to each concerned item separately.',
  promoSplitEachHint: 'The discount applies to each concerned item.',
  promoMinSubtotalLabel: 'Minimum order value',
  promoMinSubtotalHint: 'Leave empty if there is no minimum.',
  promoGroupsLabel: 'Reserved for these customer groups',
  promoGroupsHint: 'Tick nothing to give it to everyone.',
  promoNoGroupsTitle: 'No customer groups',
  promoNoGroupsDescription: 'Create a group in the Customers section to reserve a promotion for certain people.',
  promoConditionsNone: 'No condition: everyone gets it.',
  promoBudgetNone: 'No limit',
  promoBudgetNoneHint: 'The promotion runs until you stop it.',
  promoBudgetSpend: 'Cap what it costs me',
  promoBudgetSpendHint: 'The promotion stops on its own once that much has been discounted.',
  promoBudgetUsage: 'Cap how many times it is used',
  promoBudgetUsageHint: 'The promotion stops on its own after that many orders.',
  promoBudgetLimitLabel: 'I do not want to go over',
  promoBudgetCountLabel: 'Maximum number of uses',
  promoUsedOf: 'of',
  promoUsedTimes: 'uses',
  promoNoBudget: 'No limit',
  promoBudgetSpent: 'Given away so far',
  promoCodeLabel: 'Code the customer types',
  promoCodeHint: 'Short and easy to say on the phone: SUMMER, WELCOME10…',
  promoAutomaticLabel: 'No code: applied on its own',
  promoAutomaticHint: 'The discount comes off as soon as the basket meets the conditions.',
  promoStartsAt: 'From',
  promoEndsAt: 'Until',
  promoDatesHint: 'Leave empty for a promotion with no end date.',
  promoNoDates: 'No end date',
  promoFrom: 'from',
  promoUntil: 'until',
  promoValueRequired: 'Set the size of the discount first.',
  promoCodeRequired: 'Give it a code, or choose “no code”.',
  promoPickTargets: 'Pick at least one concerned item.',
  promoSummaryWhat: 'The discount',
  promoSummaryWhere: 'Applies to',
  promoSummaryWho: 'For whom',
  promoSummaryWhen: 'When',
  promoEditSubtitle: 'Edit this promotion',
  promoSaveChanges: 'Save changes',
  campaignsTitle: 'Campaigns',
  campaignsSubtitle: 'One budget and one period shared by several promotions',
  campaignNew: 'New campaign',
  campaignNameLabel: 'Campaign name',
  campaignDescriptionLabel: 'What is it for?',
  campaignsEmptyTitle: 'No campaigns',
  campaignsEmptyDescription: 'A campaign gathers several promotions under one budget and one period: “Summer sale”, “Black Friday”.',
  campaignColName: 'Campaign',
  campaignColPeriod: 'Period',
  campaignColBudget: 'Budget',
  campaignColPromotions: 'Promotions',
  campaignDeleteTitle: 'Delete this campaign?',
  campaignDeleteBody: 'The promotions inside are not deleted, but they lose their budget and their period: they will run with no limit.',
  campaignNotFound: 'This campaign does not exist or has been deleted.',
  campaignAutoHint: 'Campaigns created automatically carry the budget and dates of a single promotion. You can change them here.',
  campaignPromotions: 'Promotions in this campaign',
  campaignPromotionsEmptyTitle: 'No promotion in this campaign',
  campaignPromotionsEmptyDescription: 'Add promotions to it so they share this budget and this period.',
  campaignAddPromotion: 'Add a promotion',
  campaignAddPromotionPlaceholder: 'Pick a promotion…',
  campaignDetachTitle: 'Remove this promotion from the campaign?',
  campaignDetachBody: 'The promotion keeps working, but with no budget and no end date.',
}

// Single aggregation: every block adds its union and its spreads HERE.
export type VocabKey = BaseVocabKey | OrdersVocabKey | SettingsVocabKey | CustomersVocabKey | PromotionsVocabKey

export const vocabulary: Record<Locale, Record<VocabKey, string>> = {
  fr: { ...fr, ...ordersFr, ...settingsFr, ...customersFr, ...promotionsFr },
  en: { ...en, ...ordersEn, ...settingsEn, ...customersEn, ...promotionsEn },
}
