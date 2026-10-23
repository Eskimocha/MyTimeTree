package com.mytimetree.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must register before BridgeActivity initializes the bridge.
        registerPlugin(ICloudDbPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
