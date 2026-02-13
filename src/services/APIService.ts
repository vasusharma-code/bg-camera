import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface RegisterDeviceRequest {
  deviceId: string;
  platform: string;
  deviceName: string;
  metadata: Record<string, any>;
}

interface RegisterDeviceResponse {
  token: string;
  deviceId: string;
}

interface RefreshTokenResponse {
  token: string;
}

interface UploadChunkRequest {
  filePath: string;
  fileName: string;
  metadata: {
    chunkIndex: number;
    duration: number;
    timestamp: number;
    deviceId: string;
    platform: string;
  };
  onProgress?: (progress: number) => void;
}

class APIServiceClass {
  private baseURL: string;

  constructor() {
    this.baseURL = API_BASE_URL;
    console.log('API Service initialized with base URL:', this.baseURL);
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      
      const defaultHeaders = {
        'Content-Type': 'application/json',
      };

      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.success && data.error) {
        throw new Error(data.error);
      }

      return data;
    } catch (error) {
      console.error(`API Request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const { AuthService } = await import('./AuthService');
    
    try {
      const token = await AuthService.getAuthToken();
      
      return this.makeRequest<T>(endpoint, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (authError) {
      // Try to refresh token if auth failed
      try {
        const newToken = await AuthService.refreshToken();
        return this.makeRequest<T>(endpoint, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`,
          },
        });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        throw authError;
      }
    }
  }

  async registerDevice(data: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    const response = await this.makeRequest<APIResponse<RegisterDeviceResponse>>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    
    return response.data!;
  }

  async unregisterDevice(deviceId: string): Promise<void> {
    await this.makeAuthenticatedRequest<APIResponse>(
      `/auth/unregister`,
      {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      }
    );
  }

  async refreshToken(currentToken: string): Promise<RefreshTokenResponse> {
    const response = await this.makeRequest<APIResponse<RefreshTokenResponse>>(
      '/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
        },
      }
    );
    
    return response.data!;
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      await this.makeRequest<APIResponse>(
        '/auth/validate',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  async uploadVideoChunk(request: UploadChunkRequest): Promise<any> {
    try {
      // First, get upload URL from server
      const uploadUrlResponse = await this.makeAuthenticatedRequest<APIResponse<{
        uploadUrl: string;
        fields?: Record<string, string>;
      }>>('/upload/url', {
        method: 'POST',
        body: JSON.stringify({
          fileName: request.fileName,
          metadata: request.metadata,
        }),
      });

      const { uploadUrl, fields } = uploadUrlResponse.data!;

      // Prepare form data for upload
      const formData = new FormData();
      
      // Add any additional fields (for services like Cloudinary)
      if (fields) {
        Object.entries(fields).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      // Add the file
      formData.append('file', {
        uri: request.filePath,
        type: 'video/mp4',
        name: request.fileName,
      } as any);

      // Upload file with progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && request.onProgress) {
            const progress = (event.loaded / event.total) * 100;
            request.onProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (error) {
              resolve({ success: true });
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed due to network error'));
        });

        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      });

    } catch (error) {
      console.error('Upload chunk failed:', error);
      throw error;
    }
  }

  async getVideoList(): Promise<any[]> {
    const response = await this.makeAuthenticatedRequest<APIResponse<any[]>>('/videos');
    return response.data || [];
  }

  async deleteVideo(videoId: string): Promise<void> {
    await this.makeAuthenticatedRequest<APIResponse>(
      `/videos/${videoId}`,
      {
        method: 'DELETE',
      }
    );
  }

  async getDeviceStatus(): Promise<any> {
    const response = await this.makeAuthenticatedRequest<APIResponse<any>>('/device/status');
    return response.data;
  }

  async updateDeviceSettings(settings: Record<string, any>): Promise<void> {
    await this.makeAuthenticatedRequest<APIResponse>(
      '/device/settings',
      {
        method: 'PUT',
        body: JSON.stringify(settings),
      }
    );
  }

  // Test API connectivity
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeRequest<APIResponse>('/health');
      return response.success;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }

  // Get API status and version
  async getAPIStatus(): Promise<{
    status: string;
    version: string;
    uptime: number;
  }> {
    const response = await this.makeRequest<APIResponse<{
      status: string;
      version: string;
      uptime: number;
    }>>('/status');
    
    return response.data!;
  }
}

export const APIService = new APIServiceClass();