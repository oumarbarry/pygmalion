// Design system: Nuxt UI runs `unstyled` (nuxt.config.ts): every slot
// below is Pygmalion's OWN class, not a Nuxt UI default. Slot names were
// read from the real generated `.nuxt/ui/<component>.ts` files (not guessed)
// so they match this exact Nuxt UI version.
//
// Scope note: color x variant combinations are filled for what the
// shell, auth and dashboard screens actually use. Button covers all 7
// semantic colors x solid/outline/soft/ghost since it's the universal
// primitive every screen will reach for. Badge/Alert only cover
// the `soft` weight for the 5 status tones (success/warning/error/info/
// neutral) since PygStatus/PygEmptyState are the intended wrappers — add a
// compoundVariants entry here the first time a screen needs a new combo.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'emerald',
      secondary: 'blue',
      success: 'green',
      info: 'sky',
      warning: 'amber',
      error: 'red',
      neutral: 'stone',
    },
    icons: {
      loading: 'i-lucide-loader-circle',
      close: 'i-lucide-x',
      check: 'i-lucide-check',
      chevronDown: 'i-lucide-chevron-down',
      chevronRight: 'i-lucide-chevron-right',
      arrowLeft: 'i-lucide-arrow-left',
      arrowRight: 'i-lucide-arrow-right',
    },

    button: {
      slots: {
        base: 'inline-flex items-center justify-center font-semibold rounded-xl transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2',
        label: 'truncate',
        leadingIcon: 'shrink-0',
        trailingIcon: 'shrink-0',
      },
      variants: {
        size: {
          xs: { base: 'h-8 px-2.5 text-xs gap-1 rounded-lg', leadingIcon: 'size-3.5', trailingIcon: 'size-3.5' },
          sm: { base: 'h-9 px-3 text-sm gap-1.5 rounded-lg', leadingIcon: 'size-4', trailingIcon: 'size-4' },
          md: { base: 'h-11 px-4 text-base gap-2', leadingIcon: 'size-5', trailingIcon: 'size-5' },
          lg: { base: 'h-12 px-5 text-lg gap-2', leadingIcon: 'size-5', trailingIcon: 'size-5' },
          xl: { base: 'h-14 px-6 text-xl gap-2.5 rounded-2xl', leadingIcon: 'size-6', trailingIcon: 'size-6' },
        },
        block: { true: { base: 'w-full' } },
        // Upstream declares `square` as a STRING variant (not slot-keyed):
        // passing `{ base: … }` here stringified to a literal `[object Object]`
        // class and the square sizing never applied.
        square: { true: 'aspect-square px-0' },
      },
      compoundVariants: [
        { loading: true, leading: true, class: { leadingIcon: 'animate-spin' } },
        { loading: true, leading: false, trailing: true, class: { trailingIcon: 'animate-spin' } },
        // solid
        { color: 'primary', variant: 'solid', class: 'bg-primary text-inverted hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-primary' },
        { color: 'secondary', variant: 'solid', class: 'bg-secondary text-inverted hover:bg-secondary/90 active:bg-secondary/80 focus-visible:outline-secondary' },
        { color: 'success', variant: 'solid', class: 'bg-success text-inverted hover:bg-success/90 active:bg-success/80 focus-visible:outline-success' },
        { color: 'info', variant: 'solid', class: 'bg-info text-inverted hover:bg-info/90 active:bg-info/80 focus-visible:outline-info' },
        { color: 'warning', variant: 'solid', class: 'bg-warning text-inverted hover:bg-warning/90 active:bg-warning/80 focus-visible:outline-warning' },
        { color: 'error', variant: 'solid', class: 'bg-error text-inverted hover:bg-error/90 active:bg-error/80 focus-visible:outline-error' },
        { color: 'neutral', variant: 'solid', class: 'bg-inverted text-inverted hover:bg-inverted/90 active:bg-inverted/80 focus-visible:outline-neutral' },
        // outline
        { color: 'primary', variant: 'outline', class: 'text-primary ring ring-inset ring-primary/50 hover:bg-primary/10 focus-visible:outline-primary' },
        { color: 'secondary', variant: 'outline', class: 'text-secondary ring ring-inset ring-secondary/50 hover:bg-secondary/10 focus-visible:outline-secondary' },
        { color: 'success', variant: 'outline', class: 'text-success ring ring-inset ring-success/50 hover:bg-success/10 focus-visible:outline-success' },
        { color: 'info', variant: 'outline', class: 'text-info ring ring-inset ring-info/50 hover:bg-info/10 focus-visible:outline-info' },
        { color: 'warning', variant: 'outline', class: 'text-warning ring ring-inset ring-warning/50 hover:bg-warning/10 focus-visible:outline-warning' },
        { color: 'error', variant: 'outline', class: 'text-error ring ring-inset ring-error/50 hover:bg-error/10 focus-visible:outline-error' },
        { color: 'neutral', variant: 'outline', class: 'text-default ring ring-inset ring-default hover:bg-muted focus-visible:outline-neutral' },
        // soft
        { color: 'primary', variant: 'soft', class: 'text-primary bg-primary/10 hover:bg-primary/15 focus-visible:outline-primary' },
        { color: 'secondary', variant: 'soft', class: 'text-secondary bg-secondary/10 hover:bg-secondary/15 focus-visible:outline-secondary' },
        { color: 'success', variant: 'soft', class: 'text-success bg-success/10 hover:bg-success/15 focus-visible:outline-success' },
        { color: 'info', variant: 'soft', class: 'text-info bg-info/10 hover:bg-info/15 focus-visible:outline-info' },
        { color: 'warning', variant: 'soft', class: 'text-warning bg-warning/10 hover:bg-warning/15 focus-visible:outline-warning' },
        { color: 'error', variant: 'soft', class: 'text-error bg-error/10 hover:bg-error/15 focus-visible:outline-error' },
        { color: 'neutral', variant: 'soft', class: 'text-default bg-muted hover:bg-accented focus-visible:outline-neutral' },
        // ghost
        { color: 'primary', variant: 'ghost', class: 'text-primary hover:bg-primary/10 focus-visible:outline-primary' },
        { color: 'secondary', variant: 'ghost', class: 'text-secondary hover:bg-secondary/10 focus-visible:outline-secondary' },
        { color: 'success', variant: 'ghost', class: 'text-success hover:bg-success/10 focus-visible:outline-success' },
        { color: 'info', variant: 'ghost', class: 'text-info hover:bg-info/10 focus-visible:outline-info' },
        { color: 'warning', variant: 'ghost', class: 'text-warning hover:bg-warning/10 focus-visible:outline-warning' },
        { color: 'error', variant: 'ghost', class: 'text-error hover:bg-error/10 focus-visible:outline-error' },
        { color: 'neutral', variant: 'ghost', class: 'text-default hover:bg-muted focus-visible:outline-neutral' },
      ],
      defaultVariants: { color: 'primary', variant: 'solid', size: 'md' },
    },

    badge: {
      slots: {
        base: 'inline-flex items-center font-semibold rounded-full',
        label: 'truncate',
        leadingIcon: 'shrink-0',
        trailingIcon: 'shrink-0',
      },
      variants: {
        size: {
          xs: { base: 'px-1.5 py-0.5 text-[10px] gap-0.5', leadingIcon: 'size-3', trailingIcon: 'size-3' },
          sm: { base: 'px-2 py-0.5 text-xs gap-1', leadingIcon: 'size-3', trailingIcon: 'size-3' },
          md: { base: 'px-2.5 py-1 text-xs gap-1', leadingIcon: 'size-3.5', trailingIcon: 'size-3.5' },
          lg: { base: 'px-3 py-1 text-sm gap-1.5', leadingIcon: 'size-4', trailingIcon: 'size-4' },
          xl: { base: 'px-3.5 py-1.5 text-sm gap-1.5', leadingIcon: 'size-4', trailingIcon: 'size-4' },
        },
      },
      compoundVariants: [
        { color: 'success', variant: 'soft', class: 'bg-success/10 text-success' },
        { color: 'warning', variant: 'soft', class: 'bg-warning/10 text-warning' },
        { color: 'error', variant: 'soft', class: 'bg-error/10 text-error' },
        { color: 'info', variant: 'soft', class: 'bg-info/10 text-info' },
        { color: 'neutral', variant: 'soft', class: 'bg-muted text-default' },
      ],
      defaultVariants: { color: 'neutral', variant: 'soft', size: 'md' },
    },

    card: {
      slots: {
        root: 'rounded-2xl border border-default bg-default shadow-sm',
        header: 'p-4 sm:p-6 border-b border-default',
        body: 'p-4 sm:p-6',
        footer: 'p-4 sm:p-6 border-t border-default flex items-center gap-3',
      },
      defaultVariants: { variant: 'outline' },
    },

    input: {
      slots: {
        root: 'relative inline-flex items-center w-full',
        base: 'w-full rounded-xl border border-default bg-default text-highlighted placeholder:text-dimmed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed',
        leading: 'absolute inset-y-0 start-0 flex items-center pointer-events-none',
        leadingIcon: 'text-dimmed shrink-0',
        trailing: 'absolute inset-y-0 end-0 flex items-center',
        trailingIcon: 'text-dimmed shrink-0',
      },
      variants: {
        size: {
          xs: { base: 'h-8 px-2.5 text-xs', leading: 'ps-2.5', trailing: 'pe-2.5', leadingIcon: 'size-3.5', trailingIcon: 'size-3.5' },
          sm: { base: 'h-9 px-3 text-sm', leading: 'ps-3', trailing: 'pe-3', leadingIcon: 'size-4', trailingIcon: 'size-4' },
          md: { base: 'h-11 px-3.5 text-base', leading: 'ps-3.5', trailing: 'pe-3.5', leadingIcon: 'size-5', trailingIcon: 'size-5' },
          lg: { base: 'h-12 px-4 text-lg', leading: 'ps-4', trailing: 'pe-4', leadingIcon: 'size-5', trailingIcon: 'size-5' },
          xl: { base: 'h-14 px-4 text-xl', leading: 'ps-4', trailing: 'pe-4', leadingIcon: 'size-6', trailingIcon: 'size-6' },
        },
      },
      compoundVariants: [
        { leading: true, size: 'xs', class: { base: 'ps-8' } },
        { leading: true, size: 'sm', class: { base: 'ps-9' } },
        { leading: true, size: 'md', class: { base: 'ps-10' } },
        { leading: true, size: 'lg', class: { base: 'ps-11' } },
        { leading: true, size: 'xl', class: { base: 'ps-12' } },
        { trailing: true, size: 'xs', class: { base: 'pe-8' } },
        { trailing: true, size: 'sm', class: { base: 'pe-9' } },
        { trailing: true, size: 'md', class: { base: 'pe-10' } },
        { trailing: true, size: 'lg', class: { base: 'pe-11' } },
        { trailing: true, size: 'xl', class: { base: 'pe-12' } },
      ],
      defaultVariants: { size: 'md', variant: 'outline' },
    },

    textarea: {
      slots: {
        root: 'relative inline-flex w-full',
        base: 'w-full rounded-xl border border-default bg-default text-highlighted placeholder:text-dimmed px-3.5 py-2.5 text-base transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed',
      },
      defaultVariants: { size: 'md', variant: 'outline' },
    },

    formField: {
      slots: {
        root: 'flex flex-col gap-1.5',
        // `labelWrapper` holds label + hint on one line. Left unstyled they
        // rendered glued together ("Complémentfacultatif").
        labelWrapper: 'flex items-baseline justify-between gap-3',
        label: 'text-sm font-semibold text-highlighted',
        container: 'relative',
        description: 'text-sm text-muted',
        error: 'text-sm text-error font-medium flex items-center gap-1',
        hint: 'text-sm text-dimmed',
        help: 'text-sm text-muted',
      },
      variants: {
        required: { true: { label: "after:content-['_*'] after:text-error" } },
      },
    },

    modal: {
      slots: {
        overlay: 'fixed inset-0 bg-neutral-950/50 backdrop-blur-[2px]',
        content: 'fixed z-50 bg-default divide-y divide-default flex flex-col focus:outline-none rounded-2xl shadow-xl inset-x-4 bottom-4 max-h-[85vh] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md',
        header: 'flex items-start justify-between gap-2 p-4 sm:p-6',
        body: 'p-4 sm:px-6 flex-1 overflow-y-auto',
        footer: 'flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 sm:gap-3 p-4 sm:p-6',
        title: 'text-lg font-bold text-highlighted',
        description: 'text-sm text-muted mt-1',
        close: 'absolute top-4 right-4',
      },
    },

    dropdownMenu: {
      slots: {
        content: 'min-w-56 max-w-72 bg-default border border-default rounded-xl shadow-lg p-1 focus:outline-none z-50',
        item: 'group flex items-center gap-2 rounded-lg px-2.5 min-h-11 text-sm text-default cursor-pointer select-none outline-none data-highlighted:bg-muted',
        itemLabel: 'truncate',
        itemLeadingIcon: 'shrink-0 size-4 text-muted',
        itemTrailingIcon: 'shrink-0 size-4 text-dimmed',
        separator: 'my-1 h-px bg-default',
        label: 'px-2.5 py-1.5 text-xs font-semibold text-dimmed',
        empty: 'px-2.5 py-3 text-sm text-muted text-center',
      },
    },

    avatar: {
      slots: {
        root: 'inline-flex items-center justify-center rounded-full bg-muted text-muted font-bold overflow-hidden shrink-0',
        image: 'h-full w-full object-cover',
        fallback: 'font-bold',
      },
      variants: {
        size: {
          '3xs': { root: 'size-4 text-[8px]' },
          '2xs': { root: 'size-5 text-[9px]' },
          xs: { root: 'size-6 text-[10px]' },
          sm: { root: 'size-8 text-xs' },
          md: { root: 'size-10 text-sm' },
          lg: { root: 'size-12 text-base' },
          xl: { root: 'size-14 text-lg' },
          '2xl': { root: 'size-16 text-xl' },
          '3xl': { root: 'size-20 text-2xl' },
        },
        color: {
          neutral: { root: 'bg-muted text-default' },
        },
      },
      defaultVariants: { size: 'md', color: 'neutral' },
    },

    alert: {
      slots: {
        root: 'rounded-xl p-4 flex gap-3',
        wrapper: 'flex-1 min-w-0',
        title: 'text-sm font-semibold',
        description: 'text-sm mt-0.5',
        icon: 'shrink-0 size-5 mt-0.5',
        actions: 'flex items-center gap-2 mt-3',
        close: 'shrink-0',
      },
      compoundVariants: [
        { color: 'success', variant: 'soft', class: { root: 'bg-success/10 text-success', icon: 'text-success' } },
        { color: 'warning', variant: 'soft', class: { root: 'bg-warning/10 text-warning', icon: 'text-warning' } },
        { color: 'error', variant: 'soft', class: { root: 'bg-error/10 text-error', icon: 'text-error' } },
        { color: 'info', variant: 'soft', class: { root: 'bg-info/10 text-info', icon: 'text-info' } },
        { color: 'neutral', variant: 'soft', class: { root: 'bg-muted text-default', icon: 'text-muted' } },
      ],
      defaultVariants: { color: 'neutral', variant: 'soft' },
    },

    empty: {
      slots: {
        root: 'flex flex-col items-center justify-center text-center gap-3 p-8 sm:p-12',
        header: 'flex flex-col items-center gap-3',
        avatar: 'size-14 text-muted',
        title: 'text-lg font-bold text-highlighted',
        description: 'text-sm text-muted max-w-sm',
        body: 'flex flex-col items-center gap-3',
        actions: 'flex flex-wrap items-center justify-center gap-3 mt-1',
        footer: 'mt-2',
      },
    },

    // Catalogue additions: slot names read from the generated
    // `.nuxt/ui/{select,checkbox,switch,tabs}.ts`, same method as above.
    select: {
      slots: {
        root: 'relative inline-flex items-center w-full',
        base: 'w-full inline-flex items-center justify-between gap-2 rounded-xl border border-default bg-default text-highlighted transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed',
        value: 'truncate text-left',
        placeholder: 'truncate text-left text-dimmed',
        leading: 'absolute inset-y-0 start-0 flex items-center pointer-events-none',
        leadingIcon: 'text-dimmed shrink-0',
        trailing: 'flex items-center',
        trailingIcon: 'text-dimmed shrink-0',
        content: 'max-h-72 w-(--reka-select-trigger-width) overflow-y-auto bg-default border border-default rounded-xl shadow-lg p-1 z-50 focus:outline-none',
        viewport: 'divide-y divide-transparent',
        group: 'py-0.5',
        label: 'px-2.5 py-1.5 text-xs font-semibold text-dimmed',
        separator: 'my-1 h-px bg-default',
        empty: 'px-2.5 py-3 text-sm text-muted text-center',
        item: 'group flex items-center gap-2 rounded-lg px-2.5 min-h-11 text-sm text-default cursor-pointer select-none outline-none data-highlighted:bg-muted data-disabled:opacity-50 data-disabled:cursor-not-allowed',
        itemWrapper: 'min-w-0 flex-1',
        itemLabel: 'truncate',
        itemDescription: 'text-xs text-muted truncate',
        itemLeadingIcon: 'shrink-0 size-4 text-muted',
        itemTrailing: 'ms-auto flex items-center',
        itemTrailingIcon: 'shrink-0 size-4 text-primary',
      },
      variants: {
        size: {
          xs: { base: 'h-8 px-2.5 text-xs' },
          sm: { base: 'h-9 px-3 text-sm' },
          md: { base: 'h-11 px-3.5 text-base' },
          lg: { base: 'h-12 px-4 text-lg' },
          xl: { base: 'h-14 px-4 text-xl' },
        },
      },
      defaultVariants: { size: 'md', variant: 'outline', color: 'primary' },
    },

    checkbox: {
      slots: {
        root: 'relative flex items-start gap-2.5',
        container: 'flex items-center h-11 shrink-0',
        base: 'size-5 rounded-md border-2 border-default bg-default cursor-pointer shrink-0 flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary disabled:opacity-50 disabled:cursor-not-allowed',
        indicator: 'flex items-center justify-center text-inverted',
        icon: 'size-3.5 shrink-0',
        wrapper: 'min-w-0 flex-1 py-2.5',
        label: 'text-sm font-medium text-default cursor-pointer',
        description: 'text-xs text-muted',
      },
      defaultVariants: { color: 'primary', variant: 'list', indicator: 'start' },
    },

    switch: {
      slots: {
        root: 'relative flex items-start gap-3',
        container: 'flex items-center h-11 shrink-0',
        base: 'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent bg-accented cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[state=checked]:bg-primary disabled:opacity-50 disabled:cursor-not-allowed',
        thumb: 'pointer-events-none block size-5 rounded-full bg-default shadow ring-0 transition-transform translate-x-0 data-[state=checked]:translate-x-5',
        icon: 'size-3',
        wrapper: 'min-w-0 flex-1 py-2.5',
        label: 'text-sm font-medium text-default cursor-pointer',
        description: 'text-xs text-muted',
      },
      defaultVariants: { color: 'primary' },
    },

    tabs: {
      slots: {
        root: 'flex flex-col gap-6',
        list: 'relative flex items-center gap-1 overflow-x-auto border-b border-default',
        // The active tab is marked by its own bottom border (below), so the
        // sliding indicator would double it — hidden on purpose.
        indicator: 'hidden',
        trigger: 'pyg-tap-target inline-flex items-center gap-2 px-3 text-sm font-semibold whitespace-nowrap text-muted border-b-2 border-transparent cursor-pointer transition-colors hover:text-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[state=active]:text-primary data-[state=active]:border-primary',
        leadingIcon: 'shrink-0 size-4',
        label: 'truncate',
        content: 'focus:outline-none',
      },
      defaultVariants: { color: 'primary', variant: 'link', size: 'md' },
    },
    // Toasts are the ONLY feedback channel for every failed /api/admin/** call
    // (plugins/admin-api.ts) and for most successful writes — in unstyled mode
    // they rendered as bare text floating on the page background, with no
    // surface and no stacking. The `base`/`viewport` positioning classes
    // come from the component's own contract (CSS vars it sets at runtime):
    // they are layout, not cosmetics, so they are kept verbatim.
    toaster: {
      slots: {
        viewport: 'fixed flex flex-col w-[calc(100%-2rem)] sm:w-96 z-[100] data-[expanded=true]:h-(--height) focus:outline-none',
        base: 'pointer-events-auto absolute inset-x-0 z-(--index) transform-(--transform) data-[expanded=false]:data-[front=false]:h-(--front-height) data-[expanded=false]:data-[front=false]:*:opacity-0 data-[front=false]:*:transition-opacity data-[front=false]:*:duration-100 data-[state=closed]:animate-[toast-closed_200ms_ease-in-out] data-[state=closed]:data-[expanded=false]:data-[front=false]:animate-[toast-collapsed-closed_200ms_ease-in-out] data-[swipe=move]:transition-none transition-[transform,translate,height] duration-200 ease-out',
      },
      variants: {
        position: {
          'top-left': { viewport: 'left-4' },
          'top-center': { viewport: 'left-1/2 transform -translate-x-1/2' },
          'top-right': { viewport: 'right-4' },
          'bottom-left': { viewport: 'left-4' },
          'bottom-center': { viewport: 'left-1/2 transform -translate-x-1/2' },
          'bottom-right': { viewport: 'right-4' },
        },
        swipeDirection: {
          up: 'data-[swipe=end]:animate-[toast-slide-up_200ms_ease-out]',
          right: 'data-[swipe=end]:animate-[toast-slide-right_200ms_ease-out]',
          down: 'data-[swipe=end]:animate-[toast-slide-down_200ms_ease-out]',
          left: 'data-[swipe=end]:animate-[toast-slide-left_200ms_ease-out]',
        },
      },
    },

    toast: {
      slots: {
        root: 'relative group overflow-hidden flex gap-3 p-4 rounded-2xl border border-default bg-default shadow-xl',
        wrapper: 'w-0 flex-1 flex flex-col',
        title: 'text-sm font-bold text-highlighted',
        description: 'text-sm text-muted',
        icon: 'shrink-0 size-5',
        avatar: 'shrink-0',
        avatarSize: '2xl',
        actions: 'flex gap-2 shrink-0',
        progress: 'absolute inset-x-0 bottom-0 h-1',
        close: 'shrink-0',
      },
      variants: {
        color: {
          primary: { icon: 'text-primary', progress: 'bg-primary' },
          secondary: { icon: 'text-secondary', progress: 'bg-secondary' },
          success: { icon: 'text-success', progress: 'bg-success' },
          info: { icon: 'text-info', progress: 'bg-info' },
          warning: { icon: 'text-warning', progress: 'bg-warning' },
          error: { icon: 'text-error', progress: 'bg-error' },
          neutral: { icon: 'text-highlighted', progress: 'bg-inverted' },
        },
        orientation: {
          horizontal: { root: 'items-center', actions: 'items-center' },
          vertical: { root: 'items-start', actions: 'items-start mt-2.5' },
        },
        title: { true: { description: 'mt-1' } },
      },
      defaultVariants: { color: 'primary' },
    },

    // No `stepper` block: `UStepper` was themed against a slot tree that
    // doesn't exist (`container` is per-item, the list wrapper is `header`),
    // so it rendered the 6-7 wizard steps as a vertical column. It also
    // carries no behaviour here — PygWizard passes `disabled`, i.e. it was a
    // purely decorative component. PygWizard draws its own progress bar
    // instead.
  },
})
