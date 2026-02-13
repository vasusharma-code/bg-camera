const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { v2: cloudinary } = require('cloudinary');

const VideoChunk = require('../models/VideoChunk');
const Device = require('../models/Device');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for video uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'mp4,mov,avi').split(',');
    const fileType = file.originalname.split('.').pop().toLowerCase();
    
    if (allowedTypes.includes(fileType)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
});

// Get upload URL (for direct uploads)
router.post('/url', auth, [
  body('fileName').notEmpty().withMessage('File name is required'),
  body('metadata').isObject().withMessage('Metadata must be an object'),
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

    const { fileName, metadata } = req.body;
    const deviceId = req.user.deviceId;

    // Generate signed upload URL from Cloudinary
    const timestamp = Math.round(new Date().getTime() / 1000);
    const publicId = `surveillance/${deviceId}/${Date.now()}_${fileName}`;

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        public_id: publicId,
        folder: 'surveillance',
        resource_type: 'video'
      },
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      success: true,
      data: {
        uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
        fields: {
          timestamp,
          public_id: publicId,
          signature,
          api_key: process.env.CLOUDINARY_API_KEY,
          folder: 'surveillance',
          resource_type: 'video'
        }
      }
    });

  } catch (error) {
    logger.error('Get upload URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get upload URL'
    });
  }
});

// Upload video chunk directly
router.post('/chunk', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const deviceId = req.user.deviceId;
    const metadata = JSON.parse(req.body.metadata || '{}');

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'surveillance',
          public_id: `surveillance/${deviceId}/${Date.now()}_${req.file.originalname}`,
          overwrite: false
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      uploadStream.end(req.file.buffer);
    });

    // Save video chunk metadata to database
    const videoChunk = new VideoChunk({
      fileName: req.file.originalname,
      originalName: req.file.originalname,
      deviceId,
      chunkIndex: metadata.chunkIndex || 0,
      duration: metadata.duration || 0,
      fileSize: req.file.size,
      cloudinaryUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      recordedAt: new Date(metadata.timestamp || Date.now()),
      metadata: {
        platform: metadata.platform,
        videoQuality: metadata.videoQuality,
        hasAudio: metadata.hasAudio !== false
      }
    });

    await videoChunk.save();

    // Update device stats
    const device = await Device.findOne({ deviceId });
    if (device) {
      await device.incrementUploadStats(req.file.size);
    }

    logger.info(`Video chunk uploaded: ${req.file.originalname} by ${deviceId}`);

    res.json({
      success: true,
      data: {
        videoChunkId: videoChunk._id,
        cloudinaryUrl: uploadResult.secure_url,
        fileSize: req.file.size,
        uploadedAt: videoChunk.uploadedAt
      }
    });

  } catch (error) {
    logger.error('Video chunk upload error:', error);
    
    if (error.message.includes('File size too large')) {
      return res.status(413).json({
        success: false,
        error: 'File size too large'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Upload failed'
    });
  }
});

// Process Cloudinary webhook (for upload completion)
router.post('/webhook/cloudinary', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature (implement if needed)
    const data = JSON.parse(req.body.toString());
    
    if (data.notification_type === 'upload' && data.resource_type === 'video') {
      // Update video chunk status
      const videoChunk = await VideoChunk.findOne({
        cloudinaryPublicId: data.public_id
      });

      if (videoChunk) {
        videoChunk.status = 'ready';
        await videoChunk.save();
        
        logger.info(`Video processing completed: ${data.public_id}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Cloudinary webhook error:', error);
    res.status(500).send('Error');
  }
});

// Get upload statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const deviceId = req.user.deviceId;
    
    const stats = await VideoChunk.getStorageStats(deviceId);
    
    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Get upload stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get upload statistics'
    });
  }
});

module.exports = router;