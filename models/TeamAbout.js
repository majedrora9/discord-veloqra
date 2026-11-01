const mongoose = require('mongoose');

const teamAboutSchema = new mongoose.Schema({
    tag: { type: String, required: true, unique: true, lowercase: true, trim: true },
    about: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('TeamAbout', teamAboutSchema);