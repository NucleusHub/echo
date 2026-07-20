<script setup>
import { computed } from 'vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'
import { useI18n } from '@core/useI18n.js'
import DotsHorizontalIcon from '@/assets/icons/dots-horizontal.svg?component'

const { t } = useI18n()

// A single row in the chat list. Left-click opens the chat; right-click or the
// hover kebab (⋯) opens the context menu — both emit `menu` with screen
// coordinates so the parent can position one shared menu.
const props = defineProps({
  active: { type: Boolean, default: false },
  title: { type: String, default: '' },
  preview: { type: String, default: '' },
  timestamp: { type: [String, Number, Date], default: null },
  avatarName: { type: String, default: '?' },
  avatarColor: { type: String, default: '#64748b' },
  avatarEmoji: { type: String, default: null },
  avatarImage: { type: String, default: null },
  unread: { type: Number, default: 0 },
})
const emit = defineEmits(['open', 'menu'])

function openMenuFromButton(e) {
  const r = e.currentTarget.getBoundingClientRect()
  emit('menu', { x: r.right, y: r.bottom })
}

// Compact recency: time for today, weekday this week, else a short date. Keeps
// the row scannable — you read "when" at a glance without a full timestamp.
const when = computed(() => {
  if (!props.timestamp) return ''
  const d = new Date(props.timestamp)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const days = Math.round((now - d) / 86400000)
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
})
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="group relative mb-0.5 flex cursor-pointer items-center gap-3 rounded-2xl py-2 pl-2.5 pr-2 text-left transition-colors duration-150"
    :class="active
      ? 'bg-slate-900/[0.055] dark:bg-white/[0.09]'
      : 'hover:bg-slate-900/[0.035] dark:hover:bg-white/[0.05]'"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @contextmenu.prevent.stop="emit('menu', { x: $event.clientX, y: $event.clientY })"
  >
    <!-- Active accent bar -->
    <span
      class="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500 transition-opacity duration-150"
      :class="active ? 'opacity-100' : 'opacity-0'"
    />

    <AvatarCircle :name="avatarName" :color="avatarColor" :emoji="avatarEmoji" :image="avatarImage" :size="38" class="shrink-0" />

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <p class="min-w-0 flex-1 truncate text-[0.9rem] font-semibold tracking-tight text-slate-900 dark:text-white">{{ title }}</p>
        <span v-if="when" class="shrink-0 text-[0.65rem] tabular-nums text-slate-400 dark:text-white/35">{{ when }}</span>
      </div>
      <div class="mt-0.5 flex items-center gap-2">
        <p
          class="min-w-0 flex-1 truncate text-[0.78rem]"
          :class="unread ? 'font-medium text-slate-600 dark:text-white/70' : 'text-slate-400 dark:text-white/40'"
        >{{ preview || t('echo.row.noMessages') }}</p>
        <span
          v-if="unread"
          class="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 px-1.5 text-[0.62rem] font-bold text-white shadow-sm shadow-indigo-500/25"
        >{{ unread > 99 ? '99+' : unread }}</span>
      </div>
    </div>

    <!-- Kebab: hover-reveal on desktop, always present on touch. Overlays the
         time/unread column only while hovering, so the resting row stays clean. -->
    <button
      class="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg bg-white/70 text-slate-400 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-slate-700 focus:opacity-100 group-hover:opacity-100 dark:bg-slate-800/70 dark:text-white/50 dark:hover:text-white [@media(hover:none)]:opacity-100"
      :aria-label="t('echo.chatOptions')"
      @click.stop="openMenuFromButton"
    >
      <DotsHorizontalIcon width="18" height="18" />
    </button>
  </div>
</template>
