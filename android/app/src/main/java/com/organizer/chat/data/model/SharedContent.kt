package com.organizer.chat.data.model

import android.net.Uri

sealed class SharedContent {
    data class Text(val text: String) : SharedContent()
    data class SingleImage(val uri: Uri) : SharedContent()
    data class MultipleImages(val uris: List<Uri>) : SharedContent()
}
