import mongoose from 'mongoose'

// The canonical message record. `type` is either a built-in ("text", "system")
// or an app-defined type discovered from a manifest (e.g. "orbit.file"). The
// renderer for a given type is resolved on the frontend via the unified Echo
// registry — the server only stores type + opaque payload, never UI.
const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'EchoChat', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },
    // null senderId === system message (joins, app automation, etc.)
    type: { type: String, required: true, default: 'text' },
    // Free-form JSON shaped by the message type's contract. For "text" it's
    // { text }; for "orbit.file" it's { fileId, name, size, url, ... }.
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    // The app that produced an app-typed message ("orbit", "goal-calendar"), or
    // null for built-in types. Lets the client attribute & theme embeds.
    sourceApp: { type: String, default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

messageSchema.index({ chatId: 1, createdAt: -1 })

export default mongoose.model('EchoMessage', messageSchema)
