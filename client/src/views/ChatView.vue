<script setup>
import { ref, computed, watch, nextTick, onMounted, markRaw, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '@core/AppSidebar.vue'
import AppHeader from '@core/AppHeader.vue'
import TemplateModal from '@core/TemplateModal.vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'
import SharePickerModal from '@/components/SharePickerModal.vue'
import ChatRow from '@/components/ChatRow.vue'
import PeopleModal from '@/components/PeopleModal.vue'
import NewChatModal from '@/components/NewChatModal.vue'
import MemberPickerModal from '@/components/MemberPickerModal.vue'
import GroupDetailsModal from '@/components/GroupDetailsModal.vue'
import EchoMessageBubble from '@core/echo/EchoMessageBubble.vue'
import EchoComposer from '@core/echo/EchoComposer.vue'
import { useAuth, avatarUrl } from '@core/auth/useAuth.js'
import { useI18n } from '@core/useI18n.js'
import { api } from '@/api/echo.js'
import { useEchoRegistry } from '@/composables/useEchoRegistry.js'
import { useEchoSocket } from '@/composables/useEchoSocket.js'
import { COMPOSER_HANDLERS, RENDERERS_BY_TYPE } from '@/echo-integrations.js'
import { Icon } from '@core/icons'
import MessageSquareIcon from '@/assets/icons/message-square.svg?component'
import UsersIcon from '@/assets/icons/users.svg?component'
import UserPlusIcon from '@/assets/icons/user-plus.svg?component'
import InfoIcon from '@/assets/icons/info.svg?component'
import LogOutIcon from '@/assets/icons/log-out.svg?component'
import TrashIcon from '@/assets/icons/trash.svg?component'

provide('echoRenderers', RENDERERS_BY_TYPE)

const route = useRoute()
const router = useRouter()
const { profile } = useAuth()
const { t } = useI18n()
const currentUserId = computed(() => (profile.value?._id ? String(profile.value._id) : null))

const { registry, load: loadRegistry, composerActions } = useEchoRegistry()
const {
  typingByChat, unread, connected,
  send, onMessage, onChatUpsert, onChatRemoved,
  markRead, startTyping, stopTyping, joinChat, leaveChat,
} = useEchoSocket()

const sidebarOpen = ref(false)
const chatListOpen = ref(false)
const chats = ref([])
const messages = ref([])
const activeId = ref(route.params.chatId || null)
const scroller = ref(null)

const pendingHighlight = ref(null)
const highlightId = ref(null)

const profiles = ref([])
const creating = ref(false)
const profileMap = computed(() => Object.fromEntries(profiles.value.map(p => [String(p._id), p])))

const showNewChat = ref(false)
const newChatTab = ref('dm')
function openNewChat(tab) {
  newChatTab.value = tab
  newMenu.value = { ...newMenu.value, open: false }
  showNewChat.value = true
}

const dmChats = computed(() => chats.value.filter(c => c.kind !== 'group'))
const groupChats = computed(() => chats.value.filter(c => c.kind === 'group'))

function otherMemberId(chat) {
  return chat.members.find(m => m !== currentUserId.value) || chat.members[0]
}
function groupAutoName(chat) {
  const names = chat.members
    .filter(id => id !== currentUserId.value)
    .map(id => profileMap.value[id]?.name)
    .filter(Boolean)
  return names.length ? names.join(', ') : t('echo.group.fallback')
}
function displayTitle(chat) {
  if (!chat) return ''
  if (chat.kind === 'group') return chat.title || groupAutoName(chat)
  return profileMap.value[otherMemberId(chat)]?.name || t('echo.dm.fallback')
}
function canManageGroup(chat) {
  if (!chat || chat.kind !== 'group') return false
  return profile.value?.role === 'admin' || chat.createdBy === currentUserId.value
}
function chatAvatar(chat) {
  if (chat.kind === 'group') return { name: displayTitle(chat), color: '#6366f1', emoji: null, image: null }
  const p = profileMap.value[otherMemberId(chat)]
  return { name: p?.name || displayTitle(chat), color: p?.color || '#64748b', emoji: p?.emoji || null, image: avatarUrl(p) }
}

const activeChat = computed(() => chats.value.find(c => c.id === activeId.value) || null)

const GROUP_GAP_MS = 10 * 60 * 1000
function endsGroup(i) {
  const m = messages.value[i]
  const next = messages.value[i + 1]
  if (!next) return true
  if (next.senderId !== m.senderId) return true
  return new Date(next.createdAt) - new Date(m.createdAt) > GROUP_GAP_MS
}
function startsGroup(i) {
  const m = messages.value[i]
  const prev = messages.value[i - 1]
  if (!prev) return true
  if (prev.senderId !== m.senderId) return true
  return new Date(m.createdAt) - new Date(prev.createdAt) > GROUP_GAP_MS
}

const typingHere = computed(() => {
  const set = typingByChat.value[activeId.value]
  if (!set) return false
  return [...set].some(uid => uid !== currentUserId.value)
})

async function loadChats() {
  chats.value = await api.chats()
  for (const c of chats.value) unread.value = { ...unread.value, [c.id]: c.unread }
}

async function openChat(id) {
  activeId.value = id
  chatListOpen.value = false
  router.replace(`/c/${id}`)
  joinChat(id)
  messages.value = await api.history(id)
  markRead(id)
  unread.value = { ...unread.value, [id]: 0 }
  const target = pendingHighlight.value
  pendingHighlight.value = null
  if (target && messages.value.some(m => m.id === target)) await focusMessage(target)
  else await scrollToBottom()
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

async function focusMessage(id) {
  await nextTick()
  const el = document.getElementById(`echo-msg-${id}`)
  if (!el) { await scrollToBottom(); return }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightId.value = id
  setTimeout(() => { if (highlightId.value === id) highlightId.value = null }, 2600)
}

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

const ctxMenu = ref({ open: false, x: 0, y: 0, chat: null })
function clampMenu(x, y, w = 190, h = 230) {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
  }
}
function openMenu(chat, { x, y }) {
  ctxMenu.value = { open: true, ...clampMenu(x, y), chat }
}
function closeMenu() {
  ctxMenu.value = { ...ctxMenu.value, open: false, chat: null }
}

const newMenu = ref({ open: false, x: 0, y: 0 })
function openNewMenu({ x, y }) {
  newMenu.value = { open: true, x, y }
}
function closeNewMenu() {
  newMenu.value = { ...newMenu.value, open: false }
}

async function createGroupFromModal({ title, memberIds }) {
  if (!memberIds?.length) return
  const { id } = await api.createChat({ kind: 'group', title, members: memberIds })
  showNewChat.value = false
  await loadChats()
  await openChat(id)
}

const profileName = id => profileMap.value[id]?.name || t('echo.someone')
function memberProfiles(chat, excludeId) {
  return (chat?.members || [])
    .filter(id => id !== excludeId)
    .map(id => profileMap.value[id])
    .filter(Boolean)
}

const peopleModal = ref({ open: false, chatId: null })
const peopleChat = computed(() => chats.value.find(c => c.id === peopleModal.value.chatId) || null)
const peopleMode = computed(() => (peopleChat.value?.kind === 'group' ? 'manage' : 'create'))
const peopleTitle = computed(() => (peopleMode.value === 'create' ? t('echo.people.newGroup') : t('echo.people.addPeople')))
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
    const members = [...new Set([...chat.members, ...pickedIds])].filter(id => id !== currentUserId.value)
    const { id } = await api.createChat({ kind: 'group', members })
    closePeople()
    await loadChats()
    await openChat(id)
  }
}

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
  if (!detailsChat.value) return
  await api.transferOwner(detailsChat.value.id, memberId, profileName(memberId))
  if (profile.value?.role !== 'admin') closeDetails()
}

