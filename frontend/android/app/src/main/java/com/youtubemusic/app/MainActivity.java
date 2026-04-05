package com.youtubemusic.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity – fixed override signatures for Java/Android compatibility.
 *
 * Key fixes:
 * 1. onPause / onResume must be PUBLIC (not protected) to override BridgeActivity.
 * 2. resumeTimers() after super.onPause() keeps JavaScript (and YouTube IFrame)
 *    alive while the screen is off or another app is in front.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Force hardware volume buttons to control media volume
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        
        // Register Native Plugin
        registerPlugin(BackgroundPlaybackPlugin.class);
        super.onCreate(savedInstanceState);
        
        // Apply WebView settings immediately after bridge creation
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings s = webView.getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        // Keep settings updated in onStart as well
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }

    /**
     * CRITICAL: BridgeActivity.onPause() internally calls webView.onPause()
     * which suspends JavaScript timers – immediately killing the YouTube IFrame
     * player's audio context. Calling resumeTimers() right after undoes this.
     *
     * Must be PUBLIC to correctly override BridgeActivity.onPause().
     */
    @Override
    public void onPause() {
        super.onPause();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.resumeTimers(); // Un-pause JS so YouTube IFrame keeps playing
            webView.onResume();     // Keep audio pipeline alive
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
