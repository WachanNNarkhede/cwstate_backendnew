const express = require('express');
const router = express.Router();
const ClanStatsScraper = require('../services/scraperService');
const ClanStats = require('../models/ClanStats');
const ExcelJS = require('exceljs');

// GET /api/clan/:clanTag/daily-tracking
router.get('/:clanTag/daily-tracking', async (req, res) => {
  try {
    const { clanTag } = req.params;
    
    console.log(`📡 Request received for clan: ${clanTag}`);
    
    // Check cache (less than 1 hour old)
    const cachedData = await ClanStats.findOne({ 
      clanTag,
      lastUpdated: { $gt: new Date(Date.now() - 60 * 60 * 1000) }
    });
    
    if (cachedData) {
      console.log(`📦 Returning cached data for ${clanTag}`);
      return res.json(cachedData);
    }

    // Scrape fresh data
    console.log(`🆕 Scraping fresh data for ${clanTag}`);
    const scraper = new ClanStatsScraper(clanTag);
    const stats = await scraper.fetchClanStats();

    // Save to MongoDB
    const clanStats = new ClanStats(stats);
    await clanStats.save();
    console.log(`💾 Saved to database`);

    res.json(stats);
  } catch (error) {
    console.error('❌ Route error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch clan statistics. Please try again later.'
    });
  }
});

// GET /api/clan/:clanTag/export/excel - Download as Excel
// GET /api/clan/:clanTag/export/excel - Download as Excel
router.get('/:clanTag/export/excel', async (req, res) => {
  try {
    const { clanTag } = req.params;
    const { season } = req.query;
    
    console.log('📥 Excel export requested for', clanTag, season || 'all');
    
    // Get data from database
    const stats = await ClanStats.findOne({ 
      clanTag,
      lastUpdated: { $gt: new Date(Date.now() - 60 * 60 * 1000) }
    });
    
    if (!stats) {
      return res.status(404).json({ error: 'No data found. Please load the page first.' });
    }

    // Convert to plain object
    const data = JSON.parse(JSON.stringify(stats));
    
    console.log('📊 Database stats:', {
      weeks: data.allWeekLabels?.length,
      players: data.players?.length,
      sampleWeek: data.allWeekLabels?.[0],
      hasWeeklyScores: data.players?.[0]?.weeklyScores ? 'yes' : 'no'
    });

    // Determine which weeks to show
    let weeksToShow = data.allWeekLabels || [];
    let sheetName = 'All Weeks';
    
    if (season && data.seasons) {
      // Handle seasons (could be object or Map)
      let seasonWeeks = null;
      if (typeof data.seasons.get === 'function') {
        seasonWeeks = data.seasons.get(season);
      } else {
        seasonWeeks = data.seasons[season];
      }
      
      if (seasonWeeks) {
        weeksToShow = seasonWeeks;
        sheetName = `Season ${season}`;
      }
    }

    console.log('📊 Weeks to export:', weeksToShow);

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Clan Stats');

    // Add title
    worksheet.mergeCells('A1', 'D1');
    worksheet.getCell('A1').value = `Clan ${clanTag} - ${sheetName}`;
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add date
    worksheet.mergeCells('A2', 'D2');
    worksheet.getCell('A2').value = `Generated: ${new Date().toLocaleString()}`;
    worksheet.getCell('A2').font = { italic: true };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Headers row
    const headers = ['Rank', 'Player', '8 Weeks', '4 Weeks', ...weeksToShow];
    const headerRow = worksheet.addRow(headers);
    
    // Style headers
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4472C4' }
      };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add player data
    data.players.forEach((player, index) => {
      const row = [
        player.rank,
        player.name,
        player.avg8Weeks || '-',
        player.avg4Weeks || '-'
      ];
      
      // Add weekly scores
      weeksToShow.forEach(week => {
        let scoreValue = '-';
        
        // Check if player has weeklyScores and this week
        if (player.weeklyScores) {
          // Try different ways to access the score
          const weekScore = player.weeklyScores[week];
          if (weekScore) {
            scoreValue = `${weekScore.score} (${weekScore.duels})`;
          } else {
            // Try accessing as Map
            if (typeof player.weeklyScores.get === 'function') {
              const mapScore = player.weeklyScores.get(week);
              if (mapScore) {
                scoreValue = `${mapScore.score} (${mapScore.duels})`;
              }
            }
          }
        }
        
        row.push(scoreValue);
      });
      
      const dataRow = worksheet.addRow(row);
      
      // Style data row
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (cell.col === 1) { // Rank column
          cell.alignment = { horizontal: 'center' };
        }
      });
    });

    // Auto-size columns
    worksheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const length = cell.value ? cell.value.toString().length : 10;
        if (length > maxLength) maxLength = length;
      });
      column.width = Math.min(maxLength + 2, 40);
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${clanTag}_${sheetName.replace(' ', '_')}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

    console.log(`✅ Excel file generated with ${data.players.length} players and ${weeksToShow.length} weeks`);

  } catch (error) {
    console.error('❌ Excel export error:', error);
    res.status(500).json({ error: error.message });
  }
});
// In your clanRoutes.js, update the try-catch block
router.get('/:clanTag/daily-tracking', async (req, res) => {
  try {
    const { clanTag } = req.params;
    
    // Check cache (less than 1 hour old)
    const cachedData = await ClanStats.findOne({ 
      clanTag,
      lastUpdated: { $gt: new Date(Date.now() - 60 * 60 * 1000) }
    });
    
    if (cachedData) {
      console.log(`📦 Returning cached data for ${clanTag}`);
      return res.json(cachedData);
    }

    // Scrape fresh data
    console.log(`🆕 Scraping fresh data for ${clanTag}`);
    const scraper = new ClanStatsScraper(clanTag);
    const stats = await scraper.fetchClanStats();

    // Save to MongoDB
    const clanStats = new ClanStats(stats);
    await clanStats.save();

    res.json(stats);
  } catch (error) {
    console.error('❌ Route error:', error);
    
    // Try to return stale data if available
    const staleData = await ClanStats.findOne({ clanTag }).sort({ lastUpdated: -1 });
    if (staleData) {
      console.log('📦 Returning stale data as fallback');
      return res.json({
        ...staleData.toObject(),
        _fallback: true,
        _error: error.message
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;