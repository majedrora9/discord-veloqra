const mongoose = require('mongoose');

const BadgeSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    icon: { type: String, default: 'military_tech' },
    color: { type: String, default: '#3b82f6' }, // 👈 كود اللون (مثل #ef4444 أو #10b981)
    badgeClass: { type: String, default: '' },
    description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Badge', BadgeSchema);