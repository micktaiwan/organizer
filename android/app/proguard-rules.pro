# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Retrofit
-keepattributes Signature
-keepattributes Exceptions
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Keep Gson
-keepattributes *Annotation*
-keep class com.organizer.chat.data.model.** { *; }
-keep class com.organizer.chat.data.api.** { *; }

# Socket.io
-keep class io.socket.** { *; }
-keep class org.json.** { *; }

# WebRTC
-keep class org.webrtc.** { *; }
-keep class io.getstream.webrtc.** { *; }
