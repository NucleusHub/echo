<script setup>
import { ref, watch } from 'vue'
import TemplateModal from '@core/TemplateModal.vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'

// Pick a single member from a list, then confirm. Used for choosing a successor
// when leaving a group, and for transferring the group-admin role.
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  members: { type: Array, default: () => [] },
  confirmLabel: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'close'])

const selected = ref(null)
watch(() => props.show, v => { if (v) selected.value = null })
</script>

<template>
  <TemplateModal :show="show" panel-class="max-w-sm" @cancel="emit('close')">
    <div class="flex max-h-[80vh] flex-col">
      <div class="px-6 pb-3 pt-6">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">{{ title }}</h2>
        <p v-if="message" class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{{ message }}</p>
      </div>

      <div class="flex-1 overflow-y-auto px-4 pb-2">
        <button
          v-for="m in members"
          :key="m._id"
          class="cursor-pointer flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/6"
          @click="selected = String(m._id)"
        >
          <AvatarCircle :name="m.name" :color="m.color" :emoji="m.emoji" :admin="m.role === 'admin'" :size="32" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">{{ m.name }}</span>
          <span
            class="flex h-5 w-5 items-center justify-center rounded-full border transition-colors"
            :class="selected === String(m._id) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 text-transparent dark:border-white/20'"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          </span>
        </button>
      </div>

      <div class="flex justify-end gap-3 border-t border-white/30 px-6 py-4 dark:border-white/8">
        <button
          class="cursor-pointer rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-white"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          :disabled="!selected"
          class="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          :class="danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-500 hover:bg-indigo-400'"
          @click="emit('confirm', selected)"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </TemplateModal>
</template>
