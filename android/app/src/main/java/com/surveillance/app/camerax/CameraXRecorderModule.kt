package com.surveillance.app.camerax

import android.content.Intent
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.Executors

class CameraXRecorderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CameraXRecorderModule"

  @ReactMethod
  fun startRecording(options: ReadableMap, promise: Promise) {
    try {
      val quality = if (options.hasKey("quality")) options.getString("quality") ?: "720p" else "720p"
      val recordAudio = if (options.hasKey("recordAudio")) options.getBoolean("recordAudio") else true

      CameraXRecorderService.latestError = null
      CameraXRecorderService.latestOutputPath = null

      val intent = Intent(reactContext, CameraXRecorderService::class.java).apply {
        action = CameraXRecorderService.ACTION_START
        putExtra(CameraXRecorderService.EXTRA_QUALITY, quality)
        putExtra(CameraXRecorderService.EXTRA_RECORD_AUDIO, recordAudio)
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(reactContext, intent)
      } else {
        reactContext.startService(intent)
      }

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CAMERAX_START_FAILED", e)
    }
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    try {
      val stopIntent = Intent(reactContext, CameraXRecorderService::class.java).apply {
        action = CameraXRecorderService.ACTION_STOP
      }
      reactContext.startService(stopIntent)

      Executors.newSingleThreadExecutor().execute {
        try {
          val minimumFinalizeUptime = CameraXRecorderService.lastStartUptimeMs + 800
          while (SystemClock.elapsedRealtime() < minimumFinalizeUptime) {
            Thread.sleep(50)
          }

          var attempts = 0
          while (CameraXRecorderService.isRecordingNow && attempts < 120) {
            Thread.sleep(100)
            attempts++
          }

          val latestError = CameraXRecorderService.latestError
          if (!latestError.isNullOrBlank()) {
            promise.reject("CAMERAX_STOP_FAILED", latestError)
            return@execute
          }

          val latestOutputPath = CameraXRecorderService.latestOutputPath
          if (latestOutputPath.isNullOrBlank()) {
            promise.reject("CAMERAX_NO_OUTPUT", "Native recorder stopped without output")
            return@execute
          }

          promise.resolve(latestOutputPath)
        } catch (e: Exception) {
          promise.reject("CAMERAX_STOP_FAILED", e)
        }
      }
    } catch (e: Exception) {
      promise.reject("CAMERAX_STOP_FAILED", e)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    val map = Arguments.createMap().apply {
      putBoolean("isRecording", CameraXRecorderService.isRecordingNow)
      putString("latestOutputPath", CameraXRecorderService.latestOutputPath)
      putString("latestError", CameraXRecorderService.latestError)
    }
    promise.resolve(map)
  }
}

