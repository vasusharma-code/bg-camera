# Surveillance Mobile Application

## ⚠️ LEGAL & ETHICAL DISCLAIMER

**IMPORTANT**: This surveillance application is designed for legitimate security purposes only. Users must:
- Comply with all local, state, and federal laws regarding surveillance and recording
- Obtain proper consent from individuals being recorded
- Use only on property you own or have explicit permission to monitor
- Understand that unauthorized surveillance may be illegal and carry serious legal consequences
- Implement proper data protection measures in compliance with privacy regulations (GDPR, CCPA, etc.)

**By using this application, you accept full legal responsibility for its usage.**

---

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile App    │    │   Backend API    │    │   File Storage  │
│                 │    │                  │    │                 │
│ • Camera Record │◄──►│ • Authentication │    │ • Video Chunks  │
│ • Background    │    │ • Upload Handler │◄──►│ • Cloudinary    │
│ • Upload Queue  │    │ • MongoDB        │    │ • Secure URLs   │
│ • Encryption    │    │ • Device Mgmt    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Platform-Specific Behavior

| Feature | Android | iOS |
|---------|---------|-----|
| Background Recording | ✅ Foreground Service | ⚠️ Limited (Background App Refresh) |
| Continuous Recording | ✅ Until camera conflict | ❌ Suspended after 30s-10min |
| Camera Access | ✅ Persistent with notification | ⚠️ Only when app active/recent |
| Battery Optimization | ⚠️ User must whitelist app | ⚠️ System managed |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB 6.0+
- Expo CLI
- Android Studio (for Android testing)
- Xcode (for iOS testing)
- Cloudinary account
- EAS CLI (for production builds)

### 1. Clone and Install

```bash
git clone <your-repo>
cd surveillance-app
npm install
```

### 2. Backend Setup

```bash
cd backend
npm install

# Create .env file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Backend Environment Variables:**
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/surveillance
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
CLOUDINARY_CLOUD_NAME=your-cloudinary-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
UPLOAD_MAX_SIZE=100MB
```

### 3. Start Backend

```bash
# Start MongoDB (if local)
mongod

# Start backend server
cd backend
npm run dev
```

Backend will run on `http://localhost:3000`

### 4. Mobile App Setup

```bash
# Install Expo CLI globally if not installed
npm install -g @expo/cli eas-cli

# Create app.config.js with your backend URL
cp app.config.example.js app.config.js

# Edit configuration
nano app.config.js
```

**Mobile App Environment Variables:**
```javascript
// app.config.js
export default {
  expo: {
    // ... existing config
    extra: {
      apiUrl: 'http://YOUR_BACKEND_IP:3000', // Use your computer's IP for device testing
      environment: 'development'
    }
  }
}
```

### 5. Start Mobile App

```bash
# Start Expo development server
npm run dev

# For device testing, scan QR code with Expo Go app
# For simulator: press 'i' for iOS or 'a' for Android
```

---

## 📱 Development Testing

### Android Testing (Recommended for background recording)

1. **Enable Developer Options:**
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable "Stay Awake" and "USB Debugging"

2. **Disable Battery Optimization:**
   - Settings → Battery → Battery Optimization
   - Find your app → Don't Optimize

3. **Test Foreground Service:**
   - Start recording
   - Minimize app
   - Verify notification shows "Recording in background"
   - Check that recording continues

### iOS Testing (Limited background functionality)

1. **Background App Refresh:**
   - Settings → General → Background App Refresh → Enable for your app

2. **Camera Permissions:**
   - Settings → Privacy & Security → Camera → Enable for your app

3. **Test Background Limitations:**
   - Start recording
   - Minimize app (recording stops after 30 seconds)
   - Return to foreground (recording resumes)

---

## 🏗️ Production Build & Deployment

### Backend Deployment

1. **MongoDB Atlas Setup:**
```bash
# Update MONGODB_URI in production .env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/surveillance
```

