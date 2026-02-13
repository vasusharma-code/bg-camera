const mongoose = require('mongoose');
require('dotenv').config();

const Device = require('../models/Device');
const VideoChunk = require('../models/VideoChunk');

async function seedDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await Device.deleteMany({});
    await VideoChunk.deleteMany({});

    // Create sample devices
    console.log('Creating sample devices...');
    const devices = [
      {
        deviceId: 'android_test_device_001',
        platform: 'android',
        deviceName: 'Android Test Device 1',
        isActive: true,
        metadata: {
          appVersion: '1.0.0',
          platformVersion: '13.0',
          registrationTime: new Date(),
          lastLoginTime: new Date(),
          totalVideoUploads: 15,
          totalStorageUsed: 150000000 // 150MB
        },
        settings: {
          videoQuality: '720p',
          chunkDurationMinutes: 5,
          deleteAfterUpload: true,
          maxRetryAttempts: 3
        }
      },
      {
        deviceId: 'ios_test_device_001',
        platform: 'ios',
        deviceName: 'iPhone Test Device 1',
        isActive: true,
        metadata: {
          appVersion: '1.0.0',
          platformVersion: '17.0',
          registrationTime: new Date(),
          lastLoginTime: new Date(),
          totalVideoUploads: 8,
          totalStorageUsed: 80000000 // 80MB
        },
        settings: {
          videoQuality: '1080p',
          chunkDurationMinutes: 3,
          deleteAfterUpload: false,
          maxRetryAttempts: 5
        }
      }
    ];

    const createdDevices = await Device.insertMany(devices);
    console.log(`Created ${createdDevices.length} sample devices`);

    // Create sample video chunks
    console.log('Creating sample video chunks...');
    const videoChunks = [];
    
    createdDevices.forEach((device, deviceIndex) => {
      for (let i = 0; i < 10; i++) {
        const recordedAt = new Date();
        recordedAt.setHours(recordedAt.getHours() - i * 2);
        
        videoChunks.push({
          fileName: `surveillance_${device.deviceId}_${Date.now() - i * 7200000}_chunk${i}.mp4`,
          originalName: `chunk_${i}.mp4`,
          deviceId: device.deviceId,
          chunkIndex: i,
          duration: 300000, // 5 minutes in ms
          fileSize: 10000000 + Math.random() * 5000000, // 10-15MB
          cloudinaryUrl: `https://res.cloudinary.com/demo/video/upload/v1/surveillance/${device.deviceId}/sample_${i}.mp4`,
          cloudinaryPublicId: `surveillance/${device.deviceId}/sample_${i}`,
          uploadedAt: recordedAt,
          recordedAt: recordedAt,
          metadata: {
            platform: device.platform,
            videoQuality: device.settings.videoQuality,
            hasAudio: true
          },
          status: 'ready',
          isDeleted: false
        });
      }
    });

    const createdVideoChunks = await VideoChunk.insertMany(videoChunks);
    console.log(`Created ${createdVideoChunks.length} sample video chunks`);

    console.log('Database seeded successfully!');
    
    // Print summary
    const deviceCount = await Device.countDocuments();
    const videoCount = await VideoChunk.countDocuments();
    const totalStorage = await VideoChunk.aggregate([
      { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
    ]);

    console.log('\n--- Seed Summary ---');
    console.log(`Devices: ${deviceCount}`);
    console.log(`Video Chunks: ${videoCount}`);
    console.log(`Total Storage: ${Math.round(totalStorage[0]?.totalSize / 1024 / 1024)} MB`);
    
  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run seed if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;