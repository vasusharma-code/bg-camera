package com.surveillance.app.camerax

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.SystemClock
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import com.surveillance.app.R
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraXRecorderService : LifecycleService() {
  companion object {
    const val ACTION_START = "com.surveillance.app.camerax.ACTION_START"
    const val ACTION_STOP = "com.surveillance.app.camerax.ACTION_STOP"
    const val EXTRA_QUALITY = "quality"
    const val EXTRA_RECORD_AUDIO = "record_audio"

    private const val CHANNEL_ID = "bg_camera_recording"
    private const val NOTIFICATION_ID = 3317

    @Volatile var isRecordingNow: Boolean = false
    @Volatile var latestOutputPath: String? = null
    @Volatile var latestError: String? = null
    @Volatile var lastStartUptimeMs: Long = 0L
  }

  private var cameraProvider: ProcessCameraProvider? = null
  private var recording: Recording? = null
  private var cameraExecutor: ExecutorService? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    cameraExecutor = Executors.newSingleThreadExecutor()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        val quality = intent.getStringExtra(EXTRA_QUALITY) ?: "720p"
        val recordAudio = intent.getBooleanExtra(EXTRA_RECORD_AUDIO, true)
        startForeground(NOTIFICATION_ID, buildNotification("Recording in background"))
        startCameraRecording(quality, recordAudio)
      }
      ACTION_STOP -> stopCameraRecording()
    }
    return START_STICKY
  }

  private fun startCameraRecording(qualityLabel: String, recordAudio: Boolean) {
    if (isRecordingNow) return

    latestError = null
    latestOutputPath = null
    lastStartUptimeMs = SystemClock.elapsedRealtime()

    val providerFuture = ProcessCameraProvider.getInstance(this)
    providerFuture.addListener({
      try {
        val provider = providerFuture.get()
        cameraProvider = provider
        provider.unbindAll()

        val quality = when (qualityLabel) {
          "1080p" -> Quality.FHD
          "480p" -> Quality.SD
          else -> Quality.HD
        }

        val recorder = Recorder.Builder()
          .setQualitySelector(QualitySelector.from(quality))
          .build()
        val videoCapture = VideoCapture.withOutput(recorder)

        provider.bindToLifecycle(
          this,
          CameraSelector.DEFAULT_BACK_CAMERA,
          videoCapture
        )

        val recordingsDir = File(
          getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: filesDir,
          "recordings"
        )
        if (!recordingsDir.exists()) {
          recordingsDir.mkdirs()
        }

        val fileName = "rec_native_${
          SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(Date())
        }.mp4"
        val outputFile = File(recordingsDir, fileName)
        val outputOptions = FileOutputOptions.Builder(outputFile).build()

        var pending = videoCapture.output.prepareRecording(this, outputOptions)
        if (recordAudio && hasRecordAudioPermission()) {
          pending = pending.withAudioEnabled()
        }

        val executor = cameraExecutor ?: Executors.newSingleThreadExecutor().also { cameraExecutor = it }
        recording = pending.start(executor) { event ->
          when (event) {
            is VideoRecordEvent.Start -> {
              isRecordingNow = true
            }
            is VideoRecordEvent.Finalize -> {
              isRecordingNow = false
              if (event.hasError()) {
                latestError = "Finalize error code: ${event.error}"
              } else {
                latestOutputPath = outputFile.absolutePath
              }
              recording = null
              cameraProvider?.unbindAll()
              stopForeground(STOP_FOREGROUND_REMOVE)
              stopSelf()
            }
          }
        }
      } catch (e: Exception) {
        latestError = e.message ?: "Failed to start CameraX recording"
        isRecordingNow = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
      }
    }, ContextCompat.getMainExecutor(this))
  }

  private fun stopCameraRecording() {
    try {
      recording?.stop()
    } catch (e: Exception) {
      latestError = e.message ?: "Stop failed"
      isRecordingNow = false
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  private fun hasRecordAudioPermission(): Boolean {
    return ContextCompat.checkSelfPermission(
      this,
      Manifest.permission.RECORD_AUDIO
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun buildNotification(content: String): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Bg Camera")
      .setContentText(content)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setSilent(true)
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Background Camera Recording",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "Foreground service channel for background camera recording"
    channel.setSound(null, null)
    manager.createNotificationChannel(channel)
  }

  override fun onDestroy() {
    super.onDestroy()
    cameraProvider?.unbindAll()
    cameraExecutor?.shutdown()
    cameraExecutor = null
  }
}

