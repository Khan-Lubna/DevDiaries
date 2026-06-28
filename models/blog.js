const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const blogSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    snippet: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    author: {
        type: String,
        required: true,
        default: "Unknown Author"
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    publishedAt: {
        type: Date,
        default: null
    },
    isDraft: {
        type: Boolean,
        default: false
    },
    readingTime: {
        type: Number,
        default: 1
    },
    day: {
        type: Number,
        required: true,
        min: 1
    },
    tags: {
        type: [String], // Array of strings for tags
        default: []
    }
}, { timestamps: true });

// Auto-update readingTime before saving
blogSchema.pre("save", function () {
    const words = this.body.split(" ").length;
    this.readingTime = Math.ceil(words / 200);
});

const Blog = mongoose.model('Blog', blogSchema);
module.exports = Blog;