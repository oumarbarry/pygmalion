<script setup lang="ts">
// Capability 4: a module adds a page to the admin. `extendPages` in
// `module.ts` mounts this file on /admin/notes; `layout: 'admin'` puts it in the
// same shell (nav, search, header) as every built-in screen.
definePageMeta({ layout: 'admin' })

const { data } = await useFetch<{ notes: { id: string, body: string, createdAt: string }[] }>(
  '/api/store/demo-notes',
)
</script>

<template>
  <PygPage title="Notes" description="Une page ajoutée par un module">
    <PygList
      :items="data?.notes ?? []"
      :columns="[{ key: 'body', label: 'Note' }]"
    >
      <template #empty>
        <PygEmptyState
          icon="i-lucide-sticky-note"
          title="Aucune note"
          description="Ce module écrit dans sa propre table demo_notes."
        />
      </template>
    </PygList>
  </PygPage>
</template>
