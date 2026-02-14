import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { SettingsService } from './SettingsService';

export interface StorageInfo {
  totalSize: number;
  fileCount: number;
  oldestFile?: string;
  newestFile?: string;
}

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  createdAt: number;
  modifiedAt: number;
}

class StorageServiceClass {
  private readonly SURVEILLANCE_DIR = `${FileSystem.documentDirectory}surveillance_chunks/`;

  async initialize(): Promise<void> {
    try {
      // Ensure surveillance directory exists
      await FileSystem.makeDirectoryAsync(this.SURVEILLANCE_DIR, {
        intermediates: true,
      });
      
      console.log('Storage service initialized');
    } catch (error) {
      console.error('Failed to initialize storage service:', error);
      throw error;
    }
  }

  async getLocalStorageInfo(): Promise<StorageInfo> {
    try {
      const files = await this.getLocalFiles();
      
      let totalSize = 0;
      let oldestTime = Number.MAX_SAFE_INTEGER;
      let newestTime = 0;
      let oldestFile: string | undefined;
      let newestFile: string | undefined;

      for (const file of files) {
        totalSize += file.size;
        
        if (file.createdAt < oldestTime) {
          oldestTime = file.createdAt;
          oldestFile = file.name;
        }
        
        if (file.createdAt > newestTime) {
          newestTime = file.createdAt;
          newestFile = file.name;
        }
      }

      return {
        totalSize,
        fileCount: files.length,
        oldestFile,
        newestFile,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      throw error;
    }
  }

  async getLocalFiles(): Promise<FileInfo[]> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.SURVEILLANCE_DIR);
      if (!dirInfo.exists || !dirInfo.isDirectory) {
        return [];
      }

      const fileNames = await FileSystem.readDirectoryAsync(this.SURVEILLANCE_DIR);
      const files: FileInfo[] = [];

