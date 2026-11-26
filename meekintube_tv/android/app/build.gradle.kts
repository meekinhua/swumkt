plugins {
    id("com.android.application")
}

android {
    namespace = "org.swumkt.meekintube.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.swumkt.meekintube.tv"
        minSdk = 26          // Android 8.0: Mi Box S and every Xiaomi TV since
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // activity 1.13 / core 1.18 need compileSdk 36; core 1.19 would force 37
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.core:core:1.18.0")
    implementation("androidx.webkit:webkit:1.18.0")
}
