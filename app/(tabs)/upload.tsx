import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { UploadService, UploadQueueItem } from '@/src/services/UploadService';
import { StorageService, FileInfo } from '@/src/services/StorageService';
import { formatBytes } from '@/src/utils/formatters';

interface UploadItemProps {
  item: UploadQueueItem;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

const UploadItem: React.FC<UploadItemProps> = ({ item, onRetry, onDelete }) => {
  const getStatusIcon = () => {
    switch (item.status) {
      case 'pending':
        return <Ionicons name="time" size={20} color="#FF9500" />;
      case 'uploading':
        return <Ionicons name="cloud-upload" size={20} color="#007AFF" />;
      case 'completed':
        return <Ionicons name="checkmark-circle" size={20} color="#34C759" />;
      case 'failed':
        return <Ionicons name="close-circle" size={20} color="#FF3B30" />;
      default:
        return <Ionicons name="help-circle" size={20} color="#8E8E93" />;
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'pending':
        return 'Waiting to upload';
      case 'uploading':
        return `Uploading... ${item.progress || 0}%`;
      case 'completed':
        return 'Upload completed';
      case 'failed':
        return `Failed: ${item.error || 'Unknown error'}`;
      default:
        return 'Unknown status';
    }
  };

  return (
    <View style={styles.uploadItem}>
      <View style={styles.uploadItemHeader}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.fileName}
        </Text>
        <View style={styles.statusContainer}>{getStatusIcon()}</View>
      </View>

      <View style={styles.uploadItemDetails}>
        <Text style={styles.fileSize}>{formatBytes(item.fileSize)}</Text>
        <Text style={styles.timestamp}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
      </View>

      <Text style={styles.statusText}>{getStatusText()}</Text>

      {item.status === 'failed' && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.retryButton]}
            onPress={() => onRetry(item.id)}
          >
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Retry</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => onDelete(item.id)}
          >
            <Ionicons name="trash" size={16} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === 'uploading' && item.progress !== undefined && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${item.progress}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
};

export default function UploadScreen() {
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [localFiles, setLocalFiles] = useState<FileInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState({
    pending: 0,
    uploading: 0,
    completed: 0,
    failed: 0,
    totalSize: 0,
  });

  useEffect(() => {
    loadUploadQueue();
    loadLocalFiles();

    const unsubscribe = UploadService.onQueueUpdate((queue) => {
      setUploadQueue(queue);
      updateStats(queue);
    });

    return unsubscribe;
  }, []);

  const loadUploadQueue = async () => {
    try {
      setIsRefreshing(true);
      const queue = await UploadService.getUploadQueue();
      setUploadQueue(queue);
      updateStats(queue);
      await loadLocalFiles();
    } catch (error) {
      console.error('Failed to load upload queue:', error);
      Alert.alert('Error', 'Failed to load upload queue');
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadLocalFiles = async () => {
    try {
      const files = await StorageService.getLocalFiles();
      setLocalFiles(files);
    } catch (error) {
      console.error('Failed to load local files:', error);
    }
  };

  const updateStats = (queue: UploadQueueItem[]) => {
    const newStats = {
      pending: 0,
      uploading: 0,
      completed: 0,
      failed: 0,
      totalSize: 0,
    };

    queue.forEach((item) => {
      newStats[item.status]++;
      newStats.totalSize += item.fileSize;
    });

    setStats(newStats);
  };

  const handleRetry = async (id: string) => {
    try {
      await UploadService.retryUpload(id);
    } catch (error) {
      console.error('Failed to retry upload:', error);
      Alert.alert('Error', 'Failed to retry upload');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Upload', 'Are you sure you want to delete this upload?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await UploadService.removeFromQueue(id);
            await loadLocalFiles();
          } catch (error) {
            console.error('Failed to delete upload:', error);
            Alert.alert('Error', 'Failed to delete upload');
          }
        },
      },
    ]);
  };

  const handleClearCompleted = () => {
    Alert.alert('Clear Completed', 'Remove all completed uploads from the queue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        onPress: async () => {
          try {
            await UploadService.clearCompleted();
            await loadLocalFiles();
          } catch (error) {
            console.error('Failed to clear completed uploads:', error);
            Alert.alert('Error', 'Failed to clear completed uploads');
          }
        },
      },
    ]);
  };

  const renderUploadItem = ({ item }: { item: UploadQueueItem }) => (
    <UploadItem item={item} onRetry={handleRetry} onDelete={handleDelete} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="cloud-upload-outline" size={64} color="#8E8E93" />
      <Text style={styles.emptyStateText}>No uploads in queue</Text>
      <Text style={styles.emptyStateSubtext}>Start recording to see video uploads here</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upload Queue</Text>
        {stats.completed > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearCompleted}>
            <Text style={styles.clearButtonText}>Clear Completed</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#007AFF' }]}>{stats.uploading}</Text>
          <Text style={styles.statLabel}>Uploading</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#34C759' }]}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#FF3B30' }]}>{stats.failed}</Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
      </View>

      <View style={styles.totalSizeContainer}>
        <Text style={styles.totalSizeText}>Total Size: {formatBytes(stats.totalSize)}</Text>
      </View>

      <View style={styles.localFilesContainer}>
        <Text style={styles.localFilesTitle}>Saved On Device ({localFiles.length})</Text>
        {localFiles.slice(0, 3).map((file) => (
          <View key={file.path} style={styles.localFileRow}>
            <Text style={styles.localFileName} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={styles.localFileMeta}>{formatBytes(file.size)}</Text>
          </View>
        ))}
        {localFiles.length === 0 && <Text style={styles.localFilesEmpty}>No local recordings found yet</Text>}
      </View>

      <FlatList
        data={uploadQueue}
        renderItem={renderUploadItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={uploadQueue.length === 0 ? styles.listEmpty : undefined}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={loadUploadQueue} />}
        ListEmptyComponent={renderEmptyState}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#C6C6C8',
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#000000',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FF3B30',
    borderRadius: 6,
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  totalSizeContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C6C6C8',
  },
  totalSizeText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  localFilesContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#C6C6C8',
  },
  localFilesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  localFileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  localFileName: {
    flex: 1,
    color: '#1C1C1E',
    fontSize: 13,
    marginRight: 10,
  },
  localFileMeta: {
    color: '#8E8E93',
    fontSize: 12,
  },
  localFilesEmpty: {
    color: '#8E8E93',
    fontSize: 13,
  },
  list: {
    flex: 1,
  },
  listEmpty: {
    flexGrow: 1,
  },
  uploadItem: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 10,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  uploadItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  statusContainer: {
    marginLeft: 12,
  },
  uploadItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fileSize: {
    fontSize: 14,
    color: '#8E8E93',
  },
  timestamp: {
    fontSize: 14,
    color: '#8E8E93',
  },
  statusText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  retryButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
  },
});
