const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const Device = require('../models/Device');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');

const router = express.Router();

// Register device
router.post('/register', [
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('platform').isIn(['ios', 'android']).withMessage('Invalid platform'),
  body('deviceName').notEmpty().withMessage('Device name is required'),
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

    const { deviceId, platform, deviceName, metadata = {} } = req.body;

    // Check if device already exists
    let device = await Device.findOne({ deviceId });
    
    if (device) {
      // Update existing device
      device.platform = platform;
      device.deviceName = deviceName;
      device.isActive = true;
      device.metadata = { ...device.metadata, ...metadata };
      await device.updateLastSeen();
      
      logger.info(`Device re-registered: ${deviceId}`);
    } else {
      // Create new device
      device = new Device({
        deviceId,
        platform,
        deviceName,
        metadata: {
          ...metadata,
          registrationTime: new Date(),
          lastLoginTime: new Date()
        }
      });
      
      await device.save();
      logger.info(`New device registered: ${deviceId}`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        deviceId: device.deviceId,
        platform: device.platform,
        id: device._id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION || '7d' }
    );

    res.json({
      success: true,
      data: {
        token,
        deviceId: device.deviceId,
        device: {
          id: device._id,
          deviceId: device.deviceId,
          platform: device.platform,
          deviceName: device.deviceName,
          isActive: device.isActive,
          settings: device.settings
        }
      }
    });

  } catch (error) {
    logger.error('Device registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Unregister device
router.post('/unregister', auth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    if (deviceId !== req.user.deviceId) {
      return res.status(403).json({
        success: false,
        error: 'Cannot unregister different device'
      });
    }

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    device.isActive = false;
    await device.save();

    logger.info(`Device unregistered: ${deviceId}`);

    res.json({
      success: true,
      message: 'Device unregistered successfully'
    });

  } catch (error) {
    logger.error('Device unregistration error:', error);
    res.status(500).json({
      success: false,
      error: 'Unregistration failed'
    });
  }
});

// Refresh token
router.post('/refresh', auth, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.user.deviceId });
    
    if (!device || !device.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Device not found or inactive'
      });
    }

    // Update last seen
    await device.updateLastSeen();

    // Generate new token
    const token = jwt.sign(
      { 
        deviceId: device.deviceId,
        platform: device.platform,
        id: device._id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION || '7d' }
    );

    res.json({
      success: true,
      data: { token }
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

// Validate token
router.post('/validate', auth, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.user.deviceId });
    
    if (!device || !device.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        deviceId: device.deviceId,
        platform: device.platform
      }
    });

  } catch (error) {
    logger.error('Token validation error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// Get device info
router.get('/device', auth, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.user.deviceId });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

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
          settings: device.settings,
          metadata: device.metadata,
          createdAt: device.createdAt
        }
      }
    });

  } catch (error) {
    logger.error('Get device info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device info'
    });
  }
});

module.exports = router;