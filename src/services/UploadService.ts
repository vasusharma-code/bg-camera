import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { VideoChunk } from './CameraService';
import { AuthService } from './AuthService';
import { SettingsService } from './SettingsService';
import { APIService } from './APIService';

export interface UploadQueueItem {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  createdAt: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  retryCount: number;
  metadata: {
    chunkIndex: number;
    duration: number;
    timestamp: number;
  };
}

type QueueUpdateCallback = (queue: UploadQueueItem[]) => void;

class UploadServiceClass {
  private uploadQueue: UploadQueueItem[] = [];
  private isProcessing = false;
  private callbacks: QueueUpdateCallback[] = [];
  private uploadPromises: Map<string, Promise<void>> = new Map();

  private readonly QUEUE_STORAGE_KEY = 'upload_queue';
  private readonly MAX_CONCURRENT_UPLOADS = 3;
  private readonly RETRY_DELAY_BASE = 5000; // 5 seconds

  async initialize(): Promise<void> {
    try {
      await this.loadQueueFromStorage();
      await this.resumePendingUploads();
      console.log('Upload service initialized');
    } catch (error) {
      console.error('Failed to initialize upload service:', error);
    }
  }

  async addToQueue(chunk: VideoChunk): Promise<void> {
    const item: UploadQueueItem = {
      id: this.generateUploadId(),
      fileName: this.extractFileName(chunk.path),
      filePath: chunk.path,
      fileSize: chunk.size,
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
      metadata: {
        chunkIndex: chunk.chunkIndex,
        duration: chunk.duration,
        timestamp: chunk.timestamp,
      },
    };

    this.uploadQueue.push(item);
    await this.saveQueueToStorage();
    this.notifyQueueUpdate();

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    console.log('Added to upload queue:', item.fileName);
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const settings = await SettingsService.getSettings();

      // Check network conditions
      if (settings.wifiOnlyUpload && !await this.isConnectedToWifi()) {
        console.log('WiFi-only mode enabled, skipping upload');
        return;
      }

      // Get pending items
      const pendingItems = this.uploadQueue.filter(item => item.status === 'pending');

      if (pendingItems.length === 0) {
        console.log('No pending uploads');
        return;
      }

      // Process items in batches
      const batches = this.createBatches(pendingItems, this.MAX_CONCURRENT_UPLOADS);

      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(item => this.uploadItem(item))
        );
      }

    } catch (error) {
      console.error('Error processing upload queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async uploadItem(item: UploadQueueItem): Promise<void> {
    if (this.uploadPromises.has(item.id)) {
      return this.uploadPromises.get(item.id)!;
    }

    const uploadPromise = this.performUpload(item);
    this.uploadPromises.set(item.id, uploadPromise);

    try {
      await uploadPromise;
    } finally {
      this.uploadPromises.delete(item.id);
    }
  }

  private async performUpload(item: UploadQueueItem): Promise<void> {
    try {
      // Update status to uploading
      item.status = 'uploading';
      item.progress = 0;
      await this.saveQueueToStorage();
      this.notifyQueueUpdate();

      // Check if file still exists
      const fileInfo = await FileSystem.getInfoAsync(item.filePath);
      if (!fileInfo.exists) {
        throw new Error('File no longer exists');
      }

      // Get upload URL and upload file
      const uploadResult = await APIService.uploadVideoChunk({
        filePath: item.filePath,
        fileName: item.fileName,
        metadata: {
          ...item.metadata,
          deviceId: await AuthService.getDeviceId(),
          platform: Platform.OS,
        },
        onProgress: (progress) => {
          item.progress = progress;
          this.notifyQueueUpdate();
        },
      });

      // Mark as completed
      item.status = 'completed';
      item.progress = 100;

      // Delete local file if setting is enabled
      const settings = await SettingsService.getSettings();
      if (settings.deleteAfterUpload) {
        try {
          await FileSystem.deleteAsync(item.filePath);
          console.log('Deleted local file after upload:', item.fileName);
        } catch (error) {
          console.error('Failed to delete local file:', error);
        }
      }

      console.log('Upload completed:', item.fileName);

    } catch (error) {
      console.error('Upload failed:', item.fileName, error);

      // Handle retry logic
      const settings = await SettingsService.getSettings();
      if (item.retryCount < settings.maxRetryAttempts) {
        item.status = 'pending';
        item.retryCount++;
        item.error = (error as Error).message;

        // Schedule retry with exponential backoff
        const delay = this.RETRY_DELAY_BASE * Math.pow(2, item.retryCount - 1);
        setTimeout(() => {
          if (item.status === 'pending') {
            this.processQueue();
          }
        }, delay);

        console.log(`Scheduled retry ${item.retryCount}/${settings.maxRetryAttempts} for ${item.fileName} in ${delay}ms`);
      } else {
        item.status = 'failed';
        item.error = (error as Error).message;
      }
    } finally {
      await this.saveQueueToStorage();
      this.notifyQueueUpdate();
    }
  }

  async retryUpload(itemId: string): Promise<void> {
    const item = this.uploadQueue.find(item => item.id === itemId);
    if (!item || item.status !== 'failed') {
      return;
    }

    item.status = 'pending';
    item.retryCount = 0;
    item.error = undefined;

    await this.saveQueueToStorage();
    this.notifyQueueUpdate();

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async removeFromQueue(itemId: string): Promise<void> {
    const index = this.uploadQueue.findIndex(item => item.id === itemId);
    if (index === -1) {
      return;
    }

    const item = this.uploadQueue[index];

    // Delete local file if it exists
    try {
      const fileInfo = await FileSystem.getInfoAsync(item.filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(item.filePath);
      }
    } catch (error) {
      console.error('Failed to delete file when removing from queue:', error);
    }

    this.uploadQueue.splice(index, 1);
    await this.saveQueueToStorage();
    this.notifyQueueUpdate();
  }

  async clearCompleted(): Promise<void> {
    this.uploadQueue = this.uploadQueue.filter(item => item.status !== 'completed');
    await this.saveQueueToStorage();
    this.notifyQueueUpdate();
  }

  async getUploadQueue(): Promise<UploadQueueItem[]> {
    return [...this.uploadQueue];
  }

  onQueueUpdate(callback: QueueUpdateCallback): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  private notifyQueueUpdate(): void {
    this.callbacks.forEach(callback => callback([...this.uploadQueue]));
  }

  private async saveQueueToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.QUEUE_STORAGE_KEY, JSON.stringify(this.uploadQueue));
    } catch (error) {
      console.error('Failed to save queue to storage:', error);
    }
  }

  private async loadQueueFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.QUEUE_STORAGE_KEY);
      if (stored) {
        this.uploadQueue = JSON.parse(stored);

        // Reset uploading items to pending on app start
        this.uploadQueue.forEach(item => {
          if (item.status === 'uploading') {
            item.status = 'pending';
            item.progress = 0;
          }
        });

        this.notifyQueueUpdate();
      }
    } catch (error) {
      console.error('Failed to load queue from storage:', error);
      this.uploadQueue = [];
    }
  }

  private async resumePendingUploads(): Promise<void> {
    const pendingCount = this.uploadQueue.filter(item => item.status === 'pending').length;
    if (pendingCount > 0) {
      console.log(`Resuming ${pendingCount} pending uploads`);
      this.processQueue();
    }
  }

  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private extractFileName(filePath: string): string {
    return filePath.split('/').pop() || 'unknown.mp4';
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async isConnectedToWifi(): Promise<boolean> {
    // This would need a network info library
    // For now, return true (assume connected)
    return true;
  }

  // Get upload statistics
  getUploadStats() {
    const stats = {
      total: this.uploadQueue.length,
      pending: 0,
      uploading: 0,
      completed: 0,
      failed: 0,
      totalSize: 0,
    };

    this.uploadQueue.forEach(item => {
      stats[item.status]++;
      stats.totalSize += item.fileSize;
    });

    return stats;
  }
}

export const UploadService = new UploadServiceClass();