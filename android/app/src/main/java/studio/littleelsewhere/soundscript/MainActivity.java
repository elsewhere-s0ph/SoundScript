package studio.littleelsewhere.soundscript;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ShareReceiverPlugin.class);
    registerPlugin(SelfUpdatePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