      for (const fileName of fileNames) {
        const filePath = `${this.SURVEILLANCE_DIR}${fileName}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        
        if (fileInfo.exists && !fileInfo.isDirectory) {
          files.push({
            path: filePath,
            name: fileName,
            size: fileInfo.size || 0,
            createdAt: fileInfo.modificationTime || 0,
            modifiedAt: fileInfo.modificationTime || 0,
          });
        }
      }

      // Sort by creation time (newest first)
      files.sort((a, b) => b.createdAt - a.createdAt);
      
      return files;
    } catch (error) {
      console.error('Failed to get local files:', error);
      return [];
    }
  }

  async clearLocalFiles(): Promise<void> {
    try {
      const files = await this.getLocalFiles();
      
      for (const file of files) {
        try {
          await FileSystem.deleteAsync(file.path);
        } catch (error) {
          console.error(`Failed to delete file ${file.name}:`, error);
        }
      }
      
      console.log(`Cleared ${files.length} local files`);
    } catch (error) {
      console.error('Failed to clear local files:', error);
      throw error;
    }
  }

  async deleteOldFiles(maxAgeHours: number = 24): Promise<number> {
    try {
      const files = await this.getLocalFiles();
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.createdAt < cutoffTime) {
          try {
            await FileSystem.deleteAsync(file.path);
            deletedCount++;
          } catch (error) {
            console.error(`Failed to delete old file ${file.name}:`, error);
          }
        }
      }
      
      if (deletedCount > 0) {
        console.log(`Deleted ${deletedCount} old files`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Failed to delete old files:', error);
      throw error;
    }
  }

  async cleanupStorageIfNeeded(): Promise<void> {
    try {
      const settings = await SettingsService.getSettings();
      const storageInfo = await this.getLocalStorageInfo();
      const maxStorageBytes = settings.maxLocalStorageGB * 1024 * 1024 * 1024;

      if (storageInfo.totalSize > maxStorageBytes) {
        await this.cleanupStorage(maxStorageBytes * 0.8); // Clean to 80% of limit
      }

      // Also delete old files if auto-delete is enabled
      if (settings.autoDeleteOldFiles) {
        await this.deleteOldFiles(24); // Delete files older than 24 hours
      }
    } catch (error) {
      console.error('Failed to cleanup storage:', error);
      throw error;
    }
  }

  private async cleanupStorage(targetSize: number): Promise<void> {
    try {
      const files = await this.getLocalFiles();
      
      // Sort by oldest first for deletion
      files.sort((a, b) => a.createdAt - b.createdAt);
      
      let currentSize = files.reduce((sum, file) => sum + file.size, 0);
      let deletedCount = 0;

      for (const file of files) {
        if (currentSize <= targetSize) {
          break;
        }

        try {
          await FileSystem.deleteAsync(file.path);
          currentSize -= file.size;
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete file during cleanup ${file.name}:`, error);
        }
      }

      console.log(`Storage cleanup: deleted ${deletedCount} files`);
    } catch (error) {
      console.error('Failed to cleanup storage:', error);
      throw error;
    }
  }

  async moveFileToUploadFolder(filePath: string): Promise<string> {
    try {
      const fileName = filePath.split('/').pop() || 'unknown.mp4';
      const uploadDir = `${FileSystem.documentDirectory}upload_queue/`;
      const newPath = `${uploadDir}${fileName}`;

      // Ensure upload directory exists
      await FileSystem.makeDirectoryAsync(uploadDir, { intermediates: true });

      // Move file
      await FileSystem.moveAsync({
        from: filePath,
        to: newPath,
      });

      return newPath;
    } catch (error) {
      console.error('Failed to move file to upload folder:', error);
      throw error;
    }
  }

  async getAvailableStorageSpace(): Promise<number> {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Get available space
        const freeSpace = await FileSystem.getFreeDiskStorageAsync();
        return freeSpace;
      } else {
        // Android: Estimate based on total space
        const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
        const freeSpace = await FileSystem.getFreeDiskStorageAsync();
        return freeSpace;
      }
    } catch (error) {
      console.error('Failed to get available storage space:', error);
      return 0;
    }
  }

  // Check if there's enough space for recording
  async hasEnoughSpaceForRecording(estimatedFileSizeBytes: number): Promise<boolean> {
    try {
      const freeSpace = await this.getAvailableStorageSpace();
      const safetyBuffer = 100 * 1024 * 1024; // 100MB safety buffer
      
      return freeSpace > (estimatedFileSizeBytes + safetyBuffer);
    } catch (error) {
      console.error('Failed to check available space:', error);
      return false;
    }
  }

  // Estimate file size for given duration and quality
  estimateFileSize(durationMinutes: number, quality: string): number {
    // Rough estimates in bytes per minute
    const bitrates = {
      '480p': 2 * 1024 * 1024, // 2MB per minute
      '720p': 4 * 1024 * 1024, // 4MB per minute
      '1080p': 8 * 1024 * 1024, // 8MB per minute
    };

    const bytesPerMinute = bitrates[quality as keyof typeof bitrates] || bitrates['720p'];
    return durationMinutes * bytesPerMinute;
  }

  // Get storage statistics
  async getStorageStats() {
    try {
      const storageInfo = await this.getLocalStorageInfo();
      const freeSpace = await this.getAvailableStorageSpace();
      const settings = await SettingsService.getSettings();
      
      return {
        localFiles: storageInfo.fileCount,
        localSize: storageInfo.totalSize,
        freeSpace,
        maxStorage: settings.maxLocalStorageGB * 1024 * 1024 * 1024,
        usagePercent: (storageInfo.totalSize / (settings.maxLocalStorageGB * 1024 * 1024 * 1024)) * 100,
        oldestFile: storageInfo.oldestFile,
        newestFile: storageInfo.newestFile,
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw error;
    }
  }
}

export const StorageService = new StorageServiceClass();