const Blog = require('../models/blog');
const marked = require('marked');

const blog_index = (req, res) => {
    Blog.find().sort({ createdAt: -1 })
        .then((result) => {
            res.render('blogs/index', { title: 'All Blogs', blogs: result, activePage: "blogs" });
        })
        .catch((err) => {
            console.log(err);
        })
}

const blog_details = (req, res) => {
    const id = req.params.id;
    Blog.findById(id)
        .then(result => {
            const htmlBody = marked.parse(result.body);

            res.render('blogs/details', {
                blog: result,
                title: 'Blog Details',
                activePage: "blogs",
                htmlBody
            });

        })
        .catch(err => {
            res.status(400).render('404', { title: 'Blog not found' });
        });
}

const blog_create_get = (req, res) => {
    res.render('blogs/create', { title: 'Create a new blog', activePage: "create" });
}

const blog_create_post = (req, res) => {
    const blogData = {
        title: req.body.title,
        snippet: req.body.snippet,
        body: req.body.body,
        author: req.body.author,
        publishedAt: new Date()
    };
    const blog = new Blog(blogData);

    blog.save()
        .then((result) => {
            res.redirect('/blogs');
        })
        .catch((err) => {
            console.log(err);
        })
}

const blog_delete = (req, res) => {
    const id = req.params.id;

    Blog.findByIdAndDelete(id)
        .then(result => {
            res.json({ redirect: '/blogs' });
        })
        .catch(err => {
            console.log(err);
        });
}

module.exports = {
    blog_index,
    blog_details,
    blog_create_get,
    blog_create_post,
    blog_delete
}