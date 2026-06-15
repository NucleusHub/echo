<script setup>
import AvatarCircle from '@core/auth/AvatarCircle.vue'

// A single row in the chat list. Left-click opens the chat; right-click or the
// hover kebab (⋯) opens the context menu — both emit `menu` with screen
// coordinates so the parent can position one shared menu.
defineProps({
  active: { type: Boolean, default: false },
  title: { type: String, default: '' },
  preview: { type: String, default: '' },
  avatarName: { type: String, default: '?' },
  avatarColor: { type: String, default: '#64748b' },
  avatarEmoji: { type: String, default: null },
  unread: { type: Number, default: 0 },
})
const emit = defineEmits(['open', 'menu'])

function openMenuFromButton(e) {
  const r = e.currentTarget.getBoundingClientRect()
  emit('menu', { x: r.right, y: r.bottom })
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="group cursor-pointer mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors"
    :class="active ? 'bg-black/8 dark:bg-white/12' : 'hover:bg-black/5 dark:hover:bg-white/6'"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @contextmenu.prevent.stop="emit('menu', { x: $event.clientX, y: $event.clientY })"
  >
    <AvatarCircle :name="avatarName" :color="avatarColor" :emoji="avatarEmoji" :size="34" class="shrink-0" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-slate-900 dark:text-white">{{ title }}</p>
      <p class="truncate text-xs text-slate-500 dark:text-white/45">{{ preview || 'No messages yet' }}</p>
    </div>
    <span
      v-if="unread"
      class="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[0.65rem] font-semibold text-white"
    >{{ unread }}</span>
    <button
      class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-0 transition-opacity hover:bg-black/10 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
      :class="{ 'opacity-100': active }"
      aria-label="Chat options"
      @click.stop="openMenuFromButton"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
    </button>
  </div>
</template>
