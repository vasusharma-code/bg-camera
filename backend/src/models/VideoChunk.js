const mongoose = require('mongoose');

const videoChunkSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  chunkIndex: {
    type: Number,
    required: true
  },
  duration: {
    type: Number, // Duration in milliseconds
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  cloudinaryUrl: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  recordedAt: {
    type: Date,
    required: true
  },
  metadata: {
    platform: {
      type: String,
      enum: ['ios', 'android']
    },
    videoQuality: String,
    codec: String,
    resolution: String,
    fps: Number,
    hasAudio: {
      type: Boolean,
      default: true
    }
  },
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'ready', 'error'],
    default: 'uploaded'
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Compound indexes
videoChunkSchema.index({ deviceId: 1, recordedAt: -1 });
videoChunkSchema.index({ uploadedAt: -1 });
videoChunkSchema.index({ status: 1, isDeleted: 1 });
videoChunkSchema.index({ 'metadata.platform': 1 });

// Methods
videoChunkSchema.methods.markAsDeleted = function() {
  this.isDeleted = true;
  return this.save();
};

videoChunkSchema.methods.updateStatus = function(status) {
  this.status = status;
  return this.save();
};

// Statics
videoChunkSchema.statics.findByDevice = function(deviceId, options = {}) {
  const query = { deviceId, isDeleted: false };
  
  let mongoQuery = this.find(query);
  
  if (options.limit) {
    mongoQuery = mongoQuery.limit(options.limit);
  }
  
  if (options.sort) {
    mongoQuery = mongoQuery.sort(options.sort);
  } else {
    mongoQuery = mongoQuery.sort({ recordedAt: -1 });
  }
  
  return mongoQuery;
};

videoChunkSchema.statics.findByDateRange = function(deviceId, startDate, endDate) {
  return this.find({
    deviceId,
    isDeleted: false,
    recordedAt: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ recordedAt: -1 });
};

videoChunkSchema.statics.getStorageStats = async function(deviceId = null) {
  const matchStage = { isDeleted: false };
  if (deviceId) {
    matchStage.deviceId = deviceId;
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: deviceId ? '$deviceId' : null,
        totalChunks: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        totalDuration: { $sum: '$duration' },
        avgFileSize: { $avg: '$fileSize' },
        oldestRecording: { $min: '$recordedAt' },
        newestRecording: { $max: '$recordedAt' }
      }
    }
  ]);

  return stats[0] || {
    totalChunks: 0,
    totalSize: 0,
    totalDuration: 0,
    avgFileSize: 0,
    oldestRecording: null,
    newestRecording: null
  };
};

videoChunkSchema.statics.getDeviceStats = async function() {
  return this.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: '$deviceId',
        totalChunks: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        totalDuration: { $sum: '$duration' },
        lastUpload: { $max: '$uploadedAt' },
        firstUpload: { $min: '$uploadedAt' }
      }
    },
    { $sort: { totalChunks: -1 } }
  ]);
};

videoChunkSchema.statics.cleanupOldChunks = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.updateMany(
    {
      recordedAt: { $lt: cutoffDate },
      isDeleted: false
    },
    {
      $set: { isDeleted: true }
    }
  );
};

module.exports = mongoose.model('VideoChunk', videoChunkSchema);