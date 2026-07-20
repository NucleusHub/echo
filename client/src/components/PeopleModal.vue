<script setup>
import { ref, computed, watch } from 'vue'
import TemplateModal from '@core/TemplateModal.vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'
import { Icon } from '@core/icons'
import { useI18n } from '@core/useI18n.js'

const { t } = useI18n()

// Add-people picker, used by the "Add people" action:
//  • mode 'create' → pick people to start a new group (from a DM)
//  • mode 'manage' → add people to an existing group
// (Removing members / transferring admin live in GroupDetailsModal.)
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  mode: { type: String, default: 'manage' }, // 'create' | 'manage'
  profiles: { type: Array, default: () => [] },
  currentUserId: { type: String, default: null },
  // Ids already in (or seeded into) the chat — excluded from the pickable list.
  excludeIds: { type: Array, default: () => [] },
  submitLabel: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'close'])

const search = ref('')
const selected = ref(new Set())

watch(() => props.show, v => { if (v) { search.value = ''; selected.value = new Set() } })

const candidates = computed(() => {
  const excluded = new Set([String(props.currentUserId), ...props.excludeIds.map(String)])
  const q = search.value.trim().toLowerCase()
  return props.profiles
    .filter(p => !excluded.has(String(p._id)))
    .filter(p => !q || (p.name || '').toLowerCase().includes(q))
})

function toggle(id) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

function submit() {
  if (selected.value.size) emit('submit', [...selected.value])
}
</script>

<template>
  <TemplateModal :show="show" size="sm" @cancel="emit('close')">
    <div class="flex max-h-[80vh] flex-col">
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between border-b border-white/30 px-5 pb-4 pt-5 dark:border-white/8">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-white">{{ title || t('echo.people.addPeople') }}</h2>
        <button
          class="cursor-pointer -mr-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-white"
          :aria-label="t('core.button.close')"
          @click="emit('close')"
        >
          <Icon name="close" class="h-4 w-4" :sw="2.5" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <input
          v-model="search"
          type="text"
          :placeholder="t('echo.search.people')"
          class="mb-2 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-500"
        />
        <div class="flex flex-col gap-0.5">
          <button
            v-for="p in candidates"
            :key="p._id"
            class="cursor-pointer flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/6"
            @click="toggle(String(p._id))"
          >
            <AvatarCircle :profile="p" :size="32" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">{{ p.name }}</span>
            <span
              class="flex h-5 w-5 items-center justify-center rounded-md border transition-colors"
              :class="selected.has(String(p._id)) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 text-transparent dark:border-white/20'"
            >
              <Icon name="checkBold" class="h-3.5 w-3.5" :sw="3" />
            </span>
          </button>
          <p v-if="!candidates.length" class="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            {{ search.trim() ? t('echo.search.noPeople') : t('echo.empty.nobodyToAdd') }}
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex shrink-0 justify-end gap-3 border-t border-white/30 px-5 py-4 dark:border-white/8">
        <button
          class="cursor-pointer rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-white"
          @click="emit('close')"
        >
          {{ t('core.button.cancel') }}
        </button>
        <button
          :disabled="!selected.size"
          class="cursor-pointer rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          {{ submitLabel || t('echo.people.submitAdd') }}<span v-if="selected.size"> ({{ selected.size }})</span>
        </button>
      </div>
    </div>
  </TemplateModal>
</template>
