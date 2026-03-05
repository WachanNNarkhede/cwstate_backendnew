const mongoose = require('mongoose');

const weeklyScoreSchema = new mongoose.Schema({
  score: Number,
  duels: Number
}, { _id: false });

const groupedAccountSchema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    default: 'Unknown Player'
  },
  avg8Weeks: {
    type: Number,
    default: null
  },
  avg4Weeks: {
    type: Number,
    default: null
  },
  weeklyScores: {
    type: Map,
    of: weeklyScoreSchema,
    default: {}
  }
}, { _id: false });

const combinedWeekDataSchema = new mongoose.Schema({
  scores: [Number],
  duels: [Number],
  total: Number,
  average: Number
}, { _id: false });

const playerGroupSchema = new mongoose.Schema({
  clanTag: {
    type: String,
    required: true,
    index: true
  },
  groupId: {
    type: String,
    required: true,
    unique: true
  },
  groupName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  accounts: [groupedAccountSchema],
  combinedWeeklyScores: {
    type: Map,
    of: combinedWeekDataSchema,
    default: {}
  },
  avg8Weeks: {
    type: Number,
    default: null
  },
  avg4Weeks: {
    type: Number,
    default: null
  },
  totalPlayers: {
    type: Number,
    default: 0
  },
  activeWeeks: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ✅ FIXED: Correct pre-save hook without 'next' parameter issue
playerGroupSchema.pre('save', function() {
  this.updatedAt = new Date();
  this.totalPlayers = this.accounts.length;
  
  // Calculate active weeks
  if (this.combinedWeeklyScores) {
    let activeCount = 0;
    // Handle Map correctly
    if (this.combinedWeeklyScores instanceof Map) {
      for (const [week, data] of this.combinedWeeklyScores) {
        if (data.scores && data.scores.length > 0) {
          activeCount++;
        }
      }
    } else {
      // Handle as object
      const scoresObj = this.combinedWeeklyScores.toObject?.() || this.combinedWeeklyScores;
      for (const week in scoresObj) {
        const data = scoresObj[week];
        if (data.scores && data.scores.length > 0) {
          activeCount++;
        }
      }
    }
    this.activeWeeks = activeCount;
  }
});

// Index for efficient queries
playerGroupSchema.index({ clanTag: 1, groupName: 1 });
playerGroupSchema.index({ clanTag: 1, updatedAt: -1 });

module.exports = mongoose.model('PlayerGroup', playerGroupSchema);