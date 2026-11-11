package com.ggfinance.tv;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * GG Finance for the home TV: a full-screen WebView on the app's /tv page, plus two small bridges the page asks for.
 *
 *   window.GGTV.listen()  - the page's mic button. Listens with the TV's own speech service (Tamil) and answers by calling
 *                           window.__ggtvHeard(text), or window.__ggtvListenEnd() when nothing was heard.
 *   Back key              - asks the page first (window.__ggtvBack(): it clears the search / goes to its first screen and says true);
 *                           only when the page has nothing left to go back to does the app close.
 *
 * The page does everything else (pairing, search, the customer and payments); updating the website updates the TV.
 */
public class MainActivity extends Activity {

    private static final int REQ_MIC = 1001;
    private static final long RETRY_MS = 5000;
    private static final String SPEECH_LANGUAGE = "ta-IN";

    private WebView web;
    private SpeechRecognizer recognizer;
    private boolean listenAfterPermission = false;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable retryLoad = new Runnable() {
        @Override public void run() { if (web != null) web.loadUrl(BuildConfig.TV_URL); }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                       // the pairing token lives in the page's localStorage
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " GGFinanceTV/1");
        if (Build.VERSION.SDK_INT >= 29 && Build.VERSION.SDK_INT < 33) {
            s.setForceDark(WebSettings.FORCE_DARK_OFF);     // the page is white on purpose; do not let the TV invert it
        }

        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            web.addJavascriptInterface(new Bridge(), "GGTV");   // without a recogniser the page simply says there is no mic
        }

        final String host = Uri.parse(BuildConfig.TV_URL).getHost();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // stay on our own site; nothing else may be opened in this window
                return host == null || !host.equalsIgnoreCase(request.getUrl().getHost());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });

        web.loadUrl(BuildConfig.TV_URL);
        hideSystemBars();
    }

    /** No internet (or the server is waking up): say so in Tamil and try again every few seconds. */
    private void showOffline() {
        String html = "<html><body style='margin:0;background:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>"
                + "<div style='text-align:center;color:#5d6a63;font-size:4vw'>இணையம் இல்லை.<br>மீண்டும் முயல்கிறது…</div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        ui.removeCallbacks(retryLoad);
        ui.postDelayed(retryLoad, RETRY_MS);
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // ── Back: the page first ────────────────────────────────────────────────────────────────────────────────
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            web.evaluateJavascript("(function(){return !!(window.__ggtvBack && window.__ggtvBack());})()", value -> {
                if (!"true".equals(value)) finish();
            });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ── Speech ──────────────────────────────────────────────────────────────────────────────────────────────
    /** Called from the page (a JavaScript thread), so everything is moved to the UI thread. */
    private class Bridge {
        @JavascriptInterface
        public void listen() {
            runOnUiThread(MainActivity.this::startListening);
        }
    }

    private void startListening() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            listenAfterPermission = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        destroyRecognizer();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onResults(Bundle results) {
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (list != null && !list.isEmpty()) heard(list.get(0)); else listenEnded();
            }
            @Override public void onError(int error) { listenEnded(); }
            @Override public void onReadyForSpeech(Bundle params) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onPartialResults(Bundle partialResults) { }
            @Override public void onEvent(int eventType, Bundle params) { }
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, SPEECH_LANGUAGE);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, SPEECH_LANGUAGE);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        recognizer.startListening(intent);
    }

    private void heard(String text) {
        web.evaluateJavascript("window.__ggtvHeard && window.__ggtvHeard(" + JSONObject.quote(text) + ")", null);
    }

    private void listenEnded() {
        web.evaluateJavascript("window.__ggtvListenEnd && window.__ggtvListenEnd()", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_MIC) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted && listenAfterPermission) startListening(); else if (listenAfterPermission) listenEnded();
        listenAfterPermission = false;
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(retryLoad);
        destroyRecognizer();
        if (web != null) {
            web.removeJavascriptInterface("GGTV");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