const leaveModal = ref({ open: false, chat: null })
function openLeave(chat) {
  closeMenu()
  leaveModal.value = { open: true, chat }
}
const leaveOtherMembers = computed(() => memberProfiles(leaveModal.value.chat, currentUserId.value))
const leaveNeedsOwner = computed(() => {
  const chat = leaveModal.value.chat
  return !!chat && chat.createdBy === currentUserId.value && leaveOtherMembers.value.length >= 2
})
async function confirmLeave(ownerId = null) {
  const chat = leaveModal.value.chat
  leaveModal.value = { open: false, chat: null }
  if (chat) await api.leaveGroup(chat.id, ownerId, ownerId ? profileName(ownerId) : null)
}

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

async function handleSend(message) {
  if (!activeId.value) return
  await send(activeId.value, message)
  // The server fan-out echoes our own message back, so no optimistic append.
}

const sharePicker = ref({ open: false, title: '', items: [], loading: false, layout: 'list' })
const customPicker = ref({ open: false, component: null, toMessage: null })

function closeCustomPicker() {
  customPicker.value = { open: false, component: null, toMessage: null }
}

async function handleAction(action) {
  if (!activeId.value) return
  const def = COMPOSER_HANDLERS[`${action.app}:${action.id}`]
  if (!def) return

  if (def.picker) {
    customPicker.value = { open: true, component: markRaw(def.picker), toMessage: def.toMessage }
    return
  }

  if (def.source) {
    sharePicker.value = { open: true, title: def.source.title, items: [], loading: true, layout: def.source.layout || 'list' }
    try {
      const raw = await def.source.fetch()
      sharePicker.value.items = (Array.isArray(raw) ? raw : []).map(def.source.map)
    } catch {
      sharePicker.value.items = []
    } finally {
      sharePicker.value.loading = false
    }
  }
}

