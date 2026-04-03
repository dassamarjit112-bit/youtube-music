package com.youtubemusic.app;

import android.content.Intent;
import android.os.Build;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/**
 * MusicPlayerService (Media3 Implementation)
 *
 * Modern Android Architecture:
 * 1. Extends MediaSessionService - tells Android this is a music app.
 * 2. Manages an ExoPlayer instance natively.
 * 3. Handles Audio Focus, Lock Screen Controls, and Backgrounding automatically.
 */
public class MusicPlayerService extends MediaSessionService {

    private ExoPlayer player;
    private MediaSession mediaSession;

    @Override
    public void onCreate() {
        super.onCreate();
        initializePlayer();
    }

    private void initializePlayer() {
        // Set up AudioAttributes for media playback
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build();

        // Build the ExoPlayer instance
        player = new ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, true) // Handles Audio Focus automatically!
            .setHandleAudioBecomingNoisy(true)        // Pauses when headphones unplugged!
            .setWakeMode(C.WAKE_MODE_LOCAL)           // Keeps CPU awake during playback
            .build();

        // Create the MediaSession
        mediaSession = new MediaSession.Builder(this, player).build();
    }

    /**
     * Required by MediaSessionService to provide the session to external controllers
     * like the system's lock screen tray.
     */
    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    /**
     * Handle incoming Intents from the Capacitor layer.
     */
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && player != null) {
            String title  = intent.getStringExtra("title");
            String artist = intent.getStringExtra("artist");
            String url    = intent.getStringExtra("url"); // Final stream URL
            String action = intent.getStringExtra("action");

            if ("play".equals(action) && url != null) {
                MediaMetadata metadata = new MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .build();
                MediaItem item = new MediaItem.Builder()
                    .setUri(url)
                    .setMediaMetadata(metadata)
                    .build();
                player.setMediaItem(item);
                player.prepare();
                player.play();
            } else if ("pause".equals(action)) {
                player.pause();
            } else if ("resume".equals(action)) {
                player.play();
            } else if ("stop".equals(action)) {
                player.stop();
            }
        }
        return super.onStartCommand(intent, flags, startId);
    }

    /**
     * Survives task removal (swipe from Recents).
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (player != null && !player.getPlayWhenReady()) {
            // If we are paused, stop self on swipe
            stopSelf();
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
