/**
 * AI Routes for Hugging Face Graph Explanations & Maintenance Recommendations.
 * 
 * Endpoints:
 * POST /api/ai/explain-graph
 * POST /api/ai/recommend-maintenance
 */

const express = require('express');
const router = express.Router();
const huggingFaceService = require('../services/huggingFaceService');

// POST /api/ai/explain-graph
router.post('/explain-graph', async (req, res) => {
  try {
    const { graph_type, chart_statistics, operating_conditions, predicted_class } = req.body;
    if (!graph_type) {
      return res.status(400).json({
        status: 'ERROR',
        message: "Missing 'graph_type' field (e.g. 'waveform', 'spectrum', 'features', 'probabilities', 'confusion_matrix').",
      });
    }

    const result = await huggingFaceService.explainGraphWithAi(
      graph_type,
      chart_statistics || {},
      operating_conditions || {},
      predicted_class || 'HEALTHY'
    );

    res.json({
      status: 'SUCCESS',
      data: result,
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      message: err.message,
    });
  }
});

// POST /api/ai/recommend-maintenance
router.post('/recommend-maintenance', async (req, res) => {
  try {
    const { diagnostic_run, motor } = req.body;
    if (!diagnostic_run) {
      return res.status(400).json({
        status: 'ERROR',
        message: "Missing 'diagnostic_run' object in request body.",
      });
    }

    const result = await huggingFaceService.recommendMaintenanceWithAi(
      diagnostic_run,
      motor || {}
    );

    res.json({
      status: 'SUCCESS',
      data: result,
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      message: err.message,
    });
  }
});

module.exports = router;
