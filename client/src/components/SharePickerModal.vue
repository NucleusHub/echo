<script setup>
import { ref, computed, watch } from 'vue'
import TemplateModal from '@core/TemplateModal.vue'
import { useI18n } from '@core/useI18n.js'
import { Icon, Spinner } from '@core/icons'

const { t } = useI18n()

// Built on the core TemplateModal (single source of modal chrome) — it provides
// the panel, header, close button and search box. This component only supplies
// the body: a poster grid (`layout='grid'`, watchlist) or rows (`'list'`, goals).
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  items: { type: Array, default: () => [] }, // { key, title, subtitle, thumb, dot, message }
  loading: { type: Boolean, default: false },
  layout: { type: String, default: 'list' }, // 'list' | 'grid'
})
const emit = defineEmits(['select', 'close'])

const search = ref('')
watch(() => props.show, v => { if (v) search.value = '' })

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter(i => (i.title || '').toLowerCase().includes(q))
})
</script>

<template>
  <TemplateModal
    :show="show"
    :title="title || t('echo.share.title')"
    header
    searchable
    v-model:search="search"
    :size="layout === 'grid' ? 'lg' : 'md'"
    @cancel="emit('close')"
  >
    <div v-if="loading" class="flex items-center justify-center py-16">
      <Spinner class="w-7 h-7 text-indigo-500 animate-spin" />
    </div>

    <div v-else-if="!filtered.length" class="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
      {{ t('echo.share.empty') }}
    </div>

    <!-- Grid (posters / thumbnails) -->
    <div v-else-if="layout === 'grid'" class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      <button
        v-for="it in filtered"
        :key="it.key"
        type="button"
        class="cursor-pointer text-left rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700/60 hover:ring-2 hover:ring-indigo-500 transition-all group"
        @click="emit('select', it)"
      >
        <div class="aspect-[2/3] w-full overflow-hidden bg-slate-200 dark:bg-slate-700">
          <img v-if="it.thumb" :src="it.thumb" :alt="it.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
          <div v-else class="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
            <Icon name="calendar" class="w-8 h-8" :sw="1.5" />
          </div>
        </div>
        <div class="p-2">
          <p class="text-xs font-medium text-slate-900 dark:text-white leading-tight line-clamp-2">{{ it.title }}</p>
          <p v-if="it.subtitle" class="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 truncate">{{ it.subtitle }}</p>
        </div>
      </button>
    </div>

    <!-- List (goals) -->
    <div v-else class="flex flex-col gap-0.5">
      <button
        v-for="it in filtered"
        :key="it.key"
        type="button"
        class="cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/6 transition-colors"
        @click="emit('select', it)"
      >
        <img v-if="it.thumb" :src="it.thumb" :alt="it.title" class="h-10 w-10 shrink-0 rounded-lg object-cover" />
        <span v-else class="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center" :style="{ background: (it.dot || '#64748b') + '22' }">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ background: it.dot || '#94a3b8' }" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-slate-900 dark:text-white">{{ it.title }}</span>
          <span v-if="it.subtitle" class="block truncate text-xs text-slate-400 dark:text-slate-500">{{ it.subtitle }}</span>
        </span>
      </button>
    </div>
  </TemplateModal>
</template>
