const Blog = require('../models/blog');
const marked = require('marked');
const mongoose = require('mongoose');
const User = require('../models/user');
const { checkAllAchievements } = require('../utils/achievements');
const PDFDocument = require('pdfkit');

const blog_index = (req, res) => {
    console.log("blog_index called");
    // Check if tag filter is provided in query parameters
    const tagFilter = req.query.tag;

    // Build query object for filtered blogs
    const query = { isDraft: false };
    if (tagFilter) {
        // Find blogs that have the specified tag in their tags array
        query.tags = tagFilter;
    }

    // Fetch filtered blogs and also get all unique tags for tag cloud
    Promise.all([
        Blog.find(query).sort({ createdAt: -1 }),
        Blog.distinct('tags', { isDraft: false })
            .then(tags => (Array.isArray(tags) ? tags : []))
            .catch(() => [])
    ])
    .then(([blogs, allTags]) => {
        // Ensure allTags is definitely an array (extra safety)
        if (!Array.isArray(allTags)) {
            allTags = [];
        }

        console.log("Blogs:", blogs.length);
        console.log("All Tags:", allTags);
        console.log("Current Tag:", tagFilter);

        res.render('blogs/index', {
            title: 'All Blogs',
            blogs: blogs,
            activePage: "blogs",
            currentTag: tagFilter, // Pass current tag to view for highlighting
            allTags: allTags // Pass all unique tags for tag cloud
        });
    })
    .catch((err) => {
        console.log('Error in blog_index:', err);
        // Fallback rendering with guaranteed defined variables
        res.render('blogs/index', {
            title: 'All Blogs',
            blogs: [],
            activePage: "blogs",
            currentTag: tagFilter || null,
            allTags: [] // Ensure allTags is defined as empty array
        });
    });
};

const blog_dashboard = async (req, res) => {
    try {
        const userId = req.session.userId;

        // Fetch user to get learning goal target
        const user = await User.findById(userId);
        let learningGoalTarget = 30;
        if (user) {
            const goal = Number(user.learningGoalTarget);
            if (!isNaN(goal)) {
                learningGoalTarget = goal;
            }
        }

        // Run all queries in parallel for better performance
        const [publishedCount, draftsCount, daysArray, readingTimeResult] = await Promise.all([
            Blog.countDocuments({ userId: userId, isDraft: false }), // Published posts
            Blog.countDocuments({ userId: userId, isDraft: true }),  // Drafts
            Blog.find({ userId: userId, isDraft: false }, { day: 1, _id: 0 }).sort({ day: 1 }), // All published days for streak calculation
            Blog.aggregate([ // Total reading time written
                { $match: { userId: new mongoose.Types.ObjectId(userId) } },
                { $group: { _id: null, total: { $sum: "$readingTime" } } }
            ])
        ]);

        const latestLearningDay = daysArray.length > 0 ? daysArray[daysArray.length - 1].day : 0;
        const totalReadingTime = readingTimeResult && readingTimeResult.length > 0 ? readingTimeResult[0].total : 0;

        // Calculate streaks
        const { currentStreak, longestStreak } = calculateStreaks(daysArray.map(item => item.day));

        // Calculate learning progress (unique learning days completed)
        const completedLearningDays = daysArray.length;
        const learningProgressPercentage = learningGoalTarget > 0
            ? Math.min(100, Math.floor((completedLearningDays / learningGoalTarget) * 100))
            : 0;

        res.render('blogs/dashboard', {
            title: 'Dashboard',
            activePage: 'dashboard',
            publishedCount,
            draftsCount,
            latestLearningDay,
            totalReadingTime,
            currentStreak,
            longestStreak,
            // New learning goal fields
            learningGoalTarget,
            completedLearningDays,
            learningProgressPercentage
        });
    } catch (err) {
        console.log(err);
        res.redirect('/blogs');
    }
};

// Helper function to calculate current and longest streaks
function calculateStreaks(days) {
    if (days.length === 0) {
        return { currentStreak: 0, longestStreak: 0 };
    }

    // Sort days ascending (should already be sorted from query, but just in case)
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
};

const blog_create_get = (req, res) => {
    res.render('blogs/create', { title: 'Create a new blog', activePage: "create" });
};

