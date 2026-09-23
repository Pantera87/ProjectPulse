# ProjectPulse - app-level R8/ProGuard rules (release build).
#
# Base optimization rules come from getDefaultProguardFile(
#   "proguard-android-optimize.txt"), and all dependencies in use
# (Compose, kotlinx-serialization, OkHttp, WorkManager, security-crypto)
# ship their own consumer rules, so no keep rules are required today.
#
# Add rules here only when a release build crashes from missing classes
# (e.g. java.lang.NoClassDefFoundError) or a library that relies on
# reflection needs its classes preserved.

# --- kotlinx.serialization ---
# Covered by consumer rules in kotlinx-serialization-json. If you enable
# @Serializable classes that are deserialized by name via Json.decodeFromString
# of a polymorphic hierarchy, add e.g.:
# -keep,includedescriptorclasses class com.pantera87.projectpulse.**$$serializer
# -keepclassmembers class com.pantera87.projectpulse.** { *** Companion; }
# -keepclassmembers @kotlinx.serialization.Serializable class ** {
#     *** Companion;
#     *** writeWith(...);
#     *** merge(...);
#     java.lang.Object copy(...);
# }

# --- androidx.security:security-crypto (Tink) ---
# Tink references error-prone annotations that are not on the runtime
# classpath. They are compile-time only, so it is safe to ignore them.
-dontwarn com.google.errorprone.annotations.**

# --- Reflection / JNI entry points ---
# None currently. Keep any class instantiated via Class.forName,
# registered in AndroidManifest.xml by name, or used from JNI here.
# -keep class com.pantera87.projectpulse.** { *; }
