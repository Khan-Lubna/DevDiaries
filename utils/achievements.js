const mongoose = require('mongoose');
const User = require('../models/user');
const Blog = require('../models/blog');

/**
 * Award an achievement to a user if they don't already have it
 * @param {string} userId - The user's ID
 * @param {string} achievementId - The achievement ID to award
 * @returns {Promise<boolean>} - True if achievement was awarded, false if already had it
 */
async function awardAchievement(userId, achievementId) {
    try {
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid user ID');
        }

        // Find user and check if they already have the achievement
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Check if user already has this achievement
        if (user.achievements && user.achievements.includes(achievementId)) {
            return false; // Already has the achievement
        }

        // Add achievement to user's achievements array
        user.achievements.push(achievementId);
        await user.save();

        return true; // Achievement was awarded
    } catch (error) {
        console.error('Error awarding achievement:', error);
        throw error;
    }
}

/**
 * Check and award posting achievements based on number of published blogs
 * @param {string} userId - The user's ID
 */
async function checkPostingAchievements(userId) {
    try {
        // Count user's published blogs
        const postCount = await Blog.countDocuments({
            userId: userId,
            isDraft: false
        });

        // Define posting achievement thresholds
        const postingAchievements = [
            { threshold: 1, achievementId: 'first-blog' },
            { threshold: 10, achievementId: '10-posts' },
            { threshold: 25, achievementId: '25-posts' },
            { threshold: 50, achievementId: '50-posts' }
        ];

        // Check each threshold
        for (const { threshold, achievementId } of postingAchievements) {
            if (postCount >= threshold) {
                await awardAchievement(userId, achievementId);
            }
        }
    } catch (error) {
        console.error('Error checking posting achievements:', error);
    }
}

/**
 * Check and award learning day achievements based on unique learning days
 * @param {string} userId - The user's ID
 */
async function checkLearningDayAchievements(userId) {
    try {
        // Get unique learning days from user's published blogs
        const daysArray = await Blog.distinct('day', {
            userId: userId,
            isDraft: false
        });

        const uniqueLearningDays = daysArray.length;

        // Define learning day achievement thresholds
        const learningDayAchievements = [
            { threshold: 5, achievementId: 'day-5-learner' },
            { threshold: 10, achievementId: 'day-10-learner' },
            { threshold: 25, achievementId: 'day-25-learner' },
            { threshold: 50, achievementId: 'day-50-learner' }
        ];

        // Check each threshold
        for (const { threshold, achievementId } of learningDayAchievements) {
            if (uniqueLearningDays >= threshold) {
                await awardAchievement(userId, achievementId);
            }
        }
    } catch (error) {
        console.error('Error checking learning day achievements:', error);
    }
}

/**
 * Check and award streak achievements based on current streak
 * @param {string} userId - The user's ID
 */
async function checkStreakAchievements(userId) {
    try {
        // Get user's published blogs sorted by day
        const blogs = await Blog.find({
            userId: userId,
            isDraft: false
        }).sort({ day: 1 });

        // Extract days array
        const daysArray = blogs.map(blog => blog.day).filter(day => day !== undefined && day !== null);

        // Calculate current streak
        let currentStreak = 0;
        if (daysArray.length > 0) {
            currentStreak = 1;
            for (let i = daysArray.length - 1; i > 0; i--) {
                if (daysArray[i] === daysArray[i - 1] + 1) {
                    currentStreak++;
                } else if (daysArray[i] !== daysArray[i - 1]) {
                    break;
                }
            }
        }

        // Define streak achievement thresholds
        const streakAchievements = [
            { threshold: 3, achievementId: 'streak-3' },
            { threshold: 7, achievementId: 'streak-7' },
            { threshold: 14, achievementId: 'streak-14' },
            { threshold: 30, achievementId: 'streak-30' }
        ];

        // Check each threshold
        for (const { threshold, achievementId } of streakAchievements) {
            if (currentStreak >= threshold) {
                await awardAchievement(userId, achievementId);
            }
        }
    } catch (error) {
        console.error('Error checking streak achievements:', error);
    }
}

/**
 * Check and award goal achievements based on learning goal completion
 * @param {string} userId - The user's ID
 */
async function checkGoalAchievements(userId) {
    try {
        // Get user to check learning goal progress
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get unique learning days count
        const completedLearningDays = await Blog.distinct('day', {
            userId: userId,
            isDraft: false
        }).then(days => days.length);

        const learningGoalTarget = user.learningGoalTarget || 30;
        const goalProgressPercentage = learningGoalTarget > 0
            ? Math.min(100, Math.floor((completedLearningDays / learningGoalTarget) * 100))
            : 0;

        // Check if goal is completed (100% or more)
        const goalCompleted = goalProgressPercentage >= 100;

        // Define goal achievements
        if (completedLearningDays >= 1) {
            await awardAchievement(userId, 'first-goal-completed');
        }

        if (completedLearningDays >= 30) {
            await awardAchievement(userId, 'goal-30-days');
        }

        if (completedLearningDays >= 100) {
            await awardAchievement(userId, 'goal-100-days');
        }
    } catch (error) {
        console.error('Error checking goal achievements:', error);
    }
}

/**
 * Check and award technology achievements based on tags used in blogs
 * @param {string} userId - The user's ID
 */
async function checkTechnologyAchievements(userId) {
    try {
        // Get all tags from user's published blogs
        const tagsArray = await Blog.distinct('tags', {
            userId: userId,
            isDraft: false
        });

        // Flatten the tags array (since distinct returns array of arrays)
        let allTags = [];
        if (Array.isArray(tagsArray)) {
            tagsArray.forEach(tagArray => {
                if (Array.isArray(tagArray)) {
                    allTags = [...allTags, ...tagArray];
                }
            });
        }

        // Remove duplicates and filter out empty tags
        allTags = [...new Set(allTags.filter(tag => tag && tag.trim().length > 0))];

        // Count occurrences of each technology tag
        const tagCounts = {};
        allTags.forEach(tag => {
            const lowerTag = tag.toLowerCase().trim();
            tagCounts[lowerTag] = (tagCounts[lowerTag] || 0) + 1;
        });

        // Define technology achievement thresholds
        const technologyAchievements = [
            { tag: 'react', threshold: 5, achievementId: 'react-explorer' },
            { tag: 'node.js', threshold: 5, achievementId: 'nodejs-learner' },
            { tag: 'mongodb', threshold: 5, achievementId: 'mongodb-explorer' },
            { tag: 'css', threshold: 5, achievementId: 'css-master' }
        ];

        // Check each technology achievement
        for (const { tag, threshold, achievementId } of technologyAchievements) {
            const count = tagCounts[tag] || 0;
            if (count >= threshold) {
                await awardAchievement(userId, achievementId);
            }
        }
    } catch (error) {
        console.error('Error checking technology achievements:', error);
    }
}

/**
 * Main function to check all achievements for a user
 * Should be called after significant user actions (like creating a blog)
 * @param {string} userId - The user's ID
 */
async function checkAllAchievements(userId) {
    try {
        await checkPostingAchievements(userId);
        await checkLearningDayAchievements(userId);
        await checkStreakAchievements(userId);
        await checkGoalAchievements(userId);
        await checkTechnologyAchievements(userId);
    } catch (error) {
        console.error('Error checking all achievements:', error);
    }
}

module.exports = {
    awardAchievement,
    checkPostingAchievements,
    checkLearningDayAchievements,
    checkStreakAchievements,
    checkGoalAchievements,
    checkTechnologyAchievements,
    checkAllAchievements
};