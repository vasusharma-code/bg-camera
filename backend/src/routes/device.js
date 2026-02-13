const express = require('express');
const { body, validationResult } = require('express-validator');

const Device = require('../models/Device');
const VideoChunk = require('../models/VideoChunk');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Get device status
router.get('/status', auth, async (req, res) => {
  try {
    const deviceId = req.user.deviceId;
    
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Get recent upload statistics
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const recentUploads = await VideoChunk.countDocuments({
      deviceId,
      uploadedAt: { $gte: last24Hours },
      isDeleted: false
    });

    const storageStats = await VideoChunk.getStorageStats(deviceId);

    res.json({
      success: true,
      data: {
        device: {
          id: device._id,
          deviceId: device.deviceId,
          platform: device.platform,
          deviceName: device.deviceName,
          isActive: device.isActive,
          lastSeen: device.lastSeen,
          createdAt: device.createdAt
        },
        stats: {
          ...storageStats,
          recentUploads,
          totalUploads: device.metadata.totalVideoUploads,
          totalStorageUsed: device.metadata.totalStorageUsed
        },
        settings: device.settings
      }
    });

  } catch (error) {
    logger.error('Get device status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device status'
    });
  }
});

// Update device settings
router.put('/settings', auth, [
  body('videoQuality').optional().isIn(['480p', '720p', '1080p']).withMessage('Invalid video quality'),
  body('chunkDurationMinutes').optional().isInt({ min: 1, max: 30 }).withMessage('Chunk duration must be between 1 and 30 minutes'),
  body('deleteAfterUpload').optional().isBoolean().withMessage('Delete after upload must be boolean'),
  body('maxRetryAttempts').optional().isInt({ min: 0, max: 10 }).withMessage('Max retry attempts must be between 0 and 10'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const deviceId = req.user.deviceId;
    const updates = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Update settings
    Object.keys(updates).forEach(key => {
      if (device.settings.hasOwnProperty(key)) {
        device.settings[key] = updates[key];
      }
    });

    await device.save();

    logger.info(`Device settings updated: ${deviceId}`);

    res.json({
      success: true,
      data: {
        settings: device.settings
      }
    });

  } catch (error) {
    logger.error('Update device settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device settings'
    });
  }
});

// Update device metadata
router.put('/metadata', auth, [
  body('deviceName').optional().notEmpty().withMessage('Device name cannot be empty'),
  body('appVersion').optional().isString().withMessage('App version must be string'),
  body('platformVersion').optional().isString().withMessage('Platform version must be string'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const deviceId = req.user.deviceId;
    const updates = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Update metadata
    if (updates.deviceName) {
      device.deviceName = updates.deviceName;
    }

    Object.keys(updates).forEach(key => {
      if (key !== 'deviceName' && device.metadata.hasOwnProperty(key)) {
        device.metadata[key] = updates[key];
      }
    });

    await device.save();

    logger.info(`Device metadata updated: ${deviceId}`);

    res.json({
      success: true,
      data: {
        device: {
          id: device._id,
          deviceId: device.deviceId,
          platform: device.platform,
          deviceName: device.deviceName,
          metadata: device.metadata
        }
      }
    });

  } catch (error) {
    logger.error('Update device metadata error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device metadata'
    });
  }
});

// Get device activity log
router.get('/activity', auth, async (req, res) => {
  try {
    const deviceId = req.user.deviceId;
    const limit = parseInt(req.query.limit) || 20;

    // Get recent video uploads as activity
    const recentUploads = await VideoChunk.find({
      deviceId,
      isDeleted: false
    })
    .sort({ uploadedAt: -1 })
    .limit(limit)
    .select('fileName uploadedAt fileSize recordedAt');

    const activities = recentUploads.map(upload => ({
      type: 'video_upload',
      timestamp: upload.uploadedAt,
      data: {
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        recordedAt: upload.recordedAt
      }
    }));

    res.json({
      success: true,
      data: {
        activities,
        count: activities.length
      }
    });

  } catch (error) {
    logger.error('Get device activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device activity'
    });
  }
});

// Deactivate device
router.post('/deactivate', auth, async (req, res) => {
  try {
    const deviceId = req.user.deviceId;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    device.isActive = false;
    await device.save();

    logger.info(`Device deactivated: ${deviceId}`);

    res.json({
      success: true,
      message: 'Device deactivated successfully'
    });

  } catch (error) {
    logger.error('Deactivate device error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate device'
    });
  }
});

// Reactivate device
router.post('/reactivate', auth, async (req, res) => {
  try {
    const deviceId = req.user.deviceId;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    device.isActive = true;
    await device.updateLastSeen();

    logger.info(`Device reactivated: ${deviceId}`);

    res.json({
      success: true,
      message: 'Device reactivated successfully'
    });

  } catch (error) {
    logger.error('Reactivate device error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reactivate device'
    });
  }
});

module.exports = router;