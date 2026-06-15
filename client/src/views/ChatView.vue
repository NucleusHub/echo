<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '@core/AppSidebar.vue'
import AppHeader from '@core/AppHeader.vue'
import TemplateModal from '@core/TemplateModal.vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'
import SharePickerModal from '@/components/SharePickerModal.vue'
import FileTreePickerModal from '@/components/FileTreePickerModal.vue'
import ChatRow from '@/components/ChatRow.vue'
import PeopleModal from '@/components/PeopleModal.vue'
import NewChatModal from '@/components/NewChatModal.vue'
import MemberPickerModal from '@/components/MemberPickerModal.vue'
import GroupDetailsModal from '@/components/GroupDetailsModal.vue'
import EchoMessageBubble from '@core/echo/EchoMessageBubble.vue'
import EchoComposer from '@core/echo/EchoComposer.vue'
import { useAuth } from '@core/auth/useAuth.js'
import { api } from '@/api/echo.js'
import { useEchoRegistry } from '@/composables/useEchoRegistry.js'
import { useEchoSocket } from '@/composables/useEchoSocket.js'

const route = useRoute()
const router = useRouter()
const { profile } = useAuth()
const currentUserId = computed(() => (profile.value?._id ? String(profile.value._id) : null))

const { registry, load: loadRegistry } = useEchoRegistry()
const {
  typingByChat, unread, connected,
  send, onMessage, onChatUpsert, onChatRemoved,
  markRead, startTyping, stopTyping, joinChat, leaveChat,
} = useEchoSocket()

const sidebarOpen = ref(false)
const chats = ref([])
const messages = ref([])
const activeId = ref(route.params.chatId || null)
const scroller = ref(null)

// People you can start a chat with (all profiles except yourself).
const profiles = ref([])
const creating = ref(false)
const profileMap = computed(() => Object.fromEntries(profiles.value.map(p => [String(p._id), p])))

// "New conversation" modal — opens on the Chat or Group-chat tab.
const showNewChat = ref(false)
const newChatTab = ref('dm')
function openNewChat(tab) {
  newChatTab.value = tab
  newMenu.value = { ...newMenu.value, open: false }
  showNewChat.value = true
}

// Split the chat list into 1:1 DMs and groups for the two sidebar sections.
const dmChats = computed(() => chats.value.filter(c => c.kind !== 'group'))
const groupChats = computed(() => chats.value.filter(c => c.kind === 'group'))

// DMs have no title — show the other member's name (resolved from profiles).
function otherMemberId(chat) {
  return chat.members.find(m => m !== currentUserId.value) || chat.members[0]
}
// Group with no explicit name falls back to the members' names.
function groupAutoName(chat) {
  const names = chat.members
    .filter(id => id !== currentUserId.value)
    .map(id => profileMap.value[id]?.name)
    .filter(Boolean)
  return names.length ? names.join(', ') : 'Group'
}
function displayTitle(chat) {
  if (!chat) return ''
  if (chat.kind === 'group') return chat.title || groupAutoName(chat)
  return profileMap.value[otherMemberId(chat)]?.name || 'Direct message'
}
// Group management (rename / remove member / delete) is creator- or admin-only.
function canManageGroup(chat) {
  if (!chat || chat.kind !== 'group') return false
  return profile.value?.role === 'admin' || chat.createdBy === currentUserId.value
}
// Avatar props for a chat row — DMs use the other person, groups use a glyph.
function chatAvatar(chat) {
  if (chat.kind === 'group') return { name: displayTitle(chat), color: '#6366f1', emoji: null }
  const p = profileMap.value[otherMemberId(chat)]
  return { name: p?.name || displayTitle(chat), color: p?.color || '#64748b', emoji: p?.emoji || null }
}

// Composer actions for the active chat come straight from the registry — every
// app that declared composer_actions in its manifest shows up here automatically.
const composerActions = computed(() => registry.value.composerActions || [])

const activeChat = computed(() => chats.value.find(c => c.id === activeId.value) || null)

// Typing indicator (anyone other than me currently typing in this chat).
const typingHere = computed(() => {
  const set = typingByChat.value[activeId.value]
  if (!set) return false
  return [...set].some(uid => uid !== currentUserId.value)
})

