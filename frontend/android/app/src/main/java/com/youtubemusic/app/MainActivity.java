package com.youtubemusic.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity – Restored Capacitor Bridge.
 * 
 * Allows the React frontend to load while supporting 
 * the native BackgroundPlayback plugin.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Control media volume by default
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        
        // Register the background playback plugin
        registerPlugin(BackgroundPlaybackPlugin.class);
        
        super.onCreate(savedInstanceState);
        
        // Ensure WebView lets audio play automatically
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings s = webView.getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // CRITICAL: Un-pause the WebView so background audio contexts don't die
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.resumeTimers();
        }
    }
}
