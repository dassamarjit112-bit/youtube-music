package com.youtubemusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Binder;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.session.MediaButtonReceiver;
import com.bumptech.glide.Glide;
import com.getcapacitor.JSObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * MusicPlayerService (NouTube Style)
 * Acts as a bridge between the System MediaSession and the React/WebView engine.
 * Instead of playing audio itself, it manages the persistent Foreground Service
 * that keeps the WebView alive and forwards lock-screen commands.
 */
public class MusicPlayerService extends Service {
    private static final String TAG = "MusicPlayerService";
    private static final int NOTIFICATION_ID = 888;
    private static final String CHANNEL_ID = "music_channel";

    private final IBinder binder = new MusicBinder();
    private MediaSessionCompat mediaSession;
    private NotificationManager notificationManager;
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();

    public class MusicBinder extends Binder {
        public MusicPlayerService getService() {
            return MusicPlayerService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        initializeMediaSession();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    private void initializeMediaSession() {
        mediaSession = new MediaSessionCompat(this, "MusicTubeService");
        
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() { broadcastCommand("play"); }
            @Override
            public void onPause() { broadcastCommand("pause"); }
            @Override
            public void onSkipToNext() { broadcastCommand("next"); }
            @Override
            public void onSkipToPrevious() { broadcastCommand("previous"); }
            @Override
            public void onSeekTo(long pos) {
                JSObject ret = new JSObject();
                ret.put("command", "seekTo");
                ret.put("position", pos / 1000.0);
                if (BackgroundPlaybackPlugin.instance != null) {
                    BackgroundPlaybackPlugin.instance.broadcastEvent("onCommand", ret);
                }
            }
        });

        mediaSession.setActive(true);
        updatePlaybackState(false, 0); // Initial state
    }

    private void broadcastCommand(String command) {
        if (BackgroundPlaybackPlugin.instance != null) {
            JSObject ret = new JSObject();
            ret.put("command", command);
            BackgroundPlaybackPlugin.instance.broadcastEvent("onCommand", ret);
        }
    }

    public void updateMetadata(String title, String artist, String imageUrl, long duration) {
        MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration * 1000);

        if (imageUrl != null && !imageUrl.isEmpty()) {
            artworkExecutor.execute(() -> {
                try {
                    Bitmap bitmap = Glide.with(this).asBitmap().load(imageUrl).submit(512, 512).get();
                    builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap);
                    mediaSession.setMetadata(builder.build());
                    updateNotification();
                } catch (Exception e) {
                    mediaSession.setMetadata(builder.build());
                }
            });
        } else {
            mediaSession.setMetadata(builder.build());
            updateNotification();
        }
    }

    public void updatePlaybackState(boolean isPlaying, long position) {
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | 
                        PlaybackStateCompat.ACTION_PAUSE | 
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT | 
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_SEEK_TO |
                        PlaybackStateCompat.ACTION_PLAY_PAUSE)
            .setState(isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, 
                      position * 1000, 1.0f);
        
        mediaSession.setPlaybackState(stateBuilder.build());
        updateNotification();
    }

    private void updateNotification() {
        if (notificationManager == null) {
            notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Music Playback", NotificationManager.IMPORTANCE_LOW);
            notificationManager.createNotificationChannel(channel);
        }

        MediaMetadataCompat metadata = mediaSession.getController().getMetadata();
        if (metadata == null) return;

        boolean isPlaying = mediaSession.getController().getPlaybackState().getState() == PlaybackStateCompat.STATE_PLAYING;

        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setLargeIcon(metadata.getBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART))
            .setContentTitle(metadata.getString(MediaMetadataCompat.METADATA_KEY_TITLE))
            .setContentText(metadata.getString(MediaMetadataCompat.METADATA_KEY_ARTIST))
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2))
            .addAction(android.R.drawable.ic_media_previous, "Previous", 
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS))
            .addAction(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, 
                isPlaying ? "Pause" : "Play", 
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PLAY_PAUSE))
            .addAction(android.R.drawable.ic_media_next, "Next", 
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT))
            .build();

        startForeground(NOTIFICATION_ID, notification);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        MediaButtonReceiver.handleIntent(mediaSession, intent);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.release();
        }
        artworkExecutor.shutdown();
        super.onDestroy();
    }
}
