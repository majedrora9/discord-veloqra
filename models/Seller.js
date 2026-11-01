const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
    reason: { type: String, required: true },
    severity: { type: String, default: 'تحذير' },
    date: { type: Date, default: Date.now },
    adminId: { type: String, default: '' },
    adminName: { type: String, default: '' },
    adminAvatar: { type: String, default: '/logo.png' }
});

// سجل المنتجات المشتراة لكل عضو
const purchaseSchema = new mongoose.Schema({
    productName: { type: String, required: true },
    price: { type: Number, default: 0 },
    sellerId: { type: String, default: '' },
    sellerName: { type: String, default: 'متجر Veloqra' },
    date: { type: Date, default: Date.now }
});

// سجل الإعلانات المنشورة للبائع المعتمد
// سجل الإعلانات المنشورة للبائع المعتمد (مع حالة المراجعة)
const adSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, // يذهب للمراجعة أولاً
    createdAt: { type: Date, default: Date.now }
});

const sellerSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: { type: String, default: 'عضو فيلوكرا' },
    avatar: { type: String, default: '/logo.png' },
    isVerifiedSeller: { type: Boolean, default: false },
    veloCoins: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },
    violations: [violationSchema],
    purchases: [purchaseSchema], // المشتريات الخاصة بالعضو
    ads: [adSchema]              // إعلانات البائع المعتمد
}, { timestamps: true });

module.exports = mongoose.model('Seller', sellerSchema);