2. **Deploy to Render/Railway/Heroku:**
```bash
# Example for Railway
railway login
railway link
railway up
```

### Mobile App Production Build

1. **Configure EAS:**
```bash
eas build:configure
```

2. **Build for Android:**
```bash
# Internal distribution
eas build --platform android --profile preview

# Google Play Store
eas build --platform android --profile production
```

3. **Build for iOS:**
```bash
# TestFlight
eas build --platform ios --profile preview

# App Store
eas build --platform ios --profile production
```

---

## 🔧 Configuration

### Video Recording Settings

Edit `src/services/CameraService.ts`:

```typescript
const RECORDING_CONFIG = {
  chunkDuration: 5 * 60 * 1000, // 5 minutes per chunk
  quality: Camera.Constants.VideoQuality.HD, // Adjust quality
  maxFileSize: 50 * 1024 * 1024, // 50MB per chunk
  codec: Camera.Constants.VideoCodec.H264
};
```

### Upload Settings

Edit `src/services/UploadService.ts`:

```typescript
const UPLOAD_CONFIG = {
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds
  batchSize: 3, // Upload 3 files simultaneously
  deleteAfterUpload: true
};
```

### Security Settings

Edit `backend/config/security.js`:

```javascript
module.exports = {
  jwtExpiration: '7d',
  maxLoginAttempts: 5,
  lockoutTime: 15 * 60 * 1000, // 15 minutes
  uploadEncryption: true
};
```

---

## 🔐 Security Features

- **JWT Authentication** with device binding
- **AES-256 Encryption** for video uploads
- **Rate Limiting** on API endpoints
- **HTTPS Only** in production
- **Signed Upload URLs** from Cloudinary
- **Device Fingerprinting** for session management

---

## 📊 Monitoring & Logs

### Backend Logs
```bash
cd backend
npm run logs
```

### Mobile App Debug
```bash
# View Expo logs
expo start --dev-client
```

### MongoDB Monitoring
```bash
# View database stats
mongo surveillance --eval "db.stats()"
```

---

## 🛠️ Troubleshooting

### Common Issues

1. **"Camera permission denied"**
   - Check device settings → Privacy → Camera
   - Restart app after granting permissions

2. **"Background recording stopped"**
   - Android: Disable battery optimization
   - iOS: Expected behavior, recording resumes on foreground

3. **"Upload failed"**
   - Check internet connection
   - Verify backend is running
   - Check Cloudinary credentials

4. **"Foreground service notification not showing"**
   - Update app permissions
   - Check if notification permissions are granted

### Debug Commands

```bash
# Clear app data (Android)
adb shell pm clear host.exp.exponent

# View device logs
adb logcat | grep -i camera

# Check Expo cache
expo r -c
```

---

## 📚 API Documentation

### Authentication
- `POST /auth/register` - Register device
- `POST /auth/login` - Login device
- `POST /auth/refresh` - Refresh JWT token

### Video Management
- `POST /upload/chunk` - Upload video chunk
- `GET /videos` - List uploaded videos
- `DELETE /videos/:id` - Delete video

### Device Management
- `GET /device/status` - Check device status
- `PUT /device/settings` - Update device settings

---

## 🧪 Testing

### Run Tests
```bash
# Backend tests
cd backend
npm test

# Mobile app tests (if implemented)
npm test
```

### Manual Testing Checklist

- [ ] App launches successfully
- [ ] Camera permission requested and granted
- [ ] Recording starts and creates video files
- [ ] Background recording works (Android)
- [ ] Upload queue processes files
- [ ] Files deleted after successful upload
- [ ] App handles network interruptions
- [ ] Authentication works correctly

---

## 📄 License

This project is licensed under the MIT License. See LICENSE file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📞 Support

For technical support or questions:
- Create an issue in this repository
- Check the troubleshooting section above
- Review platform-specific documentation

**Remember**: This is surveillance software. Use responsibly and legally.