async function loadChats() {
  chats.value = await api.chats()
  // seed unread from the REST snapshot
  for (const c of chats.value) unread.value = { ...unread.value, [c.id]: c.unread }
}

async function openChat(id) {
  activeId.value = id
  router.replace(`/c/${id}`)
  joinChat(id)
  messages.value = await api.history(id)
  markRead(id)
  unread.value = { ...unread.value, [id]: 0 }
  await scrollToBottom()
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

// Start (or reopen) a DM with a profile. The backend dedupes on the member pair,
// so picking someone you already have a chat with just reopens it.
async function startChat(p) {
  if (creating.value) return
  creating.value = true
  try {
    const { id } = await api.createChat({ kind: 'dm', members: [String(p._id)] })
    showNewChat.value = false
    await loadChats()
    await openChat(id)
  } finally {
    creating.value = false
  }
}

// ── Chat context menu + group management ────────────────────────────────────
const ctxMenu = ref({ open: false, x: 0, y: 0, chat: null })
function openMenu(chat, { x, y }) {
  ctxMenu.value = { open: true, x, y, chat }
}
function closeMenu() {
  ctxMenu.value = { ...ctxMenu.value, open: false, chat: null }
}

// "Chats" header menu — New chat / New group chat.
const newMenu = ref({ open: false, x: 0, y: 0 })
function openNewMenu({ x, y }) {
  newMenu.value = { open: true, x, y }
}
function closeNewMenu() {
  newMenu.value = { ...newMenu.value, open: false }
}

// Create a group straight from the New-conversation modal's "Group chat" tab.
async function createGroupFromModal({ title, memberIds }) {
  if (!memberIds?.length) return
  const { id } = await api.createChat({ kind: 'group', title, members: memberIds })
  showNewChat.value = false
  await loadChats()
  await openChat(id)
}

const profileName = id => profileMap.value[id]?.name || 'someone'
// Resolve a chat's member ids to profile objects, optionally excluding one id.
function memberProfiles(chat, excludeId) {
  return (chat?.members || [])
    .filter(id => id !== excludeId)
    .map(id => profileMap.value[id])
    .filter(Boolean)
}

// "Add people" picker — mode 'create' (group from a DM) vs 'manage' (add to a
// group). Derives its live chat from the list so membership reflects instantly.
const peopleModal = ref({ open: false, chatId: null })
const peopleChat = computed(() => chats.value.find(c => c.id === peopleModal.value.chatId) || null)
const peopleMode = computed(() => (peopleChat.value?.kind === 'group' ? 'manage' : 'create'))
const peopleTitle = computed(() => (peopleMode.value === 'create' ? 'New group' : 'Add people'))
function openAddPeople(chat) {
  closeMenu()
  peopleModal.value = { open: true, chatId: chat.id }
}
function closePeople() {
  peopleModal.value = { open: false, chatId: null }
}
async function submitPeople(pickedIds) {
  const chat = peopleChat.value
  if (!chat || !pickedIds.length) return
  if (chat.kind === 'group') {
    await api.addMembers(chat.id, pickedIds)
    closePeople()
  } else {
    // DM → start a fresh group seeded with both DM members + the picked people.
    const members = [...new Set([...chat.members, ...pickedIds])].filter(id => id !== currentUserId.value)
    const { id } = await api.createChat({ kind: 'group', members })
    closePeople()
    await loadChats()
    await openChat(id)
  }
}

// Group details hub (admin only): rename, add, remove, transfer admin. Bound to
// the live chat so edits reflect immediately as the registry broadcasts back.
const detailsModal = ref({ open: false, chatId: null })
const detailsChat = computed(() => chats.value.find(c => c.id === detailsModal.value.chatId) || null)
function openDetails(chat) {
  closeMenu()
  detailsModal.value = { open: true, chatId: chat.id }
}
function closeDetails() {
  detailsModal.value = { open: false, chatId: null }
}
async function detailsRename(title) {
  if (detailsChat.value && title) await api.renameChat(detailsChat.value.id, title)
}
async function detailsAdd(ids) {
  if (detailsChat.value && ids?.length) await api.addMembers(detailsChat.value.id, ids)
}
async function detailsRemove(memberId) {
  if (detailsChat.value) await api.removeMember(detailsChat.value.id, memberId)
}
async function detailsTransfer(memberId) {
  if (detailsChat.value) await api.transferOwner(detailsChat.value.id, memberId, profileName(memberId))
}

// Leave a group (any member, anytime — removes only yourself).
const leaveModal = ref({ open: false, chat: null })
function openLeave(chat) {
  closeMenu()
  leaveModal.value = { open: true, chat }
}
// Successor candidates when I own the group (everyone but me).
const leaveOtherMembers = computed(() => memberProfiles(leaveModal.value.chat, currentUserId.value))
// I own the group and there's more than one possible successor → let me pick.
const leaveNeedsOwner = computed(() => {
  const chat = leaveModal.value.chat
  return !!chat && chat.createdBy === currentUserId.value && leaveOtherMembers.value.length >= 2
})
async function confirmLeave(ownerId = null) {
  const chat = leaveModal.value.chat
  leaveModal.value = { open: false, chat: null }
  // The server broadcasts chat:removed back to me → onChatRemoved cleans up.
  if (chat) await api.leaveGroup(chat.id, ownerId, ownerId ? profileName(ownerId) : null)
}

// Delete a chat (for everyone).
const deleteModal = ref({ open: false, chat: null })
function openDelete(chat) {
  closeMenu()
  deleteModal.value = { open: true, chat }
}
async function confirmDelete() {
  const chat = deleteModal.value.chat
  deleteModal.value = { open: false, chat: null }
  if (chat) await api.deleteChat(chat.id)
}

// Outgoing text (and any app-typed message routed through here).
async function handleSend(message) {
  if (!activeId.value) return
  await send(activeId.value, message)
  // The server fan-out (message:new) delivers our own message back, so we don't
  // optimistically append here — keeps a single source of truth.
}

// ── Cross-app share sources ────────────────────────────────────────────────
// Each composer action maps to a real source: how to load the user's items from
// that app's API, and how to turn a picked item into the app-typed message Echo
// sends. Echo core stays app-agnostic — this is the host wiring the actions the
// registry surfaced to concrete data.
function prettySize(b) {
  b = Number(b || 0)
  if (!b) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(b < 10 && i ? 1 : 0)} ${u[i]}`
}
// Consecutive-day streak ending today (or yesterday if today isn't done yet).
function goalStreak(dates) {
  if (!dates?.length) return 0
  const set = new Set(dates)
  const iso = d => d.toISOString().slice(0, 10)
  const d = new Date()
  if (!set.has(iso(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (set.has(iso(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
const todayIso = () => new Date().toISOString().slice(0, 10)

// Orbit uses a dedicated drive-tree picker (below); Goals/Watchlist use the
// generic list/grid picker.
const SHARE_SOURCES = {
  'goal-calendar:share_goal': {
    title: 'Share a goal',
    layout: 'list',
    fetch: () => fetch('/api/goals', { credentials: 'include' }).then(r => r.json()),
    map: g => {
      const done = (g.completedDates || []).includes(todayIso())
      return {
        key: g._id,
        title: g.name,
        subtitle: done ? 'Completed today' : 'In progress',
        dot: g.color,
        message: { type: 'goal.update', payload: {
          goalId: g._id, name: g.name, color: g.color,
          status: done ? 'completed' : 'active', streak: goalStreak(g.completedDates), date: todayIso(),
          repeat: g.repeat, customInterval: g.customInterval, customUnit: g.customUnit, startDate: g.startDate,
        } },
      }
    },
  },
  'watchlist:share_watchlist': {
    title: 'Share from Watchlist',
    layout: 'grid',
    fetch: () => fetch('/api/watchlist', { credentials: 'include' }).then(r => r.json()),
    map: i => ({
      key: i._id,
      title: i.title,
      subtitle: [i.type === 'show' ? 'Show' : 'Movie', i.status].filter(Boolean).join(' · '),
      thumb: i.posterUrl,
      message: { type: 'watchlist.item', payload: { itemId: i._id, title: i.title, type: i.type, status: i.status, posterUrl: i.posterUrl, year: i.year, rating: i.rating, tmdbRating: i.tmdbRating } },
    }),
  },
}

const sharePicker = ref({ open: false, title: '', items: [], loading: false, layout: 'list' })
const fileTreeOpen = ref(false)

async function handleAction(action) {
  if (!activeId.value) return
  // Orbit → full drive tree picker.
  if (action.app === 'orbit' && action.id === 'upload_file') {
    fileTreeOpen.value = true
    return
  }
  const source = SHARE_SOURCES[`${action.app}:${action.id}`]
  if (!source) return
  sharePicker.value = { open: true, title: source.title, items: [], loading: true, layout: source.layout || 'list' }
  try {
    const raw = await source.fetch()
    sharePicker.value.items = (Array.isArray(raw) ? raw : []).map(source.map)
  } catch {
    sharePicker.value.items = []
  } finally {
    sharePicker.value.loading = false
  }
}

async function pickShare(item) {
  sharePicker.value.open = false
  await send(activeId.value, item.message)
}

async function pickFile(file) {
  fileTreeOpen.value = false
  await send(activeId.value, {
    type: 'orbit.file',
    payload: { fileId: file.id, name: file.name, mimeType: file.mimeType, size: file.size, url: file.url },
  })
}

let typingTimer = null
function onTyping() {
  if (!activeId.value) return
  startTyping(activeId.value)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => stopTyping(activeId.value), 1500)
}

// Live incoming messages.
onMessage(msg => {
  if (msg.chatId === activeId.value) {
    messages.value = [...messages.value, msg]
    markRead(activeId.value)
    scrollToBottom()
  }
  const c = chats.value.find(x => x.id === msg.chatId)
  if (c) {
    c.lastMessagePreview =
      msg.type === 'text' || msg.type === 'system' ? msg.payload.text : `[${msg.type}]`
    c.lastMessageAt = msg.createdAt
  }
})

// A chat I'm in was created / renamed / had its membership change.
onChatUpsert(chat => {
  const existing = chats.value.find(c => c.id === chat.id)
  if (existing) {
    // The upsert carries unread:0 — keep our locally-tracked count.
    Object.assign(existing, chat, { unread: existing.unread })
  } else {
    chats.value = [{ ...chat }, ...chats.value]
    joinChat(chat.id) // start receiving its realtime messages
  }
})

// A chat was deleted, or I was removed from it.
onChatRemoved(chatId => {
  leaveChat(chatId)
  chats.value = chats.value.filter(c => c.id !== chatId)
  if (peopleModal.value.chatId === chatId) closePeople()
  if (detailsModal.value.chatId === chatId) closeDetails()
  if (ctxMenu.value.chat?.id === chatId) closeMenu()
  if (activeId.value === chatId) {
    activeId.value = null
    messages.value = []
    router.replace('/')
  }
})

watch(() => route.params.chatId, id => { if (id && id !== activeId.value) openChat(id) })

onMounted(async () => {
  await Promise.all([
    loadRegistry(),
    loadChats(),
    api.profiles().then(p => { profiles.value = p }).catch(() => {}),
  ])
  const first = route.params.chatId || chats.value[0]?.id
  if (first) openChat(first)
})
</script>

<template>
  <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

  <AppHeader>
    <template #left>
      <button
        class="cursor-pointer flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
        aria-label="Open navigation"
        @click="sidebarOpen = true"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </template>
    <span class="font-semibold text-slate-900 dark:text-white">Echo</span>
    <template #right>
      <span class="text-xs" :class="connected ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-white/40'">
        {{ connected ? '● live' : '○ offline' }}
      </span>
    </template>
  </AppHeader>

  <main class="mx-auto flex h-[calc(100vh-64px)] max-w-6xl gap-3 px-4 pb-4 pt-2 md:px-6">
    <!-- Chat list -->
    <aside
      class="hidden w-64 shrink-0 flex-col overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/70 p-2 backdrop-blur-md md:flex dark:border-white/10 dark:bg-white/5"
      @contextmenu.prevent="openNewMenu({ x: $event.clientX, y: $event.clientY })"
    >
      <div class="mb-1 flex items-center justify-between px-2 py-1">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">Chats</span>
        <button
          class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          title="New conversation"
          aria-label="New conversation"
          @click="openNewChat('dm')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
      <ChatRow
        v-for="c in dmChats"
        :key="c.id"
        :active="c.id === activeId"
        :title="displayTitle(c)"
        :preview="c.lastMessagePreview"
        :avatar-name="chatAvatar(c).name"
        :avatar-color="chatAvatar(c).color"
        :avatar-emoji="chatAvatar(c).emoji"
        :unread="unread[c.id] || 0"
        @open="openChat(c.id)"
        @menu="openMenu(c, $event)"
      />
      <button
          v-if="!chats.length"
          class="cursor-pointer mx-2 mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500 transition-colors hover:bg-black/5 dark:border-white/15 dark:text-white/45 dark:hover:bg-white/5"
          @click="showNewChat = true"
      >
        No chats yet — start one
      </button>

      <!-- Groupchats -->
      <div class="mt-3 border-t border-slate-200/70 pt-2 dark:border-white/10">
        <div class="mb-1 px-2 py-1">
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">Groupchats</span>
        </div>
      </div>
      <ChatRow
        v-for="c in groupChats"
        :key="c.id"
        :active="c.id === activeId"
        :title="displayTitle(c)"
        :preview="c.lastMessagePreview"
        :avatar-name="chatAvatar(c).name"
        :avatar-color="chatAvatar(c).color"
        :avatar-emoji="chatAvatar(c).emoji"
        :unread="unread[c.id] || 0"
        @open="openChat(c.id)"
        @menu="openMenu(c, $event)"
      />
      <button
          v-if="!groupChats.length"
          class="cursor-pointer mx-2 mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500 transition-colors hover:bg-black/5 dark:border-white/15 dark:text-white/45 dark:hover:bg-white/5"
          @click="openNewChat('group')"
      >
        No groups yet — create one
      </button>

    </aside>

    <!-- Conversation -->
    <section class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
      <header v-if="activeChat" class="flex items-center gap-2.5 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
        <AvatarCircle
          class="shrink-0"
          :name="chatAvatar(activeChat).name"
          :color="chatAvatar(activeChat).color"
          :emoji="chatAvatar(activeChat).emoji"
          :size="32"
        />
        <div class="min-w-0">
          <p class="truncate font-medium text-slate-900 dark:text-white">{{ displayTitle(activeChat) }}</p>
          <p v-if="activeChat.kind === 'group'" class="text-xs text-slate-400 dark:text-white/40">
            {{ activeChat.members.length }} members
          </p>
        </div>
      </header>

      <div ref="scroller" class="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        <EchoMessageBubble
          v-for="m in messages"
          :key="m.id"
          :message="m"
          :registry="registry"
          :current-user-id="currentUserId"
          :sender="m.senderId ? profileMap[m.senderId] : null"
        />
        <p v-if="activeId && !messages.length" class="m-auto text-sm text-slate-400 dark:text-white/40">
          No messages yet — say hello 👋
        </p>
        <p v-if="!activeId" class="m-auto text-sm text-slate-400 dark:text-white/40">Select a chat to start</p>
      </div>

      <div v-if="typingHere" class="px-4 pb-1 text-xs italic text-slate-400 dark:text-white/40">Someone is typing…</div>

      <EchoComposer
        v-if="activeId"
        :actions="composerActions"
        @send="handleSend"
        @action="handleAction"
        @typing="onTyping"
      />
    </section>
  </main>

  <!-- New conversation: Chat / Group chat tabs -->
  <NewChatModal
    :show="showNewChat"
    :profiles="profiles"
    :current-user-id="currentUserId"
    :initial-tab="newChatTab"
    @start-dm="startChat"
    @create-group="createGroupFromModal"
    @close="showNewChat = false"
  />

  <!-- Share picker: items from the originating app (Orbit / Goals / Watchlist) -->
  <SharePickerModal
    :show="sharePicker.open"
    :title="sharePicker.title"
    :items="sharePicker.items"
    :loading="sharePicker.loading"
    :layout="sharePicker.layout"
    @select="pickShare"
    @close="sharePicker.open = false"
  />

  <!-- Orbit drive tree (file sharing) -->
  <FileTreePickerModal :show="fileTreeOpen" @select="pickFile" @close="fileTreeOpen = false" />

  <!-- "Chats" header menu: New chat / New group chat -->
  <Teleport to="body">
    <div v-if="newMenu.open" class="fixed inset-0 z-[150]" @pointerdown="closeNewMenu" @contextmenu.prevent="closeNewMenu">
      <div
        class="absolute min-w-44 overflow-hidden rounded-xl border border-white/50 bg-white/80 py-1 text-sm shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/90"
        :style="{ left: `${newMenu.x}px`, top: `${newMenu.y}px` }"
        @pointerdown.stop
      >
        <button
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openNewChat('dm')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>
          New chat
        </button>
        <button
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openNewChat('group')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          New group chat
        </button>
      </div>
    </div>
  </Teleport>

  <!-- Chat context menu (right-click or kebab) -->
  <Teleport to="body">
    <div v-if="ctxMenu.open" class="fixed inset-0 z-[150]" @pointerdown="closeMenu" @contextmenu.prevent="closeMenu">
      <div
        class="absolute min-w-44 overflow-hidden rounded-xl border border-white/50 bg-white/80 py-1 text-sm shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/90"
        :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
        @pointerdown.stop
      >
        <button
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openAddPeople(ctxMenu.chat)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
          Add people
        </button>
        <button
          v-if="ctxMenu.chat && ctxMenu.chat.kind === 'group' && canManageGroup(ctxMenu.chat)"
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openDetails(ctxMenu.chat)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
          Group details
        </button>
        <button
          v-if="ctxMenu.chat && ctxMenu.chat.kind === 'group'"
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openLeave(ctxMenu.chat)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
          Leave group
        </button>
        <button
          v-if="ctxMenu.chat && (ctxMenu.chat.kind !== 'group' || canManageGroup(ctxMenu.chat))"
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          @click="openDelete(ctxMenu.chat)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete
        </button>
      </div>
    </div>
  </Teleport>

  <!-- Add people (quick action — also creates a group from a DM) -->
  <PeopleModal
    :show="peopleModal.open"
    :title="peopleTitle"
    :mode="peopleMode"
    :profiles="profiles"
    :current-user-id="currentUserId"
    :exclude-ids="peopleChat?.members || []"
    :submit-label="peopleMode === 'create' ? 'Create group' : 'Add'"
    @submit="submitPeople"
    @close="closePeople"
  />

  <!-- Group details (admin): rename, members, transfer admin, add people -->
  <GroupDetailsModal
    :show="detailsModal.open"
    :chat="detailsChat"
    :profiles="profiles"
    :current-user-id="currentUserId"
    @rename="detailsRename"
    @transfer="detailsTransfer"
    @remove="detailsRemove"
    @add="detailsAdd"
    @close="closeDetails"
  />

  <!-- Leave group confirmation (owners pick a successor first) -->
  <TemplateModal
    v-if="!leaveNeedsOwner"
    :show="leaveModal.open"
    title="Leave group?"
    message="You'll stop receiving its messages. An admin can add you back later."
    confirm-label="Leave"
    @confirm="confirmLeave"
    @cancel="leaveModal.open = false"
  />
  <MemberPickerModal
    v-else
    :show="leaveModal.open"
    title="Leave group?"
    message="You're the group admin — choose who takes over before you leave."
    :members="leaveOtherMembers"
    confirm-label="Transfer & leave"
    danger
    @confirm="confirmLeave"
    @close="leaveModal.open = false"
  />

  <!-- Delete confirmation -->
  <TemplateModal
    :show="deleteModal.open"
    :title="deleteModal.chat?.kind === 'group' ? 'Delete group?' : 'Delete chat?'"
    :message="deleteModal.chat?.kind === 'group'
      ? 'This permanently deletes the group and its messages for everyone.'
      : 'This permanently deletes the conversation and its messages for everyone.'"
    confirm-label="Delete"
    @confirm="confirmDelete"
    @cancel="deleteModal.open = false"
  />
</template>
