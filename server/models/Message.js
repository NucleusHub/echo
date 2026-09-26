import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'EchoChat', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },
    // null senderId = system message
    type: { type: String, required: true, default: 'text' },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    sourceApp: { type: String, default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

messageSchema.index({ chatId: 1, createdAt: -1 })

export default mongoose.model('EchoMessage', messageSchema)
