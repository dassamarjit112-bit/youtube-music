package com.youtubemusic.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BackgroundPlaybackPlugin
 *
 * Capacitor bridge that lets JavaScript control the Native ExoPlayer
 * inside MusicPlayerService.
 */
@CapacitorPlugin(name = "BackgroundPlayback")
public class BackgroundPlaybackPlugin extends Plugin {

    @PluginMethod
    public void startService(PluginCall call) {
        // Legacy compat (just ensures service is running)
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
        String url    = call.getString("url"); // Final stream URL

        if (url == null || url.isEmpty()) {
            call.reject("URL is required for native playback");
            return;
        }

        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        intent.putExtra("action", "play");
        intent.putExtra("title",  title);
        intent.putExtra("artist", artist);
        intent.putExtra("url",    url);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }

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
    public void stopService(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        // Media3 handles metadata automatically if the URL changes, 
        // but this keeps the plugin consistent with the previous version.
        call.resolve();
    }
}
