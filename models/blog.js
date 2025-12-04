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
    publishedAt: {
        type: Date,
        default: Date.now
    },
    readingTime: {
        type: Number,
        default: 1
    }
}, { timestamps: true });

// Auto-update readingTime before saving
blogSchema.pre("save", function (next) {
    const words = this.body.split(" ").length;
    this.readingTime = Math.ceil(words / 200);
});

const Blog = mongoose.model('Blog', blogSchema);
module.exports = Blog;