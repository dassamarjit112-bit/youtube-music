package com.youtubemusic.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        // Allow media playback without user gesture and prevent pausing in background
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
