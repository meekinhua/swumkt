package org.swumkt.meekintube.tv;

import android.annotation.SuppressLint;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/**
 * meekinTube TV for Xiaomi / Android TV: one full-screen WebView on the hosted
 * 10-foot UI. The page is loaded from https://swumkt.org rather than bundled,
 * so the YouTube embed inside it gets a real https Referer (YouTube refuses
 * embeds without one, error 153) and UI fixes ship without a new APK.
 *
 * Native side only does what the page cannot: Back (never delivered to the
 * page on Android), media keys, keep-screen-on, pause on leaving, exit.
 */
public class MainActivity extends ComponentActivity {

    private static final String ORIGIN = "https://swumkt.org";
    private static final String HOST = "swumkt.org";
    private static final String START_URL = ORIGIN + "/api/meekintube/tv/?shell=android";

    private WebView web;
    private boolean offline;
    // Normally the hosted page. A debug build may be started with
    //   adb shell am start -n org.swumkt.meekintube.tv/.MainActivity --es url http://10.0.2.2:8791/tv/?shell=android
    // to test an undeployed page served from the development machine.
    private String startUrl = START_URL;
    private String origin = ORIGIN;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);   // chrome://inspect on debug builds
            String dev = getIntent().getStringExtra("url");
            if (dev != null && dev.startsWith("http://10.0.2.2:")) {
                Uri d = Uri.parse(dev);
                startUrl = dev;
                origin = d.getScheme() + "://" + d.getHost() + ":" + d.getPort();
            }
        }

        // targetSdk 36: KEYCODE_BACK no longer reaches onBackPressed/onKeyDown,
        // so Back must go through the dispatcher. The page decides what Back
        // means (close player, previous screen, exit dialog).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                back();
            }
        });

        buildWebView();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void buildWebView() {
        offline = false;
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b0b12"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                  // history, subscriptions, watch later
        s.setMediaPlaybackRequiresUserGesture(false);  // autoplay after a remote press
        s.setSupportZoom(false);
        s.setTextZoom(100);   // the page scales its own 1920x1080 stage; the TV's font scale would break it
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Client());
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        hideSystemBars();

        // Page -> app messages. Unlike addJavascriptInterface, this object is
        // injected only into frames from our origin, never into the YouTube frame.
        // (Old WebViews without it fall back to meekin:// navigations, see Client.)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "MeekinAndroid", Collections.singleton(origin),
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        if (isMainFrame) onPageMessage(message.getData());
                    });
        }

        web.loadUrl(startUrl);
        web.requestFocus();
    }

    private void back() {
        if (web == null || offline) {
            finish();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return !!(window.meekinBack&&window.meekinBack());}catch(e){return false;}})()",
                value -> {
                    if (!"true".equals(value)) finish();   // page not loaded: leave
                });
    }

    private void onPageMessage(String msg) {
        if (msg == null) return;
        switch (msg) {
            case "exit":
                finish();
                break;
            case "keepon:1":
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                break;
            case "keepon:0":
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                break;
            default:
                break;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // Media keys are not reliably turned into DOM key events by WebView,
        // so hand them to the page directly.
        String name = mediaKeyName(e.getKeyCode());
        if (name != null) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                js("window.meekinKey&&window.meekinKey('" + name + "')");
            }
            return true;
        }
        if (offline && e.getAction() == KeyEvent.ACTION_UP
                && (e.getKeyCode() == KeyEvent.KEYCODE_DPAD_CENTER || e.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
            retry();
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    private static String mediaKeyName(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "MediaPlay";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "MediaPause";
            case KeyEvent.KEYCODE_MEDIA_STOP: return "MediaStop";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "MediaFastForward";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "MediaRewind";
            case KeyEvent.KEYCODE_MEDIA_NEXT: return "MediaTrackNext";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "MediaTrackPrevious";
            case KeyEvent.KEYCODE_CHANNEL_UP: return "ChannelUp";
            case KeyEvent.KEYCODE_CHANNEL_DOWN: return "ChannelDown";
            default: return null;
        }
    }

    private void js(String script) {
        if (web != null && !offline) web.evaluateJavascript(script, null);
    }

    @Override
    protected void onPause() {
        // YouTube's terms forbid playing in the background
        js("window.meekinPause&&window.meekinPause()");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void showOffline(String detail) {
        if (web == null) return;
        offline = true;
        String html = "<html><head><meta charset='utf-8'></head>"
                + "<body style='margin:0;background:#0b0b12;color:#f4f4f8;font-family:sans-serif;"
                + "display:flex;align-items:center;justify-content:center;height:100vh;text-align:center'>"
                + "<div><div style='font-size:28px;font-weight:600'>เชื่อมต่อ meekinTube ไม่ได้</div>"
                + "<div style='margin-top:12px;font-size:18px;color:#a3a3b8'>" + detail + " แล้วกด OK เพื่อลองใหม่</div>"
                + "</div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private void retry() {
        if (web == null) return;
        offline = false;
        web.loadUrl(startUrl);
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            Uri u = request.getUrl();
            if ("meekin".equals(u.getScheme())) {
                // fallback channel from the page (meekin://exit, meekin://keepon/1);
                // honoured only while our own page is showing, and never navigated
                String cur = view.getUrl();
                if (cur != null && cur.startsWith(origin + "/")) {
                    String host = u.getHost(), path = u.getPath();
                    onPageMessage(path == null || path.length() <= 1 ? host : host + ":" + path.substring(1));
                }
                return true;
            }
            // stay on our own site; anything else (a stray link) is swallowed
            if (u.toString().startsWith(origin + "/")) return false;
            return !("https".equals(u.getScheme()) && HOST.equals(u.getHost()));
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline("ตรวจสอบอินเทอร์เน็ต");
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response != null && response.getStatusCode() >= 400) {
                showOffline("เซิร์ฟเวอร์ไม่พร้อม (" + response.getStatusCode() + ")");
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Returning false would kill the whole app. Drop the dead WebView and start a new one.
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) parent.removeView(view);
            view.destroy();
            if (view == web) {
                web = null;
                if (!isFinishing() && !isDestroyed()) buildWebView();
            }
            return true;
        }
    }
}
