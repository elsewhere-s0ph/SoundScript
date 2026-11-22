package studio.littleelsewhere.soundscript;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {
    private Intent pending = null;

    @Override
    public void handleOnNewIntent(Intent intent) {
        pending = intent;
    }

    @PluginMethod
    public void takePendingShare(PluginCall call) {
        Intent intent = pending != null ? pending
                : (getActivity() != null ? getActivity().getIntent() : null);
        pending = null;
        JSObject ret = new JSObject();
        if (intent == null
                || (!Intent.ACTION_SEND.equals(intent.getAction())
                && !Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()))) {
            ret.put("none", true);
            call.resolve(ret);
            return;
        }
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) {
            ret.put("none", true);
            call.resolve(ret);
            return;
        }
        try {
            InputStream in = getContext().getContentResolver().openInputStream(uri);
            if (in == null) throw new Exception("stream null");
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int r;
            while ((r = in.read(buf)) > 0) bos.write(buf, 0, r);
            in.close();
            String mime = getContext().getContentResolver().getType(uri);
            if (mime == null) mime = intent.getType();
            if (mime == null) mime = "audio/ogg";
            String name = queryName(uri);
            if (name == null) name = "audio";
            ret.put("none", false);
            ret.put("name", name);
            ret.put("type", mime);
            ret.put("base64", Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
            if (getActivity() != null) getActivity().setIntent(new Intent());
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("none", true);
            ret.put("error", String.valueOf(e.getMessage()));
            call.resolve(ret);
        }
    }

    private String queryName(Uri uri) {
        try {
            Cursor c = getContext().getContentResolver().query(uri, null, null, null, null);
            if (c == null) return null;
            try {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0 && c.moveToFirst()) return c.getString(idx);
            } finally {
                c.close();
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}
