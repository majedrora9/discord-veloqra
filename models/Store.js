const mongoose = require('mongoose');

const StoreItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'general' },
  type: { type: String, enum: ['single', 'multi'], default: 'single' },
  quantity: { type: Number, default: 1 },
  isPinned: { type: Boolean, default: false },
  images: [{ type: String }],
  requireLogin: { type: Boolean, default: false },
  requirePhoneNumber: { type: Boolean, default: false },
  seller: {
    discordId: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, default: '/logo.png' }
  },
  singlePricing: {
    allowedCurrencies: [{
      currency: { type: String },
      price: { type: Number }
    }]
  },
  subItems: [{
    title: { type: String, required: true },
    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    allowedCurrencies: [{
      currency: { type: String },
      price: { type: Number }
    }],
    isSold: { type: Boolean, default: false }
  }],
  status: { type: String, enum: ['active', 'sold', 'hidden'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const StoreOrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  buyer: {
    discordId: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, default: '/logo.png' }
  },
  seller: {
    discordId: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, default: '/logo.png' }
  },
  useMiddleman: { type: Boolean, default: false },
  middlemanPaymentMethod: { type: String, default: null },
  middlemanFee: { type: Number, default: 0 },
  items: [{
    parentItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem' },
    subItemId: { type: String },
    title: { type: String },
    currency: { type: String },
    basePrice: { type: Number },
    finalPrice: { type: Number },
    qty: { type: Number, default: 1 }
  }],
  currencyTotals: { type: Map, of: Number },
  status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const StoreItem = mongoose.models.StoreItem || mongoose.model('StoreItem', StoreItemSchema);
const StoreOrder = mongoose.models.StoreOrder || mongoose.model('StoreOrder', StoreOrderSchema);

module.exports = { StoreItem, StoreOrder };