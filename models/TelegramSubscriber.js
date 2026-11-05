const mongoose = require('mongoose');

const telegramSubscriberSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TelegramSubscriber', telegramSubscriberSchema);