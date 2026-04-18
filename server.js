const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const RESULTS_FILE = path.join(__dirname, 'results.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Ensure results file exists
async function ensureResultsFile() {
  try {
    await fs.access(RESULTS_FILE);
  } catch {
    await fs.writeFile(RESULTS_FILE, JSON.stringify([], null, 2));
  }
}

// Save results endpoint
app.post('/api/results', async (req, res) => {
  try {
    await ensureResultsFile();
    
    const { scores, hero, timestamp = new Date().toISOString() } = req.body;
    
    // Validate
    if (!scores || !hero) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Read existing results
    const data = await fs.readFile(RESULTS_FILE, 'utf8');
    const results = JSON.parse(data);
    
    // Add new result (without personal data)
    const newResult = {
      id: Date.now(),
      timestamp,
      scores,
      hero,
      // No IP, no personal info for privacy
    };
    
    results.push(newResult);
    
    // Save back
    await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Result saved (anonymously)',
      id: newResult.id
    });
    
  } catch (error) {
    console.error('Error saving result:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get aggregated stats
app.get('/api/stats', async (req, res) => {
  try {
    await ensureResultsFile();
    
    const data = await fs.readFile(RESULTS_FILE, 'utf8');
    const results = JSON.parse(data);
    
    if (results.length === 0) {
      return res.json({
        total: 0,
        heroes: {},
        averageScores: { К: 0, П: 0, Г: 0, Э: 0 }
      });
    }
    
    // Count heroes
    const heroes = {};
    const totalScores = { К: 0, П: 0, Г: 0, Э: 0 };
    
    results.forEach(result => {
      heroes[result.hero] = (heroes[result.hero] || 0) + 1;
      
      // Sum scores
      for (const [school, score] of Object.entries(result.scores)) {
        totalScores[school] = (totalScores[school] || 0) + score;
      }
    });
    
    // Calculate averages
    const averageScores = {};
    for (const [school, total] of Object.entries(totalScores)) {
      averageScores[school] = total / results.length;
    }
    
    res.json({
      total: results.length,
      heroes,
      averageScores,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Therapy Funnel server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  POST /api/results - Save test results`);
  console.log(`  GET  /api/stats   - Get aggregated statistics`);
  console.log(`  GET  /api/health  - Health check`);
});

module.exports = app;