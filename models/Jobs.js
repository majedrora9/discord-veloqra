const mongoose = require('mongoose');

const JobApplicationSchema = new mongoose.Schema({
    userId: { type: String, required: true },       // Discord User ID
    username: { type: String, required: true },     // Discord Username
    globalName: { type: String, default: '' },      // Discord Global Display Name
    avatar: { type: String, default: '/logo.png' }, // Avatar URL
    applicantName: { type: String, required: true },// الاسم الحقيقي المدخل
    applicantAge: { type: Number, required: true }, // العمر
    experience: { type: String, required: true },   // شرح الخبرات الموسع
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    appliedAt: { type: Date, default: Date.now }
});

const JobSchema = new mongoose.Schema({
    jobKey: { type: String, required: true, unique: true }, // وسيط، دعم فني، إلخ
    title: { type: String, required: true },
    icon: { type: String, default: 'work' },
    status: { type: String, enum: ['open', 'closed'], default: 'closed' },
    desc: { type: String, required: true },
    requirements: [{ type: String }],
    tags: [{
        icon: { type: String },
        text: { type: String }
    }],
    applications: [JobApplicationSchema]
}, { timestamps: true });

module.exports = mongoose.model('Job', JobSchema);