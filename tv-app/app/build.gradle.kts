plugins {
    id("com.android.application")
}

// The page the TV opens. Override when building:  gradle assembleRelease -PtvUrl=https://your-host/tv
val tvUrl: String = (project.findProperty("tvUrl") as String?)?.takeIf { it.isNotBlank() }
    ?: "https://gg-fin-frontend-dev.up.railway.app/tv"

android {
    namespace = "com.ggfinance.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ggfinance.tv"
        minSdk = 24            // Android 7 - older TVs still in homes
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "TV_URL", "\"$tvUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // A sideloaded app does not need a store key; the standard debug key signs it so it installs. It is NOT debuggable.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
