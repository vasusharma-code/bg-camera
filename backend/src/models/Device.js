const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['ios', 'android']
  },
  deviceName: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  metadata: {
    appVersion: String,
    platformVersion: String,
    registrationTime: Date,
    lastLoginTime: Date,
    totalVideoUploads: {
      type: Number,
      default: 0
    },
    totalStorageUsed: {
      type: Number,
      default: 0
    }
  },
  settings: {
    videoQuality: {
      type: String,
      enum: ['480p', '720p', '1080p'],
      default: '720p'
    },
    chunkDurationMinutes: {
      type: Number,
      min: 1,
      max: 30,
      default: 5
    },
    deleteAfterUpload: {
      type: Boolean,
      default: true
    },
    maxRetryAttempts: {
      type: Number,
      min: 0,
      max: 10,
      default: 3
    }
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

// Indexes
deviceSchema.index({ platform: 1, isActive: 1 });
deviceSchema.index({ lastSeen: 1 });
deviceSchema.index({ createdAt: 1 });

// Methods
deviceSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date();
  this.metadata.lastLoginTime = new Date();
  return this.save();
};

deviceSchema.methods.incrementUploadStats = function(fileSize) {
  this.metadata.totalVideoUploads += 1;
  this.metadata.totalStorageUsed += fileSize;
  return this.save();
};

// Statics
deviceSchema.statics.findActiveDevices = function() {
  return this.find({ isActive: true });
};

deviceSchema.statics.findByPlatform = function(platform) {
  return this.find({ platform, isActive: true });
};

deviceSchema.statics.getDeviceStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalDevices: { $sum: 1 },
        activeDevices: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        iosDevices: {
          $sum: { $cond: [{ $eq: ['$platform', 'ios'] }, 1, 0] }
        },
        androidDevices: {
          $sum: { $cond: [{ $eq: ['$platform', 'android'] }, 1, 0] }
        },
        totalUploads: { $sum: '$metadata.totalVideoUploads' },
        totalStorage: { $sum: '$metadata.totalStorageUsed' }
      }
    }
  ]);

  return stats[0] || {
    totalDevices: 0,
    activeDevices: 0,
    iosDevices: 0,
    androidDevices: 0,
    totalUploads: 0,
    totalStorage: 0
  };
};

module.exports = mongoose.model('Device', deviceSchema);