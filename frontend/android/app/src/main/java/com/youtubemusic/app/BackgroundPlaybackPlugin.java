package com.youtubemusic.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.media3.exoplayer.ExoPlayer;

/**
 * BackgroundPlaybackPlugin
 * Capacitor bridge for the Native ExoPlayer engine.
 * Emits 'onPlayerUpdate' events to JavaScript.
 */
@CapacitorPlugin(name = "BackgroundPlayback")
public class BackgroundPlaybackPlugin extends Plugin {

    public static BackgroundPlaybackPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public void broadcastEvent(String eventName, JSObject data) {
        notifyListeners(eventName, data);
    }

    @PluginMethod
    public void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void playSong(PluginCall call) {
        String title  = call.getString("title",  "MusicTube");
        String artist = call.getString("artist", "Playing…");
        String url    = call.getString("url");
        String imageUrl = call.getString("imageUrl");

        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        intent.putExtra("action", "play");
        intent.putExtra("title",  title);
        intent.putExtra("artist", artist);
        intent.putExtra("url",    url);
        intent.putExtra("imageUrl", imageUrl);
        intent.putExtra("duration", (long)(call.getDouble("duration", 0.0) * 1000));

        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        intent.putExtra("action", "pause");
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        intent.putExtra("action", "resume");
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void next(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        intent.putExtra("action", "next");
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void previous(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        intent.putExtra("action", "previous");
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        Double position = call.getDouble("position");
        if (position == null) {
            call.reject("Position required");
            return;
        }
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        intent.putExtra("action", "seek");
        intent.putExtra("position", (long)(position * 1000));
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        ExoPlayer player = MusicPlayerService.getStaticPlayer();
        JSObject ret = new JSObject();
        if (player == null) {
            ret.put("isPlaying", false);
            ret.put("position", 0);
            ret.put("duration", 0);
        } else {
            ret.put("isPlaying", player.getPlayWhenReady());
            ret.put("position", (double)player.getCurrentPosition() / 1000.0);
            long duration = player.getDuration();
            ret.put("duration", (double)(duration < 0 ? 0 : duration) / 1000.0);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        // Handled via playSong usually, but kept for future use.
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        instance = null;
        super.handleOnDestroy();
    }
}