async function pickShare(item) {
  sharePicker.value.open = false
  await send(activeId.value, item.message)
}

async function pickCustom(selection) {
  const toMessage = customPicker.value.toMessage
  closeCustomPicker()
  const message = toMessage?.(selection)
  if (message) await send(activeId.value, message)
}

let typingTimer = null
function onTyping() {
  if (!activeId.value) return
  startTyping(activeId.value)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => stopTyping(activeId.value), 1500)
}

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

onChatUpsert(chat => {
  const existing = chats.value.find(c => c.id === chat.id)
  if (existing) {
    // The upsert carries unread:0; keep the locally tracked count.
    Object.assign(existing, chat, { unread: existing.unread })
  } else {
    chats.value = [{ ...chat }, ...chats.value]
    joinChat(chat.id)
  }
})

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
  // Capture before openChat() strips the query.
  pendingHighlight.value = route.query.msg ? String(route.query.msg) : null
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
        :aria-label="t('echo.nav.open')"
        @click="sidebarOpen = true"
      >
        <Icon width="20" height="20" name="menu" :sw="1.75" />
      </button>
    </template>
    <span class="font-semibold text-slate-900 dark:text-white">Echo</span>
    <template #right>
      <span class="text-xs" :class="connected ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-white/40'">
        {{ connected ? t('echo.status.live') : t('echo.status.offline') }}
      </span>
    </template>
  </AppHeader>

  <main class="mx-auto h-[calc(100dvh-64px)] max-w-6xl px-3 pb-4 pt-2 md:px-6">
   <div class="flex h-full min-h-0 w-full overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_50px_-24px_rgba(15,23,42,0.28)] md:backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035] dark:shadow-[0_18px_50px_-24px_rgba(0,0,0,0.7)]">
    <div
      v-if="chatListOpen"
      class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
      @click="chatListOpen = false"
    />
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col overflow-y-auto border-r border-slate-200/70 bg-white/95 p-2.5 backdrop-blur-xl transition-transform duration-200 md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 md:bg-transparent md:backdrop-blur-none dark:border-white/10 dark:bg-slate-900/95 md:dark:bg-transparent"
      :class="chatListOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
      @contextmenu.prevent="openNewMenu({ x: $event.clientX, y: $event.clientY })"
    >
      <div class="mb-1 mt-0.5 flex items-center justify-between px-2 py-1">
        <span class="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">{{ t('echo.section.chats') }}</span>
        <button
          class="nuc-press flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          :title="t('echo.newConversation')"
          :aria-label="t('echo.newConversation')"
          @click="openNewChat('dm')"
        >
          <Icon width="18" height="18" name="plus" />
        </button>
      </div>
      <ChatRow
        v-for="c in dmChats"
        :key="c.id"
        :active="c.id === activeId"
        :title="displayTitle(c)"
        :preview="c.lastMessagePreview"
        :timestamp="c.lastMessageAt"
        :avatar-name="chatAvatar(c).name"
        :avatar-color="chatAvatar(c).color"
        :avatar-emoji="chatAvatar(c).emoji"
        :avatar-image="chatAvatar(c).image"
        :unread="unread[c.id] || 0"
        @open="openChat(c.id)"
        @menu="openMenu(c, $event)"
      />
      <button
          v-if="!chats.length"
          class="mx-1 mt-1 cursor-pointer rounded-xl px-3 py-3 text-center text-xs text-slate-500 transition-colors hover:bg-slate-900/[0.035] dark:text-white/45 dark:hover:bg-white/5"
          @click="showNewChat = true"
      >
        {{ t('echo.empty.noChats') }}
      </button>

      <div class="mb-1 mt-4 px-2 py-1">
        <span class="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">{{ t('echo.section.groupchats') }}</span>
      </div>
      <ChatRow
        v-for="c in groupChats"
        :key="c.id"
        :active="c.id === activeId"
        :title="displayTitle(c)"
        :preview="c.lastMessagePreview"
        :timestamp="c.lastMessageAt"
        :avatar-name="chatAvatar(c).name"
        :avatar-color="chatAvatar(c).color"
        :avatar-emoji="chatAvatar(c).emoji"
        :avatar-image="chatAvatar(c).image"
        :unread="unread[c.id] || 0"
        @open="openChat(c.id)"
        @menu="openMenu(c, $event)"
      />
      <button
          v-if="!groupChats.length"
          class="mx-1 mt-1 cursor-pointer rounded-xl px-3 py-3 text-center text-xs text-slate-500 transition-colors hover:bg-slate-900/[0.035] dark:text-white/45 dark:hover:bg-white/5"
          @click="openNewChat('group')"
      >
        {{ t('echo.empty.noGroups') }}
      </button>

    </aside>

    <section class="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-white/40 to-transparent dark:from-white/[0.015]">
      <header v-if="activeChat" class="flex items-center gap-3 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
        <button
          class="cursor-pointer -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 md:hidden dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          :aria-label="t('echo.section.chats')"
          @click="chatListOpen = true"
        >
          <Icon width="20" height="20" name="menu" :sw="1.75" />
        </button>
        <AvatarCircle
          class="shrink-0"
          :name="chatAvatar(activeChat).name"
          :color="chatAvatar(activeChat).color"
          :emoji="chatAvatar(activeChat).emoji"
          :image="chatAvatar(activeChat).image"
          :size="32"
        />
        <div class="min-w-0">
          <p class="truncate font-medium text-slate-900 dark:text-white">{{ displayTitle(activeChat) }}</p>
          <p v-if="activeChat.kind === 'group'" class="text-xs text-slate-400 dark:text-white/40">
            {{ t('echo.members.count', { count: activeChat.members.length }) }}
          </p>
        </div>
      </header>
      <div v-else class="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 md:hidden dark:border-white/10">
        <button
          class="cursor-pointer -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          :aria-label="t('echo.section.chats')"
          @click="chatListOpen = true"
        >
          <Icon width="20" height="20" name="menu" :sw="1.75" />
        </button>
        <span class="font-medium text-slate-500 dark:text-white/50">{{ t('echo.section.chats') }}</span>
      </div>

      <div ref="scroller" class="flex flex-1 flex-col gap-0 overflow-y-auto px-4 py-5 md:px-6">
        <TransitionGroup name="msg">
          <EchoMessageBubble
            v-for="(m, i) in messages"
            :key="m.id"
            :message="m"
            :current-user-id="currentUserId"
            :sender="m.senderId ? profileMap[m.senderId] : null"
            :show-time="endsGroup(i)"
            :first-in-group="startsGroup(i)"
            :last-in-group="endsGroup(i)"
            :highlight="m.id === highlightId"
          />
        </TransitionGroup>

        <div v-if="activeId && !messages.length" class="m-auto flex max-w-xs flex-col items-center gap-3 text-center">
          <span class="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-500 dark:text-indigo-300">
            <Icon width="26" height="26" name="chat" :sw="1.6" />
          </span>
          <p class="text-sm font-medium text-slate-500 dark:text-white/50">{{ t('echo.empty.noMessages') }}</p>
        </div>

        <div v-if="!activeId" class="m-auto flex max-w-xs flex-col items-center gap-3 px-6 text-center">
          <span class="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-500 dark:text-indigo-300">
            <Icon width="30" height="30" name="chat" :sw="1.5" />
          </span>
          <p class="text-sm text-slate-400 dark:text-white/40">{{ t('echo.selectChat') }}</p>
        </div>
      </div>

      <div v-if="typingHere" class="px-4 pb-1 text-xs italic text-slate-400 dark:text-white/40">{{ t('echo.typing') }}</div>

      <EchoComposer
        v-if="activeId"
        :actions="composerActions"
        @send="handleSend"
        @action="handleAction"
        @typing="onTyping"
      />
    </section>
   </div>
  </main>

  <NewChatModal
    :show="showNewChat"
    :profiles="profiles"
    :current-user-id="currentUserId"
    :initial-tab="newChatTab"
    @start-dm="startChat"
    @create-group="createGroupFromModal"
    @close="showNewChat = false"
  />

  <SharePickerModal
    :show="sharePicker.open"
    :title="sharePicker.title"
    :items="sharePicker.items"
    :loading="sharePicker.loading"
    :layout="sharePicker.layout"
    @select="pickShare"
    @close="sharePicker.open = false"
  />

  <component
    :is="customPicker.component"
    v-if="customPicker.component"
    :show="customPicker.open"
    @select="pickCustom"
    @close="closeCustomPicker"
  />

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
          <MessageSquareIcon width="16" height="16" />
          {{ t('echo.menu.newChat') }}
        </button>
        <button
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openNewChat('group')"
        >
          <UsersIcon width="16" height="16" />
          {{ t('echo.menu.newGroup') }}
        </button>
      </div>
    </div>
  </Teleport>

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
          <UserPlusIcon width="16" height="16" />
          {{ t('echo.people.addPeople') }}
        </button>
        <button
          v-if="ctxMenu.chat && ctxMenu.chat.kind === 'group' && canManageGroup(ctxMenu.chat)"
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openDetails(ctxMenu.chat)"
        >
          <InfoIcon width="16" height="16" />
          {{ t('echo.menu.groupDetails') }}
        </button>
        <button
          v-if="ctxMenu.chat && ctxMenu.chat.kind === 'group'"
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 transition-colors hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10"
          @click="openLeave(ctxMenu.chat)"
        >
          <LogOutIcon width="16" height="16" />
          {{ t('echo.menu.leaveGroup') }}
        </button>
        <button
          v-if="ctxMenu.chat && (ctxMenu.chat.kind !== 'group' || canManageGroup(ctxMenu.chat))"
          class="cursor-pointer flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          @click="openDelete(ctxMenu.chat)"
        >
          <TrashIcon width="16" height="16" />
          {{ t('core.button.delete') }}
        </button>
      </div>
    </div>
  </Teleport>

  <PeopleModal
    :show="peopleModal.open"
    :title="peopleTitle"
    :mode="peopleMode"
    :profiles="profiles"
    :current-user-id="currentUserId"
    :exclude-ids="peopleChat?.members || []"
    :submit-label="peopleMode === 'create' ? t('echo.people.submitCreate') : t('echo.people.submitAdd')"
    @submit="submitPeople"
    @close="closePeople"
  />

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

  <TemplateModal
    v-if="!leaveNeedsOwner"
    :show="leaveModal.open"
    :title="t('echo.leave.title')"
    :message="t('echo.leave.message')"
    :confirm-label="t('echo.leave.confirm')"
    @confirm="confirmLeave"
    @cancel="leaveModal.open = false"
  />
  <MemberPickerModal
    v-else
    :show="leaveModal.open"
    :title="t('echo.leave.title')"
    :message="t('echo.leave.adminMessage')"
    :members="leaveOtherMembers"
    :confirm-label="t('echo.leave.transferConfirm')"
    danger
    @confirm="confirmLeave"
    @close="leaveModal.open = false"
  />

  <TemplateModal
    :show="deleteModal.open"
    :title="deleteModal.chat?.kind === 'group' ? t('echo.delete.groupTitle') : t('echo.delete.chatTitle')"
    :message="deleteModal.chat?.kind === 'group'
      ? t('echo.delete.groupMessage')
      : t('echo.delete.chatMessage')"
    :confirm-label="t('core.button.delete')"
    @confirm="confirmDelete"
    @cancel="deleteModal.open = false"
  />
</template>

<style scoped>
.msg-enter-active { transition: opacity 0.26s ease, transform 0.26s cubic-bezier(0.22, 1, 0.36, 1); }
.msg-leave-active { transition: opacity 0.16s ease; }
.msg-enter-from { opacity: 0; transform: translateY(8px); }
.msg-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .msg-enter-active, .msg-leave-active { transition: opacity 0.12s ease; }
  .msg-enter-from { transform: none; }
}
</style>
