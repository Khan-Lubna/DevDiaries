const User = require('../models/user');
const Blog = require('../models/blog');
const mongoose = require('mongoose');

const signup_get = (req, res) => {
    res.render('auth/signup', { title: 'Signup' });
};

const login_get = (req, res) => {
    res.render('auth/login', { title: 'Login' });
};

const signup_post = async (req, res) => {
    try {
        const user = await User.create(req.body);
        req.session.userId = user._id;
        req.session.userName = user.name;
        res.redirect('/blogs');
    } catch (err) {
        // Handle validation errors
        if (err.name === 'ValidationError') {
            let messages = [];
            for (let field in err.errors) {
                messages.push(err.errors[field].message);
            }
            return res.status(400).send(messages.join(', '));
        } else if (err.code === 11000) {
            // Duplicate key error
            return res.status(400).send('Email already exists');
        } else {
            console.error('Signup error:', err);
            return res.status(500).send('Server error');
        }
    }
};

const login_post = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.login(email, password);
        req.session.userId = user._id;
        req.session.userName = user.name;
        res.redirect('/blogs');
    } catch (err) {
        res.status(400).send(err.message);
    }
};

const logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/blogs');
    });
};

// Public user profile
const profile_get = async (req, res) => {
    try {
        const userId = req.params.id;

        // Validate that userId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).render('404', { title: 'User not found' });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).render('404', { title: 'User not found' });
        }

        // Fetch all user's published blogs for calculations (streaks, etc.)
        const allUserBlogs = await Blog.find({ userId: userId, isDraft: false })
            .sort({ day: 1, createdAt: 1 }); // Ascending for streak calculation

        // Fetch recent posts (limit to 3 for display)
        const recentBlogs = await Blog.find({ userId: userId, isDraft: false })
            .sort({ day: -1, createdAt: -1 }) // Most recent first
            .limit(3);

        // Calculate aggregates
        const [totalPosts, totalReadingTimeResult, allTags] = await Promise.all([
            // Count total published posts
            Blog.countDocuments({ userId: userId, isDraft: false }),
            // Get total reading time
            Blog.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), isDraft: false } },
                { $group: { _id: null, total: { $sum: "$readingTime" } } }
            ]),
            // Get all unique tags from user's published blogs
            Blog.distinct('tags', { userId: userId, isDraft: false })
        ]);

        // Process tags result (flatten array and remove duplicates/empty)
        let processedTags = [];
        if (Array.isArray(allTags)) {
            allTags.forEach(tagArray => {
                if (Array.isArray(tagArray)) {
                    processedTags = [...processedTags, ...tagArray.filter(tag => tag && tag.trim().length > 0)];
                }
            });
        }
        // Remove duplicates and filter out empty tags
        processedTags = [...new Set(processedTags.filter(tag => tag && tag.trim().length > 0))];

        // Calculate stats from ALL blogs (for accurate streaks and latest day)
        const daysArray = allUserBlogs.map(blog => blog.day).filter(day => day !== undefined && day !== null);
        const { currentStreak, longestStreak } = calculateStreaks(daysArray);
        const latestLearningDay = daysArray.length > 0 ? Math.max(...daysArray) : 0;

        // Learning goal progress
        const completedLearningDays = daysArray.length;
        let learningGoalTarget = Number(user.learningGoalTarget);
        if (isNaN(learningGoalTarget)) {
            learningGoalTarget = 30;
        }
        const learningProgressPercentage = learningGoalTarget > 0
            ? Math.min(100, Math.floor((completedLearningDays / learningGoalTarget) * 100))
            : 0;

        res.render('auth/profile', {
            title: `${user.name}'s Learning Profile`,
            profileUser: user,
            blogs: recentBlogs, // Only show recent posts in the view
            totalPosts: totalPosts,
            totalReadingTime: totalReadingTimeResult && totalReadingTimeResult.length > 0 ? totalReadingTimeResult[0].total : 0,
            tags: processedTags,
            latestLearningDay: latestLearningDay,
            currentStreak: currentStreak,
            longestStreak: longestStreak,
            learningGoalTarget: learningGoalTarget,
            completedLearningDays: completedLearningDays,
            learningProgressPercentage: learningProgressPercentage
        });
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).render('404', { title: 'Profile not found' });
    }
};

// Helper function to calculate current and longest streaks
function calculateStreaks(days) {
    if (days.length === 0) {
        return { currentStreak: 0, longestStreak: 0 };
    }

    // Sort days ascending (should already be sorted, but just in case)
    const sortedDays = [...days].sort((a, b) => a - b);

    let longestStreak = 0;
    let currentStreak = 0;
    let tempStreak = 1;

    // Find longest streak
    for (let i = 1; i < sortedDays.length; i++) {
        if (sortedDays[i] === sortedDays[i - 1] + 1) {
            // Consecutive day
            tempStreak++;
        } else if (sortedDays[i] !== sortedDays[i - 1]) {
            // Non-consecutive and not duplicate
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
        }
        // If duplicate day, we don't increment or reset the streak
    }

    longestStreak = Math.max(longestStreak, tempStreak);

    // Find current streak (from most recent day backwards)
    if (sortedDays.length > 0) {
        currentStreak = 1;
        for (let i = sortedDays.length - 1; i > 0; i--) {
            if (sortedDays[i] === sortedDays[i - 1] + 1) {
                currentStreak++;
            } else if (sortedDays[i] !== sortedDays[i - 1]) {
                // Break in streak
                break;
            }
            // If duplicate day, continue checking previous day
        }
    }

    return { currentStreak, longestStreak };
}

module.exports = {
    signup_get,
    signup_post,
    login_get,
    login_post,
    logout,
    profile_get
};