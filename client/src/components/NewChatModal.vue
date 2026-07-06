<script setup>
import { ref, computed, watch } from 'vue'
import TemplateModal from '@core/TemplateModal.vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'
import { useI18n } from '@core/useI18n.js'

const { t } = useI18n()

// Two-tab "new conversation" modal:
//  • Chat       → pick one person, start a DM
//  • Group chat → name it + pick several people, create a group
const props = defineProps({
  show: { type: Boolean, default: false },
  profiles: { type: Array, default: () => [] },
  currentUserId: { type: String, default: null },
  initialTab: { type: String, default: 'dm' }, // 'dm' | 'group'
})
const emit = defineEmits(['start-dm', 'create-group', 'close'])

const TABS = computed(() => [
  { key: 'dm', label: t('echo.tab.chat') },
  { key: 'group', label: t('echo.tab.groupChat') },
])

const tab = ref(props.initialTab)
const search = ref('')
const selected = ref(new Set())
const groupName = ref('')

watch(() => props.show, v => {
  if (v) {
    tab.value = props.initialTab
    search.value = ''
    selected.value = new Set()
    groupName.value = ''
  }
})

const candidates = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.profiles
    .filter(p => String(p._id) !== String(props.currentUserId))
    .filter(p => !q || (p.name || '').toLowerCase().includes(q))
})

function toggle(id) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

function createGroup() {
  if (!selected.value.size) return
  emit('create-group', { title: groupName.value.trim(), memberIds: [...selected.value] })
}
</script>

<template>
  <TemplateModal :show="show" panel-class="max-w-sm" @cancel="emit('close')">
    <div class="flex max-h-[80vh] flex-col">
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between px-5 pb-4 pt-5">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-white">{{ t('echo.newConversation') }}</h2>
        <button
          class="cursor-pointer -mr-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-white"
          :aria-label="t('core.button.close')"
          @click="emit('close')"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Tabs (admin-modal style) -->
      <div class="flex gap-5 border-b border-slate-200/60 px-5 dark:border-white/10">
        <button
          v-for="tabDef in TABS"
          :key="tabDef.key"
          class="cursor-pointer -mb-px border-b-2 pb-2.5 pt-1 text-sm font-semibold transition-colors"
          :class="tab === tabDef.key ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white'"
          @click="tab = tabDef.key"
        >{{ tabDef.label }}</button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <!-- Group name (group tab only) -->
        <template v-if="tab === 'group'">
          <input
            v-model="groupName"
            type="text"
            :placeholder="t('echo.group.namePlaceholderOptional')"
            class="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-500"
          />
          <div class="my-3 border-b border-slate-200/60 dark:border-white/10" />
        </template>

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
            @click="tab === 'dm' ? emit('start-dm', p) : toggle(String(p._id))"
          >
            <AvatarCircle :name="p.name" :color="p.color" :emoji="p.emoji" :admin="p.role === 'admin'" :size="34" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">{{ p.name }}</span>
            <span
              v-if="tab === 'group'"
              class="flex h-5 w-5 items-center justify-center rounded-md border transition-colors"
              :class="selected.has(String(p._id)) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 text-transparent dark:border-white/20'"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            </span>
          </button>
          <p v-if="!candidates.length" class="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            {{ search.trim() ? t('echo.search.noPeople') : t('echo.empty.noOtherPeople') }}
          </p>
        </div>
      </div>

      <!-- Footer (group tab only — DMs start on click) -->
      <div v-if="tab === 'group'" class="flex shrink-0 justify-end gap-3 border-t border-white/30 px-5 py-4 dark:border-white/8">
        <button
          class="cursor-pointer rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-white"
          @click="emit('close')"
        >
          {{ t('core.button.cancel') }}
        </button>
        <button
          :disabled="!selected.size"
          class="cursor-pointer rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          @click="createGroup"
        >
          {{ t('echo.people.submitCreate') }}<span v-if="selected.size"> ({{ selected.size }})</span>
        </button>
      </div>
    </div>
  </TemplateModal>
</template>