const blog_create_post = (req, res) => {
    const isDraft = req.body.action === 'save-draft';

    // Process tags from comma-separated string to array
    let tagsArray = [];
    if (req.body.tags) {
        tagsArray = req.body.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
    }

    const blogData = {
        title: req.body.title,
        snippet: req.body.snippet,
        body: req.body.body,
        author: req.body.author,
        day: Number(req.body.day),
        userId: req.session.userId,
        publishedAt: isDraft ? null : new Date(),
        isDraft: isDraft,
        tags: tagsArray
    };
    const blog = new Blog(blogData);

    blog.save()
        .then(async (result) => {
            // Check and award achievements after blog creation
            try {
                await checkAllAchievements(req.session.userId);
            } catch (achievementError) {
                console.error('Error checking achievements:', achievementError);
                // Don't fail the blog creation if achievements fail
            }

            if (isDraft) {
                // res.redirect('/my-drafts');
                res.redirect('/blogs/my-drafts');
            } else {
                res.redirect('/blogs');
            }
        })
        .catch((err) => {
            console.log(err);
            res.redirect('/blogs/create');
        })
};

const blog_delete = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({
                redirect: '/blogs'
            });
        }

        if (blog.userId.toString() !== req.session.userId) {
            return res.status(403).json({
                redirect: '/blogs'
            });
        }

        await Blog.findByIdAndDelete(req.params.id);

        // Check and award achievements after blog deletion
        try {
            await checkAllAchievements(req.session.userId);
        } catch (achievementError) {
            console.error('Error checking achievements:', achievementError);
            // Don't fail the blog deletion if achievements fail
        }

        res.json({
            redirect: '/blogs'
        });

    } catch (err) {
        console.log(err);
    }
};

const blog_my_posts = (req, res) => {
    Blog.find({ userId: req.session.userId, isDraft: false })
        // .sort({ createdAt: -1 })
        .sort({ day: 1 })
        .then((blogs) => {
            res.render('blogs/my-posts', {
                title: 'My Posts',
                blogs,
                activePage: 'my-posts'
            });
        })
        .catch((err) => {
            console.log(err);
        });
};

const blog_my_drafts = (req, res) => {
    Blog.find({ userId: req.session.userId, isDraft: true })
        .sort({ createdAt: -1 })
        .then((drafts) => {
            res.render('blogs/my-drafts', {
                title: 'My Drafts',
                drafts,
                activePage: 'my-drafts'
            });
        })
        .catch((err) => {
            console.log(err);
        });
};

const blog_edit_get = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).render('404', { title: 'Blog not found' });
        }

        // Ownership check
        if (blog.userId.toString() !== req.session.userId) {
            return res.redirect('/blogs');
        }

        res.render('blogs/edit', {
            title: 'Edit Blog',
            blog,
            activePage: ''
        });

    } catch (err) {
        console.log(err);
        res.redirect('/blogs');
    }
};

const blog_edit_post = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.redirect('/blogs');
        }

        // Ownership check
        if (blog.userId.toString() !== req.session.userId) {
            return res.redirect('/blogs');
        }

        const isDraft = req.body.action === 'save-draft';

        // Process tags from comma-separated string to array
        let tagsArray = [];
        if (req.body.tags) {
            tagsArray = req.body.tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
        }

        await Blog.findByIdAndUpdate(req.params.id, {
            title: req.body.title,
            snippet: req.body.snippet,
            body: req.body.body,
            author: req.body.author,
            day: Number(req.body.day),
            publishedAt: isDraft ? null : new Date(),
            isDraft: isDraft,
            tags: tagsArray
        });

        // Check and award achievements after blog update
        try {
            await checkAllAchievements(req.session.userId);
        } catch (achievementError) {
            console.error('Error checking achievements:', achievementError);
            // Don't fail the blog update if achievements fail
        }

        if (isDraft) {
            res.redirect('/my-drafts');
        } else {
            res.redirect(`/blogs/${req.params.id}`);
        }

    } catch (err) {
        console.log(err);
        res.redirect('/blogs');
    }
};

// New function to update learning goal
const blog_update_goal = async (req, res) => {
    try {
        const userId = req.session.userId;
        const newGoal = parseInt(req.body.goal);

        // Validate the goal
        if (isNaN(newGoal) || newGoal <= 0) {
            return res.status(400).json({
                error: 'Please enter a valid goal number greater than 0'
            });
        }

        // Update user's learning goal
        await User.findByIdAndUpdate(userId, { learningGoalTarget: newGoal });

        // Check and award achievements after goal update
        try {
            await checkAllAchievements(userId);
        } catch (achievementError) {
            console.error('Error checking achievements:', achievementError);
            // Don't fail the goal update if achievements fail
        }

        // Redirect back to dashboard
        res.redirect('/blogs/dashboard');
    } catch (err) {
        console.log('Error updating learning goal:', err);
        res.redirect('/blogs/dashboard');
    }
};

