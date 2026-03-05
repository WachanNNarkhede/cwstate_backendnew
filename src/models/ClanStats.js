const mongoose = require('mongoose');

const weeklyScoreSchema = new mongoose.Schema({
  score: Number,
  duels: Number
}, { _id: false });

const playerSchema = new mongoose.Schema({
  rank: Number,
  name: String,
  playerId: String,
  avg8Weeks: Number,
  avg4Weeks: Number,
  weeklyScores: {
    type: Map,
    of: weeklyScoreSchema,
    default: {}
  }
}, { _id: false });

const clanStatsSchema = new mongoose.Schema({
  clanTag: {
    type: String,
    required: true,
    index: true
  },
  allWeekLabels: [String],
  seasons: {
    type: Map,
    of: [String],
    default: {}
  },
  players: [playerSchema],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

clanStatsSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('ClanStats', clanStatsSchema);