<script setup>
import { ref, computed, watch } from 'vue'
import TemplateModal from '@core/TemplateModal.vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'
import { useI18n } from '@core/useI18n.js'

const { t } = useI18n()

// Group management hub (admin only): rename, transfer admin, remove members and
// add new ones — all in one place. Bound to the live chat object, so changes
// made here (or by others) reflect immediately.
const props = defineProps({
  show: { type: Boolean, default: false },
  chat: { type: Object, default: null },
  profiles: { type: Array, default: () => [] },
  currentUserId: { type: String, default: null },
})
const emit = defineEmits(['rename', 'transfer', 'remove', 'add', 'close'])

const profileMap = computed(() => Object.fromEntries(props.profiles.map(p => [String(p._id), p])))

// Editable name — seeded on open, only "saveable" once it differs.
const name = ref('')
const search = ref('')
watch(() => props.show, v => {
  if (v) { name.value = props.chat?.title || ''; search.value = '' }
})

const ownerId = computed(() => (props.chat?.createdBy ? String(props.chat.createdBy) : null))
const members = computed(() => (props.chat?.members || []).map(id => profileMap.value[id]).filter(Boolean))
const nameDirty = computed(() => name.value.trim() && name.value.trim() !== (props.chat?.title || '').trim())

const candidates = computed(() => {
  const inGroup = new Set((props.chat?.members || []).map(String))
  const q = search.value.trim().toLowerCase()
  return props.profiles
    .filter(p => !inGroup.has(String(p._id)))
    .filter(p => !q || (p.name || '').toLowerCase().includes(q))
})

function saveName() {
  if (nameDirty.value) emit('rename', name.value.trim())
}
</script>

<template>
  <TemplateModal :show="show" size="md" @cancel="emit('close')">
    <div class="flex max-h-[85vh] flex-col">
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between px-5 pb-3 pt-5">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-white">{{ t('echo.menu.groupDetails') }}</h2>
        <button
          class="cursor-pointer -mr-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-white"
          :aria-label="t('core.button.close')"
          @click="emit('close')"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Name field -->
      <div class="px-5 pb-4">
        <label class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{{ t('echo.group.name') }}</label>
        <div class="flex gap-2">
          <input
            v-model="name"
            type="text"
            :placeholder="t('echo.group.name')"
            class="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-500"
            @keydown.enter="saveName"
          />
          <button
            :disabled="!nameDirty"
            class="cursor-pointer rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            @click="saveName"
          >
            {{ t('core.button.save') }}
          </button>
        </div>
      </div>

      <div class="border-t border-slate-200/60 dark:border-white/10" />

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <!-- Members -->
        <p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
          {{ t('echo.group.members', { count: members.length }) }}
        </p>
        <div class="mb-5 flex flex-col gap-0.5">
          <div v-for="m in members" :key="m._id" class="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <AvatarCircle :profile="m" :size="34" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
              {{ m.name }}<span v-if="String(m._id) === currentUserId" class="text-slate-400 dark:text-white/40">{{ t('echo.group.you') }}</span>
            </span>
            <span
              v-if="String(m._id) === ownerId"
              class="rounded-full bg-amber-400/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300"
            >{{ t('echo.group.admin') }}</span>
            <button
              v-if="String(m._id) !== ownerId"
              class="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-500/10 hover:text-amber-500"
              :aria-label="t('echo.group.makeAdmin')"
              :title="t('echo.group.makeAdmin')"
              @click="emit('transfer', String(m._id))"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V6l-9-4z"/><path d="M9 12l2 2 4-4"/></svg>
            </button>
            <button
              v-if="String(m._id) !== currentUserId"
              class="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
              :aria-label="t('echo.group.removeMember')"
              :title="t('echo.group.removeMember')"
              @click="emit('remove', String(m._id))"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Add people -->
        <p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{{ t('echo.people.addPeople') }}</p>
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
            @click="emit('add', [String(p._id)])"
          >
            <AvatarCircle :profile="p" :size="32" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">{{ p.name }}</span>
            <span class="flex h-6 w-6 items-center justify-center rounded-full text-indigo-500 transition-colors group-hover:bg-indigo-500/10">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            </span>
          </button>
          <p v-if="!candidates.length" class="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            {{ search.trim() ? t('echo.search.noPeople') : t('echo.group.everyoneIn') }}
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex shrink-0 justify-end border-t border-white/30 px-5 py-4 dark:border-white/8">
        <button
          class="cursor-pointer rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
          @click="emit('close')"
        >
          {{ t('echo.done') }}
        </button>
      </div>
    </div>
  </TemplateModal>
</template>