// Analytics controller function
const blog_analytics = async (req, res) => {
    try {
        const userId = req.session.userId;

        // Run all analytics queries in parallel for better performance
        const [mostLearnedTech, techDistribution, monthlyActivity, avgReadingTime, mostProductiveMonth] = await Promise.all([
            // Most Learned Technology - find the most frequently used tag
            Blog.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), isDraft: false } },
                { $unwind: '$tags' },
                { $group: { _id: '$tags', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 1 }
            ]).then(result => {
                return result.length > 0 ? { tag: result[0]._id, count: result[0].count } : { tag: 'None', count: 0 };
            }),

            // Technology Distribution - count of each tag
            Blog.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), isDraft: false } },
                { $unwind: '$tags' },
                { $group: { _id: '$tags', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]).then(result => {
                return result.map(item => ({ tag: item._id, count: item.count }));
            }),

            // Monthly Activity - posts per month
            Blog.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), isDraft: false } },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]).then(result => {
                return result.map(item => ({
                    month: item._id.month,
                    year: item._id.year,
                    count: item.count
                }));
            }),

            // Average Reading Time
            Blog.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), isDraft: false } },
                { $group: { _id: null, avgReadingTime: { $avg: '$readingTime' } } }
            ]).then(result => {
                return result.length > 0 ? result[0].avgReadingTime : 0;
            }),

            // Most Productive Month - month with highest post count
            Blog.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), isDraft: false } },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 1 }
            ]).then(result => {
                return result.length > 0 ? {
                    month: result[0]._id.month,
                    year: result[0]._id.year,
                    count: result[0].count
                } : { month: 0, year: 0, count: 0 };
            })
        ]);


        // Format month numbers to names
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        // Format monthly activity data for display
        const formattedMonthlyActivity = monthlyActivity.map(item => ({
            monthName: monthNames[item.month - 1],
            month: item.month,
            year: item.year,
            count: item.count,
            label: `${monthNames[item.month - 1]} ${item.year}`
        }));

        // Format most productive month
        let mostProductiveMonthFormatted = { monthName: 'None', year: 0, count: 0 };
        if (mostProductiveMonth.month > 0 && mostProductiveMonth.year > 0) {
            mostProductiveMonthFormatted = {
                monthName: monthNames[mostProductiveMonth.month - 1],
                year: mostProductiveMonth.year,
                count: mostProductiveMonth.count,
                label: `${monthNames[mostProductiveMonth.month - 1]} ${mostProductiveMonth.year}`
            };
        }

        res.render('analytics', {
            title: 'Learning Analytics',
            activePage: 'analytics',
            mostLearnedTech: mostLearnedTech.tag || 'None',
            mostLearnedTechCount: mostLearnedTech.count,
            techDistribution: techDistribution,
            monthlyActivity: formattedMonthlyActivity,
            avgReadingTime: Math.round(avgReadingTime * 10) / 10, // Round to 1 decimal place
            mostProductiveMonth: mostProductiveMonthFormatted
        });
    } catch (err) {
        console.log('Error in blog_analytics:', err);
        res.redirect('/blogs/dashboard');
    }
};
const blog_search = async (req, res) => {
    try {
        const searchQuery = req.query.q;
        let blogs = [];
        let allTags = [];

        if (searchQuery && searchQuery.trim() !== '') {
            // Build search condition
            const query = {
                isDraft: false,
                $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { snippet: { $regex: searchQuery, $options: 'i' } },
                    { body: { $regex: searchQuery, $options: 'i' } },
                    { tags: { $regex: searchQuery, $options: 'i' } }
                ]
            };

            // Fetch matching blogs and all tags for tag cloud
            const [blogsResult, tagsResult] = await Promise.all([
                Blog.find(query).sort({ createdAt: -1 }),
                Blog.distinct('tags', { isDraft: false })
            ]);

            blogs = blogsResult;
            allTags = Array.isArray(tagsResult) ? tagsResult : [];
        }

        res.render('blogs/search', {
            title: 'Search Results',
            blogs: blogs,
            allTags: allTags,
            activePage: 'search',
            searchQuery: searchQuery || ''
        });
    } catch (err) {
        console.log('Error in blog_search:', err);
        res.redirect('/blogs');
    }
}

