const express = require('express');
const { query, param, validationResult } = require('express-validator');

const VideoChunk = require('../models/VideoChunk');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Get all videos for authenticated device
router.get('/', auth, [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
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
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const { startDate, endDate } = req.query;

    let query = { deviceId, isDeleted: false };

    // Add date range filter if provided
    if (startDate || endDate) {
      query.recordedAt = {};
      if (startDate) query.recordedAt.$gte = new Date(startDate);
      if (endDate) query.recordedAt.$lte = new Date(endDate);
    }

    const [videos, totalCount] = await Promise.all([
      VideoChunk.find(query)
        .sort({ recordedAt: -1 })
        .skip(offset)
        .limit(limit),
      VideoChunk.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        videos,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      }
    });

  } catch (error) {
    logger.error('Get videos error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get videos'
    });
  }
});

// Get specific video by ID
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid video ID'),
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
    const videoId = req.params.id;

    const video = await VideoChunk.findOne({
      _id: videoId,
      deviceId,
      isDeleted: false
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found'
      });
    }

    res.json({
      success: true,
      data: { video }
    });

  } catch (error) {
    logger.error('Get video by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get video'
    });
  }
});

// Delete video
router.delete('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid video ID'),
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
    const videoId = req.params.id;

    const video = await VideoChunk.findOne({
      _id: videoId,
      deviceId,
      isDeleted: false
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found'
      });
    }

    // Mark as deleted (soft delete)
    await video.markAsDeleted();

    // Optionally delete from Cloudinary (uncomment if desired)
    /*
    try {
      await cloudinary.uploader.destroy(video.cloudinaryPublicId, {
        resource_type: 'video'
      });
    } catch (cloudinaryError) {
      logger.error('Failed to delete from Cloudinary:', cloudinaryError);
    }
    */

    logger.info(`Video deleted: ${videoId} by ${deviceId}`);

    res.json({
      success: true,
      message: 'Video deleted successfully'
    });

  } catch (error) {
    logger.error('Delete video error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete video'
    });
  }
});

// Get videos by date range
router.get('/date-range/:startDate/:endDate', auth, [
  param('startDate').isISO8601().withMessage('Invalid start date format'),
  param('endDate').isISO8601().withMessage('Invalid end date format'),
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
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    // Validate date range
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date'
      });
    }

    const videos = await VideoChunk.findByDateRange(deviceId, startDate, endDate);

    res.json({
      success: true,
      data: {
        videos,
        dateRange: {
          start: startDate,
          end: endDate
        },
        count: videos.length
      }
    });

  } catch (error) {
    logger.error('Get videos by date range error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get videos by date range'
    });
  }
});

// Get video statistics
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const deviceId = req.user.deviceId;
    
    const stats = await VideoChunk.getStorageStats(deviceId);
    
    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayVideos = await VideoChunk.countDocuments({
      deviceId,
      isDeleted: false,
      recordedAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    res.json({
      success: true,
      data: {
        ...stats,
        todayVideos
      }
    });

  } catch (error) {
    logger.error('Get video statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get video statistics'
    });
  }
});

// Search videos
router.get('/search/:query', auth, async (req, res) => {
  try {
    const deviceId = req.user.deviceId;
    const searchQuery = req.params.query;

    const videos = await VideoChunk.find({
      deviceId,
      isDeleted: false,
      $or: [
        { fileName: { $regex: searchQuery, $options: 'i' } },
        { originalName: { $regex: searchQuery, $options: 'i' } }
      ]
    })
    .sort({ recordedAt: -1 })
    .limit(50);

    res.json({
      success: true,
      data: {
        videos,
        query: searchQuery,
        count: videos.length
      }
    });

  } catch (error) {
    logger.error('Search videos error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search videos'
    });
  }
});

module.exports = router;