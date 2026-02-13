const jwt = require('jsonwebtoken');
const Device = require('../models/Device');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No valid token provided.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if device exists and is active
    const device = await Device.findOne({ 
      deviceId: decoded.deviceId,
      isActive: true 
    });

    if (!device) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. Device not found or inactive.'
      });
    }

    // Add user info to request
    req.user = {
      id: decoded.id,
      deviceId: decoded.deviceId,
      platform: decoded.platform
    };

    // Update last seen (optional - uncomment if you want to track activity)
    // await device.updateLastSeen();

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

module.exports = auth;