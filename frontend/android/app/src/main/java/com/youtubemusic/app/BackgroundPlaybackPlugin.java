package com.youtubemusic.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Build;
import android.os.IBinder;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BackgroundPlaybackPlugin (NouTube Style)
 * Connects the React/WebView engine to the native NouService-inspired bridge.
 */
@CapacitorPlugin(name = "BackgroundPlayback")
public class BackgroundPlaybackPlugin extends Plugin {

    public static BackgroundPlaybackPlugin instance;
    private MusicPlayerService musicService;
    private boolean isBound = false;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            MusicPlayerService.MusicBinder binder = (MusicPlayerService.MusicBinder) service;
            musicService = binder.getService();
            isBound = true;
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            musicService = null;
            isBound = false;
        }
    };

    @Override
    public void load() {
        super.load();
        instance = this;
        bindToService();
    }

    private void bindToService() {
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        getContext().bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }

    public void broadcastEvent(String eventName, JSObject data) {
        notifyListeners(eventName, data);
    }

    @PluginMethod
    public void notify(PluginCall call) {
        String title = call.getString("title", "MusicTube");
        String artist = call.getString("artist", "Playing…");
        String imageUrl = call.getString("imageUrl");
        long duration = (long) call.getDouble("duration", 0.0);

        if (isBound && musicService != null) {
            musicService.updateMetadata(title, artist, imageUrl, duration);
            call.resolve();
        } else {
            call.reject("Music service not bound");
        }
    }

    @PluginMethod
    public void notifyProgress(PluginCall call) {
        boolean isPlaying = call.getBoolean("isPlaying", false);
        double position = call.getDouble("position", 0.0);

        if (isBound && musicService != null) {
            musicService.updatePlaybackState(isPlaying, (long) position);
            call.resolve();
        } else {
            call.reject("Music service not bound");
        }
    }

    // Legacy method stubs to prevent build errors in App.tsx before it is fully refactored
    @PluginMethod
    public void startService(PluginCall call) { call.resolve(); }
    @PluginMethod
    public void playSong(PluginCall call) { call.resolve(); }
    @PluginMethod
    public void pause(PluginCall call) { call.resolve(); }
    @PluginMethod
    public void resume(PluginCall call) { call.resolve(); }
    @PluginMethod
    public void stopService(PluginCall call) { 
        getContext().unbindService(serviceConnection);
        Intent intent = new Intent(getContext(), MusicPlayerService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (isBound) {
            getContext().unbindService(serviceConnection);
        }
        instance = null;
        super.handleOnDestroy();
    }
}
