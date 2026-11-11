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
 *   window.GGTV.listen() / stop() - the search bar, press-and-hold: listen() when OK goes down, stop() when it is let go.
 *                           A TV has no microphone of its own (only the remote has one), so unless the app's own recogniser really
 *                           hears, this opens the system voice screen (the same "Speak now" overlay as the TV's own search). It answers
 *                           by calling window.__ggtvHeard(text), window.__ggtvListenEnd() when nothing was heard, or window.__ggtvNoMic()
 *                           when this TV has no speech service at all. The remote's Google/mic key (when the TV hands it to the app) = hold-less listen.
 *   Back key              - asks the page first (window.__ggtvBack(): it clears the search / goes to its first screen and says true);
 *                           only when the page has nothing left to go back to does the app close.
 *
 * The page does everything else (pairing, search, the customer and payments); updating the website updates the TV.
 */
public class MainActivity extends Activity {

    private static final int REQ_MIC = 1001;
    private static final int REQ_SPEECH = 1002;
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

        web.addJavascriptInterface(new Bridge(), "GGTV");       // the page's mic button; listen() reports back when there is no speech service

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

    // ── The remote's own mic / Google key ──────────────────────────────────────────────────────────────────────
    /** Seen before the WebView gets it. Only TVs that hand this key to the foreground app deliver it; the page decides what to do (it listens when its search is open). */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int k = event.getKeyCode();
        if (k == KeyEvent.KEYCODE_SEARCH || k == KeyEvent.KEYCODE_ASSIST || k == KeyEvent.KEYCODE_VOICE_ASSIST) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0 && web != null) {
                web.evaluateJavascript("window.__ggtvMicKey && window.__ggtvMicKey()", null);
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
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
    // Press-and-hold: the page calls listen() when OK goes down and stop() when it is released.
    //   1) the app's own recogniser (a true hold: it stops when stop() is called) - only on TVs that have a speech service AND hear a mic;
    //      the first time it fails (or hears nothing twice in a row) it is switched off for good, and
    //   2) the system voice screen (RecognizerIntent) takes over: it listens to the remote's mic and ends by itself when you stop talking.
    /** Called from the page (a JavaScript thread), so everything is moved to the UI thread. */
    private class Bridge {
        @JavascriptInterface public void listen() { runOnUiThread(MainActivity.this::startListening); }
        @JavascriptInterface public void stop() { runOnUiThread(MainActivity.this::stopHold); }
    }

    private static final String PREFS = "ggtv";
    private static final String PREF_INAPP = "inapp";            // 0 = not tried yet, 1 = it hears, -1 = it does not: use the voice screen
    private boolean listening = false;
    private boolean recognizerReady = false;
    private boolean releasedEarly = false;
    private int silentRuns = 0;

    private int inAppState() { return getSharedPreferences(PREFS, MODE_PRIVATE).getInt(PREF_INAPP, 0); }
    private void setInAppState(int v) { getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(PREF_INAPP, v).apply(); }

    private void startListening() {
        if (listening) return;
        listening = true;
        if (inAppState() != -1 && SpeechRecognizer.isRecognitionAvailable(this)) listenInBackground(); else openVoiceScreen();
    }

    /** The button was let go: end the app's own recording now (the voice screen has its own end). */
    private void stopHold() {
        if (recognizer == null) return;
        if (recognizerReady) recognizer.stopListening(); else releasedEarly = true;   // let go before it was ready: stop as soon as it is
    }

    private void openVoiceScreen() {
        Intent speak = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        speak.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        speak.putExtra(RecognizerIntent.EXTRA_LANGUAGE, SPEECH_LANGUAGE);
        speak.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, SPEECH_LANGUAGE);
        speak.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        speak.putExtra(RecognizerIntent.EXTRA_PROMPT, "பெயரைச் சொல்லுங்கள்");
        try {
            startActivityForResult(speak, REQ_SPEECH);
        } catch (Exception e) {
            listening = false;
            noMic();                                              // no voice screen on this TV at all
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SPEECH) return;
        listening = false;
        ArrayList<String> list = (resultCode == RESULT_OK && data != null) ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
        if (list != null && !list.isEmpty() && list.get(0) != null && !list.get(0).trim().isEmpty()) heard(list.get(0)); else listenEnded();
    }

    private void listenInBackground() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            listenAfterPermission = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        destroyRecognizer();
        recognizerReady = false;
        releasedEarly = false;
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onResults(Bundle results) {
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (list != null && !list.isEmpty() && list.get(0) != null && !list.get(0).trim().isEmpty()) {
                    setInAppState(1);
                    silentRuns = 0;
                    listening = false;
                    heard(list.get(0));
                } else {
                    silentOrFailed(false);
                }
            }
            @Override public void onError(int error) {
                boolean heardNothing = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
                silentOrFailed(!heardNothing);                    // a real failure (no audio, no permission, busy, network...) vs. simply no words
            }
            @Override public void onReadyForSpeech(Bundle params) {
                recognizerReady = true;
                if (releasedEarly && recognizer != null) ui.postDelayed(() -> { if (recognizer != null) recognizer.stopListening(); }, 600);
            }
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
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 6000L);   // while OK is held, a pause does not end it
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 6000L);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        recognizer.startListening(intent);
    }

    /** The app's own recording gave no words. A real failure, or silence twice in a row before it ever worked, switches it off: the voice screen takes over. */
    private void silentOrFailed(boolean realFailure) {
        destroyRecognizer();
        boolean everWorked = inAppState() == 1;
        if (!everWorked && (realFailure || ++silentRuns >= 2)) {
            setInAppState(-1);
            openVoiceScreen();                                    // still listening = true: the voice screen answers instead
            return;
        }
        listening = false;
        listenEnded();
    }

    private void heard(String text) {
        web.evaluateJavascript("window.__ggtvHeard && window.__ggtvHeard(" + JSONObject.quote(text) + ")", null);
    }

    private void noMic() {
        web.evaluateJavascript("window.__ggtvNoMic && window.__ggtvNoMic()", null);
    }

    private void listenEnded() {
        web.evaluateJavascript("window.__ggtvListenEnd && window.__ggtvListenEnd()", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_MIC) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (listenAfterPermission) {
            if (granted) listenInBackground(); else { setInAppState(-1); openVoiceScreen(); }
        }
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
