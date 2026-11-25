package studio.littleelsewhere.soundscript;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;

@CapacitorPlugin(name = "SelfUpdate")
public class SelfUpdatePlugin extends Plugin {
    private Long downloadId = null;
    private File target = null;
    private String expectedSha = null;
    private BroadcastReceiver receiver = null;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable poller = null;

    private boolean canInstallNow() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("versionName", pi.versionName == null ? "0.0.0" : pi.versionName);
            ret.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception e) {
            ret.put("versionName", "0.0.0");
            ret.put("versionCode", 0);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", canInstallNow());
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        expectedSha = call.getString("sha256");
        if (url == null) { call.reject("url mancante"); return; }
        if (!canInstallNow()) {
            JSObject r = new JSObject(); r.put("needPermission", true); call.resolve(r); return;
        }
        try {
            File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = getContext().getFilesDir();
            if (!dir.exists()) dir.mkdirs();
            target = new File(dir, "SoundScript-update.apk");
            if (target.exists()) target.delete();

            final DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("SoundScript");
            req.setDescription("Download aggiornamento");
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);
            req.setDestinationUri(Uri.fromFile(target));
            downloadId = dm.enqueue(req);

            receiver = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (downloadId == null || id != downloadId) return;
                    stopPoller();
                    DownloadManager.Query q = new DownloadManager.Query();
                    q.setFilterById(downloadId);
                    Cursor cur = dm.query(q);
                    int status = -1;
                    if (cur != null && cur.moveToFirst()) {
                        status = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        cur.close();
                    }
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        verifyAndInstall();
                    } else {
                        emitState("error", "Download fallito (status " + status + ")");
                    }
                }
            };
            ContextCompat.registerReceiver(getContext(), receiver,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    ContextCompat.RECEIVER_EXPORTED);
            startPoller(dm);
            JSObject r = new JSObject(); r.put("started", true); call.resolve(r);
        } catch (Exception e) {
            call.reject("download: " + e.getMessage());
        }
    }

    private void startPoller(final DownloadManager dm) {
        poller = new Runnable() {
            @Override public void run() {
                if (downloadId == null) return;
                DownloadManager.Query q = new DownloadManager.Query();
                q.setFilterById(downloadId);
                Cursor c = dm.query(q);
                if (c != null && c.moveToFirst()) {
                    long done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    c.close();
                    JSObject p = new JSObject();
                    p.put("bytes", done);
                    p.put("total", total);
                    p.put("percent", total > 0 ? (int) (done * 100 / total) : 0);
                    notifyListeners("progress", p);
                    if (status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING) {
                        handler.postDelayed(this, 400);
                    }
                }
            }
        };
        handler.post(poller);
    }

    private void stopPoller() { if (poller != null) handler.removeCallbacks(poller); poller = null; }

    private void verifyAndInstall() {
        try {
            if (expectedSha != null && !expectedSha.isEmpty()) {
                emitState("verifying");
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                FileInputStream in = new FileInputStream(target);
                byte[] buf = new byte[65536]; int r;
                while ((r = in.read(buf)) > 0) md.update(buf, 0, r);
                in.close();
                StringBuilder sb = new StringBuilder();
                for (byte b : md.digest()) sb.append(String.format("%02x", b));
                if (!sb.toString().equalsIgnoreCase(expectedSha.trim())) {
                    target.delete();
                    emitState("error", "Checksum non corrispondente: installazione annullata.");
                    return;
                }
            }
            Uri uri = FileProvider.getUriForFile(getContext(),
                    getContext().getPackageName() + ".fileprovider", target);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            emitState("installing");
        } catch (Exception e) {
            emitState("error", "Install: " + e.getMessage());
        }
    }

    private void emitState(String state) { emitState(state, null); }

    private void emitState(String state, String message) {
        JSObject o = new JSObject();
        o.put("state", state);
        if (message != null) o.put("message", message);
        notifyListeners("state", o);
    }

    @Override
    public void handleOnDestroy() {
        stopPoller();
        if (receiver != null) {
            try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
            receiver = null;
        }
    }
}
