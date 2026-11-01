const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    pin: { type: String, required: true },
    avatar: { type: String, default: '/logo.png' },
    role: { type: String, default: 'مشرف' },
    about: { type: String, default: '' }, // النبذة التعريفية
    discordTag: { type: String, default: '' }, // مثل @captin
    permissions: {
        canManageProjects: { type: Boolean, default: true },
        canManagePremium: { type: Boolean, default: true }
    }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);