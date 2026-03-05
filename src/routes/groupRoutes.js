const express = require('express');
const router = express.Router(); // 👈 THIS WAS MISSING!
const PlayerGroup = require('../models/PlayerGroup');
const ClanStats = require('../models/ClanStats');

// Helper function to calculate combined scores
function calculateCombinedScores(accounts, weekLabels) {
  const combined = {};
  
  weekLabels.forEach(week => {
    const scores = [];
    const duels = [];
    
    accounts.forEach(account => {
      // Handle both Map and object formats
      let weekScore = null;
      if (account.weeklyScores instanceof Map) {
        weekScore = account.weeklyScores.get(week);
      } else {
        weekScore = account.weeklyScores?.[week];
      }
      
      if (weekScore && weekScore.score > 0) {
        scores.push(weekScore.score);
        duels.push(weekScore.duels);
      }
    });
    
    const total = scores.reduce((sum, s) => sum + s, 0);
    const average = scores.length > 0 ? Math.round(total / scores.length) : 0;
    
    combined[week] = {
      scores,
      duels,
      total,
      average
    };
  });
  
  return combined;
}

// Helper function to calculate group averages
function calculateGroupAverages(accounts) {
  const all8Weeks = accounts
    .filter(a => a.avg8Weeks !== null && a.avg8Weeks !== undefined)
    .map(a => a.avg8Weeks);
  
  const all4Weeks = accounts
    .filter(a => a.avg4Weeks !== null && a.avg4Weeks !== undefined)
    .map(a => a.avg4Weeks);
  
  const avg8Weeks = all8Weeks.length > 0 
    ? all8Weeks.reduce((sum, avg) => sum + avg, 0) / all8Weeks.length 
    : null;
  
  const avg4Weeks = all4Weeks.length > 0 
    ? all4Weeks.reduce((sum, avg) => sum + avg, 0) / all4Weeks.length 
    : null;

  return { avg8Weeks, avg4Weeks };
}