const blog_export_report = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.redirect('/login');
        }

        // Fetch user info
        const user = await User.findById(userId);
        const userName = user ? user.name : 'Anonymous';
        const userEmail = user ? user.email : '';
        const learningGoalTarget = user ? Number(user.learningGoalTarget) : 30;

        // Run analytics queries in parallel
        const [publishedCount, draftsCount, daysArray, readingTimeResult, allUserBlogs] = await Promise.all([
            Blog.countDocuments({ userId: userId, isDraft: false }), // Published posts
            Blog.countDocuments({ userId: userId, isDraft: true }),  // Drafts
            Blog.find({ userId: userId, isDraft: false }, { day: 1, _id: 0 }).sort({ day: 1 }), // All published days for streak calculation
            Blog.aggregate([ // Total reading time written
                { $match: { userId: new mongoose.Types.ObjectId(userId) } },
                { $group: { _id: null, total: { $sum: "$readingTime" } } }
            ]),
            // Fetch published blogs for report details
            Blog.find({ userId: userId, isDraft: false }).select('title day tags readingTime snippet createdAt').sort({ day: 1 })
        ]);

        const totalReadingTime = readingTimeResult && readingTimeResult.length > 0 ? readingTimeResult[0].total : 0;

        // Calculate streaks
        const { currentStreak, longestStreak } = calculateStreaks(daysArray.map(item => item.day));
        const completedLearningDays = daysArray.length;
        const learningProgressPercentage = learningGoalTarget > 0
            ? Math.min(100, Math.floor((completedLearningDays / learningGoalTarget) * 100))
            : 0;

        // Set active page for nav highlight
        res.locals.activePage = 'export-report';

        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-disposition', `attachment; filename=learning-report-${Date.now()}.pdf`);

        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        // Header
        doc.fontSize(20)
           .text('Learning Report', { align: 'center' })
           .moveDown();

        doc.fontSize(16)
           .text(`For: ${userName}`, { align: 'center' })
           .moveDown();

        if (userEmail) {
            doc.fontSize(12)
               .text(`Email: ${userEmail}`, { align: 'center' })
               .moveDown();
        }

        // Stats section
        doc.fontSize(18)
           .text('Learning Statistics', { underline: true })
           .moveDown();

        const statsTable = [
            ['Published Posts:', publishedCount.toString()],
            ['Draft Posts:', draftsCount.toString()],
            ['Total Reading Time (min):', totalReadingTime.toString()],
            ['Current Streak (days):', currentStreak.toString()],
            ['Longest Streak (days):', longestStreak.toString()],
            ['Learning Goal Target:', learningGoalTarget.toString()],
            ['Completed Learning Days:', completedLearningDays.toString()],
            ['Learning Progress (%):', learningProgressPercentage.toString() + '%']
        ];

        statsTable.forEach(([label, value]) => {
            doc.fontSize(12)
               .text(label, { continued: true })
               .text(value, { align: 'right' })
               .moveDown(0.5);
        });

        doc.moveDown();

        // Posts section
        if (allUserBlogs.length > 0) {
            doc.fontSize(18)
               .text('Published Posts', { underline: true })
               .moveDown();

            allUserBlogs.forEach((post, index) => {
                // Prevent page break inside a post
                if (doc.y + 100 > doc.page.height - 50) {
                    doc.addPage();
                }

                doc.fontSize(14)
                   .text(`${index + 1}. ${post.title}`)
                   .fontSize(11)
                   .text(`Day: ${post.day} | Reading Time: ${post.readingTime} min | Tags: ${post.tags?.join(', ') || 'None'}`)
                   .text(`Published: ${post.createdAt.toLocaleDateString()}`)
                   .text(`Snippet: ${post.snippet}`)
                   .moveDown(1);
            });
        } else {
            doc.fontSize(12)
               .text('No published posts yet.', { align: 'center' })
               .moveDown();
        }

        // Footer
        doc.fontSize(10)
           .text(`Generated on ${new Date().toLocaleString()}`, { align: 'center' })
           .moveDown();

        doc.end();
    } catch (err) {
        console.log('Error generating PDF report:', err);
        res.redirect('/blogs/dashboard');
    }
};

// Helper function to calculate current and longest streaks (same as in dashboard)
function calculateStreaks(days) {
    if (days.length === 0) {
        return { currentStreak: 0, longestStreak: 0 };
    }

    // Sort days ascending (should already be sorted from query, but just in case)
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
    blog_index,
    blog_details,
    blog_create_get,
    blog_create_post,
    blog_delete,
    blog_my_posts,
    blog_edit_get,
    blog_edit_post,
    blog_my_drafts,
    blog_dashboard,
    blog_update_goal,
    blog_analytics,
    blog_search,
    blog_export_report
};