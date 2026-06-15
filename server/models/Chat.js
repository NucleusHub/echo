import mongoose from 'mongoose'

// A chat is a conversation between N profiles. `kind` distinguishes a 1:1 DM
// from a named group. Membership drives room access (realtime/socket.js) and
// unread fan-out (services/messageService.js).
const chatSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['dm', 'group'], default: 'dm' },
    title: { type: String, default: '' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Profile', index: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
    // Denormalised pointer to the most recent message for cheap chat-list sorting.
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
  },
  { timestamps: true }
)

chatSchema.index({ members: 1, lastMessageAt: -1 })

export default mongoose.model('EchoChat', chatSchema)
