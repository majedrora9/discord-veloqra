const mongoose = require('mongoose');

const JobApplicationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, default: '/logo.png' },
    fullName: { type: String },
    applicantName: { type: String },
    age: { type: Number, default: 18 },
    applicantAge: { type: Number },
    experience: { type: String, default: '' },
    reason: { type: String, default: '' },
    portfolio: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    appliedAt: { type: Date, default: Date.now }
});

const JobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    icon: { type: String, default: 'work' },
    department: { type: String, default: 'عام' },
    description: { type: String, default: '' },
    desc: { type: String, default: '' },
    requirements: [{ type: String }],
    salary: { type: String, default: 'تحدد بعد المقابلة' },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    applications: [JobApplicationSchema],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Job || mongoose.model('Job', JobSchema);