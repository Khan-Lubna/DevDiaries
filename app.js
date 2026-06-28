const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const session = require('express-session');
// const MongoStore = require('connect-mongo');

const blogRoutes = require('./routes/blogRoutes');
const authRoutes = require('./routes/authRoutes');
const blogController = require('./controllers/blogController');
const requireAuth = require('./middleware/authMiddleware');

// Express app
const app = express();

// MongoDB Connection URI
const dbURI = 'mongodb+srv://LubnaKhan:Qwerty%40%40123@cluster0.qqxynfx.mongodb.net/node-tuts?retryWrites=true&w=majority';

// Connect to MongoDB
mongoose.connect(dbURI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(3000, () => {
            console.log('Server running on port 3000');
        });
    })
    .catch((err) => console.log(err));

// Register view engine
app.set('view engine', 'ejs');

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Session middleware
// app.use(session({
//     secret: 'devdiaries-secret',
//     resave: false,
//     saveUninitialized: false,
//     store: MongoStore.create({
//         mongoUrl: dbURI
//     }),
//     cookie: {
//         maxAge: 1000 * 60 * 60 * 24 // 1 day
//     }
// }));

app.use(session({
    secret: 'devdiaries-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Global variables available in all EJS templates
app.use((req, res, next) => {
    res.locals.activePage = '';
    res.locals.userId = req.session.userId || null;
    res.locals.userName = req.session.userName || '';
    next();
});

// Home route
app.get('/', (req, res) => {
    res.redirect('/blogs');
});

// About page
app.get('/about', (req, res) => {
    res.render('about', {
        title: 'About',
        activePage: 'about'
    });
});

// Analytics page
app.get('/analytics', requireAuth, blogController.blog_analytics);

// Authentication routes
app.use(authRoutes);

// Blog routes
app.use('/blogs', blogRoutes);

// 404 page
app.use((req, res) => {
    res.status(404).render('404', {
        title: '404',
        activePage: ''
    });
});