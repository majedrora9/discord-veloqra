const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true, trim: true },       // أيدي المستخدم في ديسكورد
    serverId: { type: String, required: true, trim: true },     // أيدي السيرفر المطلوب
    plan: { type: String, required: true },                     // Basic أو Ultra
    price: { type: String, required: true },                    // $2.99 أو $5.99
    status: { type: String, default: 'pending' },               // pending (معلق), approved, rejected
    paymentMethod: { type: String, default: 'Velo Coin' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);