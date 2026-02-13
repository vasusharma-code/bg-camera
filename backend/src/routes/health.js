const express = require('express');
const mongoose = require('mongoose');

const Device = require('../models/Device');
const VideoChunk = require('../models/VideoChunk');

const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    // Check MongoDB connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Get basic stats
    const deviceCount = await Device.countDocuments({ isActive: true });
    const videoCount = await VideoChunk.countDocuments({ isDeleted: false });
    
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: {
          status: dbStatus,
          activeDevices: deviceCount,
          totalVideos: videoCount
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

// Detailed status endpoint
router.get('/status', async (req, res) => {
  try {
    const [deviceStats, storageStats] = await Promise.all([
      Device.getDeviceStats(),
      VideoChunk.getStorageStats()
    ]);

    res.json({
      success: true,
      data: {
        status: 'operational',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          host: process.env.MONGODB_URI?.split('@')[1] || 'localhost'
        },
        devices: deviceStats,
        storage: storageStats,
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
          pid: process.pid
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Status check failed',
      details: error.message
    });
  }
});

// Readiness probe
router.get('/ready', async (req, res) => {
  try {
    // Check if MongoDB is ready
    await mongoose.connection.db.admin().ping();
    
    res.json({
      success: true,
      message: 'Service is ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Service not ready',
      details: error.message
    });
  }
});

// Liveness probe
router.get('/live', (req, res) => {
  res.json({
    success: true,
    message: 'Service is alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;