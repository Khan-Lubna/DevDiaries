const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt');

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    learningGoalTarget: {
        type: Number,
        default: 30
    },
    achievements: [{
        type: String,
        enum: [
            // Posting Achievements
            'first-blog',
            '10-posts',
            '25-posts',
            '50-posts',

            // Learning Day Achievements
            'day-5-learner',
            'day-10-learner',
            'day-25-learner',
            'day-50-learner',

            // Streak Achievements
            'streak-3',
            'streak-7',
            'streak-14',
            'streak-30',

            // Goal Achievements
            'first-goal-completed',
            'goal-30-days',
            'goal-100-days',

            // Technology Achievements
            'react-explorer',
            'nodejs-learner',
            'mongodb-explorer',
            'css-master'
        ],
        default: []
    }]
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function () {
    const user = this;

    if (!user.isModified('password')) return;

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
});

// Static login method
userSchema.statics.login = async function (email, password) {
    const user = await this.findOne({ email });

    if (user) {
        const auth = await bcrypt.compare(password, user.password);
        if (auth) {
            return user;
        }
        throw Error('Incorrect password');
    }
    throw Error('Email not registered');
};

const User = mongoose.model('User', userSchema);
module.exports = User;