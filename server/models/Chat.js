import mongoose from 'mongoose'

const chatSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['dm', 'group'], default: 'dm' },
    title: { type: String, default: '' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Profile', index: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
  },
  { timestamps: true }
)

chatSchema.index({ members: 1, lastMessageAt: -1 })

export default mongoose.model('EchoChat', chatSchema)
