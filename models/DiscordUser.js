const mongoose = require('mongoose');

const widgetSchema = new mongoose.Schema({
    type: { 
        type: String, 
        enum: ['text', 'icon_text', 'audio', 'button', 'image', 'images_row', 'discord_presence', 'video', 'discord_server'], 
        default: 'text' 
    },
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    icon: { type: String, default: '' },
    url: { type: String, default: '' },
    color: { type: String, default: '' },
    fontFamily: { type: String, default: '' },
    items: [{ type: String }]
}, { _id: true });

const sectionSchema = new mongoose.Schema({
    title: { type: String, default: 'قسم جديد' },
    icon: { type: String, default: 'folder' },
    bgMode: { type: String, enum: ['card', 'transparent'], default: 'card' },
    widgets: [widgetSchema]
}, { _id: true });

const discordUserSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    globalName: { type: String, default: '' },
    avatar: { type: String, default: '/logo.png' },
    badges: { type: [String], default: [] },
    displayedBadges: { type: [String], default: [] },
    about: { type: String, default: '' },
    lastLogin: { type: Date, default: Date.now },
    customSlug: { type: String, default: '', trim: true, lowercase: true },
    customTheme: {
        enabled: { type: Boolean, default: false },
        bgType: { type: String, default: 'color' },
        bgValue: { type: String, default: '#0a122c' },
        cardBg: { type: String, default: 'rgba(255, 255, 255, 0.05)' },
        cardBlur: { type: String, default: '16px' },
        textColor: { type: String, default: '#ffffff' },
        accentColor: { type: String, default: '#ffd000' },
        audioUrl: { type: String, default: '' },
        customCss: { type: String, default: '' },
        nameGlowType: { type: String, default: 'solid' },
        nameColor: { type: String, default: '#ffffff' },
        fontFamily: { type: String, default: 'IBM Plex Sans Arabic' },
        customCursorUrl: { type: String, default: '' },
        entryOverlay: {
            enabled: { type: Boolean, default: false },
            text: { type: String, default: 'Click to enter' },
            fontFamily: { type: String, default: 'JetBrains Mono' },
            textColor: { type: String, default: '#ffffff' },
            bgColor: { type: String, default: 'rgba(10, 18, 44, 0.96)' }
        }
    },
    sections: {
        type: [sectionSchema],
        validate: [val => val.length <= 5, 'الحد الأقصى للأقسام هو 5 فقط']
    },
// داخل models/DiscordUser.js
customTexts: [{ 
    type: { type: String, enum: ['badge', 'image'], default: 'badge' }, // نوع العنصر: شريحة نصية أو صورة
    icon: { type: String, default: '' }, 
    text: { type: String, default: '' },
    imageUrl: { type: String, default: '' }, // رابط الصورة المباشر
    imageWidth: { type: String, default: 'auto' }, // عرض الصورة (اختياري)
    linkUrl: { type: String, default: '' }, // رابط كليك لو حبيت تفتح موقع عند النقر على الصورة
    newLine: { type: Boolean, default: false } // هل تنزل سطر جديد؟
}],
    socialLinks: [{ platform: String, title: String, url: String }]
}, { timestamps: true });

module.exports = mongoose.model('DiscordUser', discordUserSchema);