// GET /api/groups/:clanTag - Get all groups with latest stats
router.get('/:clanTag', async (req, res) => {
  try {
    const { clanTag } = req.params;
    
    // Get all groups for this clan
    const groups = await PlayerGroup.find({ clanTag }).sort({ updatedAt: -1 });
    
    // Get latest clan stats for reference
    const latestStats = await ClanStats.findOne({ clanTag })
      .sort({ lastUpdated: -1 })
      .select('allWeekLabels lastUpdated');
    
    res.json({
      success: true,
      groups,
      weekLabels: latestStats?.allWeekLabels || [],
      statsLastUpdated: latestStats?.lastUpdated || null,
      totalGroups: groups.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching groups:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/groups/:clanTag - Create new group
router.post('/:clanTag', async (req, res) => {
  try {
    const { clanTag } = req.params;
    const { groupName, description, accountIds } = req.body;
    
    console.log('📝 Creating group:', { clanTag, groupName, accountIds });
    
    // Validate input
    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Group name is required' 
      });
    }
    
    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least one account must be selected' 
      });
    }
    
    // Get latest clan stats to fetch player data
    const latestStats = await ClanStats.findOne({ clanTag })
      .sort({ lastUpdated: -1 });
    
    if (!latestStats) {
      return res.status(404).json({ 
        success: false, 
        error: 'No clan stats found. Please load the main page first.' 
      });
    }
    
    // Find the selected players
    const accounts = latestStats.players
      .filter(p => accountIds.includes(p.playerId))
      .map(p => ({
        playerId: p.playerId,
        name: p.name || 'Unknown Player',
        avg8Weeks: p.avg8Weeks,
        avg4Weeks: p.avg4Weeks,
        weeklyScores: p.weeklyScores || {}
      }));
    
    if (accounts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No valid accounts selected' 
      });
    }
    
    // Calculate combined scores
    const combinedWeeklyScores = calculateCombinedScores(accounts, latestStats.allWeekLabels);
    const averages = calculateGroupAverages(accounts);
    
    // Create new group
    const newGroup = new PlayerGroup({
      clanTag,
      groupId: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      groupName: groupName.trim(),
      description: description || '',
      accounts,
      combinedWeeklyScores,
      avg8Weeks: averages.avg8Weeks,
      avg4Weeks: averages.avg4Weeks,
      totalPlayers: accounts.length
    });
    
    await newGroup.save();
    console.log('✅ Group created successfully:', newGroup.groupId);
    
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: newGroup
    });
    
  } catch (error) {
    console.error('❌ Error creating group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// PUT /api/groups/:clanTag/:groupId - Update group
router.put('/:clanTag/:groupId', async (req, res) => {
  try {
    const { clanTag, groupId } = req.params;
    const { groupName, description, accounts } = req.body;
    
    // Get latest stats for recalculation
    const latestStats = await ClanStats.findOne({ clanTag })
      .sort({ lastUpdated: -1 });
    
    let updatedAccounts = accounts;
    let combinedWeeklyScores = {};
    let averages = { avg8Weeks: null, avg4Weeks: null };
    
    if (latestStats && accounts) {
      // Refresh account data with latest stats
      updatedAccounts = accounts.map(account => {
        const latestPlayer = latestStats.players.find(p => p.playerId === account.playerId);
        if (latestPlayer) {
          return {
            ...account,
            name: latestPlayer.name || account.name,
            avg8Weeks: latestPlayer.avg8Weeks,
            avg4Weeks: latestPlayer.avg4Weeks,
            weeklyScores: latestPlayer.weeklyScores || {}
          };
        }
        return account;
      });
      
      // Recalculate combined scores
      combinedWeeklyScores = calculateCombinedScores(updatedAccounts, latestStats.allWeekLabels);
      averages = calculateGroupAverages(updatedAccounts);
    }
    
    const updatedGroup = await PlayerGroup.findOneAndUpdate(
      { clanTag, groupId },
      {
        groupName,
        description,
        accounts: updatedAccounts,
        combinedWeeklyScores,
        avg8Weeks: averages.avg8Weeks,
        avg4Weeks: averages.avg4Weeks,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!updatedGroup) {
      return res.status(404).json({ 
        success: false, 
        error: 'Group not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Group updated successfully',
      group: updatedGroup
    });
    
  } catch (error) {
    console.error('❌ Error updating group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE /api/groups/:clanTag/:groupId - Delete group
router.delete('/:clanTag/:groupId', async (req, res) => {
  try {
    const { clanTag, groupId } = req.params;
    
    const result = await PlayerGroup.findOneAndDelete({ clanTag, groupId });
    
    if (!result) {
      return res.status(404).json({ 
        success: false, 
        error: 'Group not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Group deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/groups/:clanTag/recalculate - Recalculate all groups with latest data
router.post('/:clanTag/recalculate', async (req, res) => {
  try {
    const { clanTag } = req.params;
    
    // Get latest stats
    const latestStats = await ClanStats.findOne({ clanTag })
      .sort({ lastUpdated: -1 });
    
    if (!latestStats) {
      return res.status(404).json({ 
        success: false, 
        error: 'No clan stats found' 
      });
    }
    
    // Get all groups
    const groups = await PlayerGroup.find({ clanTag });
    
    const updatedGroups = [];
    
    for (const group of groups) {
      // Update each account with latest data
      const updatedAccounts = group.accounts.map(account => {
        const latestPlayer = latestStats.players.find(p => p.playerId === account.playerId);
        
        if (latestPlayer) {
          return {
            playerId: account.playerId,
            name: latestPlayer.name || account.name,
            avg8Weeks: latestPlayer.avg8Weeks,
            avg4Weeks: latestPlayer.avg4Weeks,
            weeklyScores: latestPlayer.weeklyScores || {}
          };
        }
        return account.toObject();
      });
      
      // Recalculate combined scores
      const combinedWeeklyScores = calculateCombinedScores(updatedAccounts, latestStats.allWeekLabels);
      const averages = calculateGroupAverages(updatedAccounts);
      
      // Update group
      group.accounts = updatedAccounts;
      group.combinedWeeklyScores = combinedWeeklyScores;
      group.avg8Weeks = averages.avg8Weeks;
      group.avg4Weeks = averages.avg4Weeks;
      group.updatedAt = new Date();
      
      await group.save();
      updatedGroups.push(group);
    }
    
    res.json({
      success: true,
      message: `Recalculated ${updatedGroups.length} groups`,
      groups: updatedGroups,
      weekLabels: latestStats.allWeekLabels
    });
    
  } catch (error) {
    console.error('❌ Error recalculating groups:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/groups/:clanTag/available-players - Get players not in any group
router.get('/:clanTag/available-players', async (req, res) => {
  try {
    const { clanTag } = req.params;
    
    // Get latest stats
    const latestStats = await ClanStats.findOne({ clanTag })
      .sort({ lastUpdated: -1 });
    
    if (!latestStats) {
      return res.status(404).json({ 
        success: false, 
        error: 'No clan stats found' 
      });
    }
    
    // Get all grouped player IDs
    const groups = await PlayerGroup.find({ clanTag });
    const groupedPlayerIds = new Set();
    groups.forEach(group => {
      group.accounts.forEach(account => {
        groupedPlayerIds.add(account.playerId);
      });
    });
    
    // Filter out grouped players
    const availablePlayers = latestStats.players.filter(
      p => !groupedPlayerIds.has(p.playerId)
    );
    
    res.json({
      success: true,
      players: availablePlayers,
      weekLabels: latestStats.allWeekLabels,
      totalAvailable: availablePlayers.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching available players:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router; 